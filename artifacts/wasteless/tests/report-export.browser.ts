import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const appRoot = resolve(import.meta.dirname, '..');
const chromiumPath = '/repl/tools/bin/chromium';

type CdpResponse = {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type CdpEvent = {
  method: string;
  params?: Record<string, unknown>;
};

type CdpSocket = WebSocket & {
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
};

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  if (!port) throw new Error('Could not find a free port.');
  return port;
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForHttp(url: string): Promise<void> {
  await waitFor(`the app at ${url}`, async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  });
}

function startApp(port: number): ChildProcess {
  return spawn('pnpm', ['run', 'dev'], {
    cwd: appRoot,
    env: {
      ...process.env,
      BASE_PATH: '/',
      PORT: String(port),
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

async function connectToChromium(debugPort: number): Promise<CdpSocket> {
  let webSocketUrl: string | undefined;
  await waitFor('Chromium remote debugging', async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!response.ok) return false;
      const pages = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      webSocketUrl = pages.find((page) => page.type === 'page')?.webSocketDebuggerUrl;
      return Boolean(webSocketUrl);
    } catch {
      return false;
    }
  });

  if (!webSocketUrl) throw new Error('Chromium did not expose a debugging WebSocket.');
  const socket = new WebSocket(webSocketUrl) as CdpSocket;
  await new Promise<void>((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise());
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium.')));
  });
  return socket;
}

function createCdpClient(socket: CdpSocket) {
  let nextId = 1;
  const pending = new Map<number, { resolve: (response: CdpResponse) => void; reject: (error: Error) => void }>();
  const events: CdpEvent[] = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data) as CdpResponse & CdpEvent;
    if (typeof message.id === 'number') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message ?? 'Chrome DevTools Protocol request failed.'));
      } else {
        request.resolve(message);
      }
      return;
    }
    events.push(message);
  });

  const command = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<CdpResponse>((resolvePromise, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolvePromise, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const waitForEvent = async (method: string, timeoutMs = 5_000): Promise<CdpEvent> => {
    const existing = events.findIndex((event) => event.method === method);
    if (existing >= 0) return events.splice(existing, 1)[0];
    await waitFor(`${method} event`, async () => events.some((event) => event.method === method), timeoutMs);
    const index = events.findIndex((event) => event.method === method);
    if (index < 0) throw new Error(`Did not receive ${method}.`);
    return events.splice(index, 1)[0];
  };

  const evaluate = async <T>(expression: string): Promise<T> => {
    const response = await command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const result = response.result?.result as { value?: T; description?: string; type?: string } | undefined;
    if (!result || !('value' in result)) {
      throw new Error(`Browser evaluation returned no value: ${result?.description ?? result?.type ?? 'unknown result'}`);
    }
    return result.value as T;
  };

  return { command, evaluate, waitForEvent };
}

async function run() {
  const appPort = await getFreePort();
  const debugPort = await getFreePort();
  const downloadDirectory = await mkdtemp(join(tmpdir(), 'wasteless-download-'));
  const browserDirectory = await mkdtemp(join(tmpdir(), 'wasteless-browser-'));
  const app = startApp(appPort);
  let browser: ChildProcess | undefined;
  let socket: CdpSocket | undefined;

  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    browser = spawn(chromiumPath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${browserDirectory}`,
      'about:blank',
    ], { detached: true, stdio: 'ignore' });
    socket = await connectToChromium(debugPort);
    const cdp = createCdpClient(socket);

    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDirectory,
    });
    await cdp.command('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });

    await waitFor('the sample result to render', async () =>
      cdp.evaluate<boolean>(
        `document.readyState === 'complete' && Boolean(document.querySelector('[data-testid="button-sample-chair"]'))`,
      ),
    );
    await cdp.evaluate<boolean>(
      `(() => { document.querySelector('[data-testid="button-sample-chair"]')?.click(); return true; })()`,
    );
    await waitFor('the complete report to render', async () =>
      cdp.evaluate<boolean>(
        `Boolean(document.querySelector('[data-testid="section-analysis-result"]'))`,
      ),
    );

    const screenState = await cdp.evaluate<{
      pdf: { text: string; visible: boolean };
      txt: { text: string; visible: boolean };
      reportText: string;
    }>(`(() => {
      const report = document.querySelector('[data-testid="section-analysis-result"]');
      const controlState = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return { text: '', visible: false };
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          text: element.innerText,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        };
      };
      return {
        pdf: controlState('[data-testid="button-export-pdf"]'),
        txt: controlState('[data-testid="button-download-txt"]'),
        reportText: report?.textContent ?? '',
      };
    })()`); 

    assert.equal(screenState.pdf.visible, true, 'Save as PDF should be visible on a complete report.');
    assert.equal(screenState.pdf.text, 'Save as PDF');
    assert.equal(screenState.txt.visible, true, 'Download TXT should be visible on a complete report.');
    assert.equal(screenState.txt.text, 'Download TXT');
    assert.match(screenState.reportText, /wooden chair/i);
    assert.match(screenState.reportText, /What to do/i);

    await cdp.evaluate<boolean>(
      `(() => { document.querySelector('[data-testid="button-download-txt"]')?.click(); return true; })()`,
    );
    await waitFor('the TXT download', async () => (await readdir(downloadDirectory)).some((file) => file.endsWith('.txt')));
    const downloadedFile = (await readdir(downloadDirectory)).find((file) => file.endsWith('.txt'));
    if (!downloadedFile) throw new Error('The TXT download did not produce a file.');
    const downloadedText = await readFile(join(downloadDirectory, downloadedFile), 'utf8');
    assert.match(downloadedFile, /^wasteless-wooden-chair-action-plan\.txt$/);
    assert.match(downloadedText, /WasteLess action plan/);
    assert.match(downloadedText, /Recommendation: Reuse/);
    assert.match(downloadedText, /Action steps:/);
    assert.match(downloadedText, /Press on the seat/);

    const printCalled = await cdp.evaluate<boolean>(`(() => {
      let called = false;
      window.print = () => { called = true; };
      document.querySelector('[data-testid="button-export-pdf"]')?.click();
      return called;
    })()`);
    assert.equal(printCalled, true, 'Save as PDF should invoke the browser print flow.');

    await cdp.command('Emulation.setEmulatedMedia', { media: 'print' });
    const printState = await cdp.evaluate<{
      controlsDisplay: string;
      hintDisplay: string;
      reportVisibility: string;
      headingVisibility: string;
      reportText: string;
    }>(`(() => {
      const report = document.querySelector('[data-testid="section-analysis-result"]');
      const controls = document.querySelector('[data-testid="button-export-pdf"]')?.closest('.no-print');
      const hint = document.querySelector('[data-testid="button-export-pdf"]')?.parentElement?.nextElementSibling;
      const style = (element) => element ? getComputedStyle(element) : null;
      return {
        controlsDisplay: style(controls)?.display ?? 'missing',
        hintDisplay: style(hint)?.display ?? 'missing',
        reportVisibility: style(report)?.visibility ?? 'missing',
        headingVisibility: style(document.querySelector('[data-testid="text-best-option"]'))?.visibility ?? 'missing',
        reportText: report?.textContent ?? '',
      };
    })()`);

    assert.equal(printState.controlsDisplay, 'none', 'Export controls should be hidden when printing.');
    assert.equal(printState.hintDisplay, 'none', 'The PDF instruction should be hidden when printing.');
    assert.equal(printState.reportVisibility, 'visible', 'The report should remain visible when printing.');
    assert.equal(printState.headingVisibility, 'visible', 'The recommendation should remain visible when printing.');
    assert.match(printState.reportText, /Reuse/);
    assert.match(printState.reportText, /wooden chair/);
    assert.match(printState.reportText, /Is the frame sound/);

    console.log('Browser report export checks passed.');
  } finally {
    socket?.close();
    if (browser?.pid) process.kill(-browser.pid, 'SIGTERM');
    if (app.pid) process.kill(-app.pid, 'SIGTERM');
    await Promise.allSettled([
      rm(downloadDirectory, { recursive: true, force: true }),
      rm(browserDirectory, { recursive: true, force: true }),
    ]);
    if (app.exitCode === null) {
      await new Promise<void>((resolvePromise) => {
        app.once('exit', () => resolvePromise());
        setTimeout(resolvePromise, 2_000);
      });
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});