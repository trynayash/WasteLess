import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CameraCapture } from '@/components/camera-capture';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isAcceptedImageType, rejectIfTooLarge, resizeImage, type MediaType } from '@/lib/image';
import { SAMPLE_META, SAMPLE_RESULTS, type SampleId } from '@/lib/fixtures';
import {
  CONDITIONS,
  ITEM_KINDS,
  recommendFromKind,
  type ItemKind,
  type VisibleCondition,
} from '@/lib/recommend';
import NotFound from '@/pages/not-found';
import { useAnalyzeImage, type IdentifiedAnalysis, type UnidentifiedAnalysis } from '@workspace/api-client-react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Camera,
  Circle,
  CircleHelp,
  Download,
  FileText,
  LoaderCircle,
  Printer,
  Recycle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type ResultSource = 'photo' | 'manual' | 'sample';
type OptionType = IdentifiedAnalysis['best_option'];

const OPTION_COPY: Record<OptionType, { label: string; line: string }> = {
  reuse: { label: 'Reuse', line: 'Give it another job.' },
  donate: { label: 'Donate', line: 'Pass it to someone who can use it.' },
  sell: { label: 'Sell', line: 'It may still have value.' },
  recycle: { label: 'Recycle', line: 'Keep the material in circulation.' },
};

const LOADING_STEPS = [
  'Identifying it',
  'Thinking beyond the bin',
  'Finding practical options',
  'Checking for safety',
];

function messageFromError(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return "We couldn't check this item.";
  }
  const data = error.data;
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  return "We couldn't check this item.";
}

function sourceNote(source: ResultSource): string {
  if (source === 'manual') {
    return 'Based on what you selected, not on an automatic reading of the photo.';
  }
  if (source === 'sample') {
    return 'Sample result for checking the interface. No photo was analyzed.';
  }
  return 'Based on what is visible in your photo. A photo cannot confirm hidden condition.';
}

function Home() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [imageRequest, setImageRequest] = useState<{ image: string; media_type: MediaType } | null>(null);
  const [identified, setIdentified] = useState<IdentifiedAnalysis | null>(null);
  const [unidentified, setUnidentified] = useState<UnidentifiedAnalysis | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>('photo');
  const [localError, setLocalError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [kind, setKind] = useState<ItemKind>('furniture');
  const [condition, setCondition] = useState<VisibleCondition>('usable');
  const analyzeImage = useAnalyzeImage();
  const autoAnalyzeRef = useRef(false);

  useEffect(() => {
    if (identified || unidentified || analysisError || showManual) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [identified, unidentified, analysisError, showManual]);

  const clearOutcome = () => {
    setIdentified(null);
    setUnidentified(null);
    setAnalysisError(null);
    setShowManual(false);
  };

  const applyPreparedImage = (prepared: { image: string; media_type: MediaType }, name: string) => {
    clearOutcome();
    setLocalError(null);
    setPreview(prepared.image);
    setFilename(name);
    setImageRequest(prepared);
    autoAnalyzeRef.current = true;
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearOutcome();
    setLocalError(null);
    const sizeError = rejectIfTooLarge(file);
    if (sizeError) {
      setPreview(null);
      setImageRequest(null);
      setFilename(null);
      setLocalError(sizeError);
      return;
    }
    const type = file.type.toLowerCase();
    if (type && !type.startsWith('image/')) {
      setPreview(null);
      setImageRequest(null);
      setFilename(null);
      setLocalError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (type && !isAcceptedImageType(type)) {
      setPreview(null);
      setImageRequest(null);
      setFilename(null);
      setLocalError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    try {
      const prepared = await resizeImage(file);
      applyPreparedImage(prepared, file.name || 'Selected photo');
    } catch (error) {
      setPreview(null);
      setImageRequest(null);
      setFilename(null);
      setLocalError(error instanceof Error ? error.message : 'The image could not be prepared.');
    }
  };

  const runAnalysis = useCallback(() => {
    if (!imageRequest || analyzeImage.isPending) return;
    setLocalError(null);
    clearOutcome();
    analyzeImage.mutate(
      { data: imageRequest },
      {
        onSuccess: (response) => {
          if (!response.success) {
            setAnalysisError(response.error);
            setShowManual(false);
            return;
          }
          setAnalysisError(null);
          if (response.data.identified) {
            setResultSource('photo');
            setIdentified(response.data);
            setShowManual(false);
            return;
          }
          setUnidentified(response.data);
          setShowManual(false);
        },
        onError: (error) => {
          setAnalysisError(messageFromError(error));
          setShowManual(false);
        },
      },
    );
  }, [analyzeImage, imageRequest]);

  useEffect(() => {
    if (!autoAnalyzeRef.current || !imageRequest) return;
    autoAnalyzeRef.current = false;
    runAnalysis();
  }, [imageRequest, runAnalysis]);

  const reset = () => {
    setPreview(null);
    setFilename(null);
    setImageRequest(null);
    setLocalError(null);
    clearOutcome();
    setKind('furniture');
    setCondition('usable');
    setCameraOpen(false);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const openSample = (id: SampleId) => {
    clearOutcome();
    setLocalError(null);
    setResultSource('sample');
    if (id === 'unknown') {
      setUnidentified(SAMPLE_RESULTS.unknown);
      return;
    }
    setIdentified(SAMPLE_RESULTS[id]);
  };

  const applyManual = () => {
    setAnalysisError(null);
    setUnidentified(null);
    setResultSource('manual');
    setIdentified(recommendFromKind(kind, condition));
    setShowManual(false);
  };

  return (
    <main className="app-shell min-h-[100dvh] overflow-x-hidden px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col lg:max-w-5xl">
        <header className="flex items-center justify-between border-b border-border/80 pb-4">
          <button type="button" onClick={reset} className="flex items-center gap-3 rounded-lg text-left">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              <Recycle size={19} strokeWidth={2.1} />
            </span>
            <span className="font-serif text-xl leading-none tracking-tight">WasteLess</span>
          </button>
        </header>

        <section className="rise-in pb-8 pt-8 sm:pb-10 sm:pt-10 lg:grid lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:gap-14 lg:pb-14 lg:pt-16" aria-labelledby="page-title">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
              Before it leaves the house
            </p>
            <h1
              id="page-title"
              className="mt-4 max-w-xl font-serif text-[clamp(2.2rem,9vw,5.6rem)] leading-[.92] tracking-[-.05em]"
            >
              Don&apos;t throw it away yet.
            </h1>
            <p className="mt-5 max-w-md text-base font-medium leading-7 text-foreground sm:text-lg">
              Take a photo. Find its second life.
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              One clear next step: reuse, donate, sell, or recycle — plus what to check before you act.
            </p>
            <OutcomeRow className="mt-6 hidden lg:flex" />
          </div>

          <section
            className="rise-in-delayed relative mt-8 rounded-2xl border border-border bg-card p-4 shadow-md sm:p-6 lg:mt-0"
            aria-labelledby="upload-heading"
          >
            <div className="paper-grid pointer-events-none absolute inset-0 rounded-2xl opacity-20" aria-hidden="true" />
            <div className="relative">
              <h2 id="upload-heading" className="text-lg font-semibold tracking-tight">
                What are you deciding about?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Take a photo with your camera, or choose one you already have.
              </p>

              <label htmlFor="image-upload" className="sr-only">
                Upload an image
              </label>
              <input
                ref={uploadInputRef}
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="sr-only"
                data-testid="input-upload-image"
              />

              {!preview ? (
                <>
                  <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError(null);
                        setCameraOpen(true);
                      }}
                      data-testid="button-take-photo"
                      className="group flex min-h-44 cursor-pointer flex-col items-start justify-between rounded-xl bg-primary p-5 text-left text-primary-foreground transition-transform duration-200 active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:shadow-lg"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/25 bg-primary-foreground/10">
                        <Camera size={22} strokeWidth={1.8} />
                      </span>
                      <span>
                        <span className="block text-base font-semibold">Take a photo</span>
                        <span className="mt-1 block text-xs text-primary-foreground/70">Opens your camera with permission</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      data-testid="button-upload-image"
                      className="group flex min-h-44 cursor-pointer flex-col items-start justify-between rounded-xl border border-dashed border-primary/35 bg-secondary/35 p-5 text-left transition-colors duration-200 active:scale-[0.98] sm:hover:bg-secondary/65"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-primary">
                        <Upload size={21} strokeWidth={1.8} />
                      </span>
                      <span>
                        <span className="block text-base font-semibold">Upload an image</span>
                        <span className="mt-1 block text-xs text-muted-foreground">From your gallery or files</span>
                      </span>
                    </button>
                  </div>
                  <OutcomeRow className="mt-5 lg:hidden" />
                  <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                    JPG, PNG, or WebP · up to 10 MB · one object per photo works best
                  </p>
                </>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-border bg-muted/40">
                  <div className="relative flex min-h-52 items-center justify-center bg-secondary/25 p-3">
                    <img
                      src={preview}
                      alt="Selected object preview"
                      data-testid="img-selected-preview"
                      className="max-h-64 w-full rounded-lg object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-4 border-t border-border bg-card p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" data-testid="text-selected-filename">
                        {filename}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Resized in your browser and sent as a JPEG copy.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={reset}
                        data-testid="button-reset-image"
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw size={14} /> Remove image
                      </button>
                      <button
                        type="button"
                        onClick={runAnalysis}
                        disabled={analyzeImage.isPending}
                        data-testid="button-analyze"
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      >
                        {analyzeImage.isPending ? (
                          <>
                            <LoaderCircle size={16} className="animate-spin" /> Looking
                          </>
                        ) : (
                          <>
                            Analyze again <ArrowRight size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {localError && (
                <div
                  role="alert"
                  data-testid="status-error"
                  className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{localError}</span>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="pb-6" aria-labelledby="samples-heading">
          <h2 id="samples-heading" className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">
            Sample results
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These do not call the analysis service. They only show the result screens.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-4">
            {SAMPLE_META.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => openSample(sample.id)}
                data-testid={`button-sample-${sample.id}`}
                className="min-h-16 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors active:bg-muted/70 sm:hover:bg-muted/70"
              >
                <span className="block text-sm font-semibold">{sample.label}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{sample.note}</span>
              </button>
            ))}
          </div>
        </section>

        <div ref={resultRef} />

        {analyzeImage.isPending && <LoadingPanel />}

        {analysisError && !analyzeImage.isPending && !showManual && (
          <section
            className="rise-in rounded-2xl border border-destructive/25 bg-card p-5 shadow-sm sm:p-6"
            role="alert"
            data-testid="status-analysis-error"
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">We couldn&apos;t check this item.</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{analysisError}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={runAnalysis}
                    data-testid="button-retry-analysis"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    <RefreshCw size={15} /> Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManual(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"
                  >
                    Choose the item type
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {unidentified && !analyzeImage.isPending && !showManual && (
          <section
            className="rise-in rounded-2xl border border-accent/35 bg-card p-6 shadow-sm"
            data-testid="status-unidentified"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <CircleHelp size={19} />
              </div>
              <div>
                <p className="font-semibold">I&apos;m not sure what this is.</p>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  {unidentified.reason || 'Try another photo with better lighting or a closer view.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    data-testid="button-try-again"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold"
                  >
                    <RefreshCw size={15} /> Try another photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManual(true);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
                  >
                    Choose the item type
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {showManual && !identified && !analyzeImage.isPending && (
          <ManualPanel
            kind={kind}
            condition={condition}
            onKind={setKind}
            onCondition={setCondition}
            onSubmit={applyManual}
            onCancel={
              showManual && !unidentified
                ? () => {
                    setShowManual(false);
                  }
                : undefined
            }
          />
        )}

        {identified && !analyzeImage.isPending && (
          <ResultPanel
            data={identified}
            source={resultSource}
            preview={resultSource === 'photo' ? preview : null}
            onReset={reset}
          />
        )}

        <footer className="safe-bottom mt-auto border-t border-border/80 py-8 text-xs leading-6 text-muted-foreground">
          <p>Your photo is used to analyze the item. Don&apos;t upload sensitive personal information.</p>
          <p className="mt-2">
            WasteLess provides automated guidance and is not a definitive determination of an item&apos;s safety, value,
            or recyclability.
          </p>
        </footer>
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(payload) => applyPreparedImage(payload, payload.filename)}
        onError={(message) => setLocalError(message)}
      />
    </main>
  );
}

function OutcomeRow({ className }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground ${className ?? ''}`}>
      {(['reuse', 'donate', 'sell', 'recycle'] as const).map((option, index) => (
        <span key={option} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          <span>{OPTION_COPY[option].label}</span>
        </span>
      ))}
    </p>
  );
}

function LoadingPanel() {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setStep((current) => (current + 1) % LOADING_STEPS.length);
    }, 1400);
    const elapsedTimer = window.setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(elapsedTimer);
    };
  }, []);

  const progress = Math.min(95, 12 + step * 22 + Math.min(elapsed * 3, 24));

  return (
    <section
      className="rise-in rounded-2xl border border-border bg-card p-6 shadow-sm"
      data-testid="status-loading"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Analyzing your photo…</p>
          <p className="mt-2 text-sm text-muted-foreground">{LOADING_STEPS[step]}</p>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{elapsed}s</span>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <ol className="mt-6 space-y-2">
        {LOADING_STEPS.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2 text-sm ${index <= step ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {index === step ? (
              <LoaderCircle size={14} className="animate-spin text-primary" />
            ) : index < step ? (
              <Circle size={14} className="fill-primary/20 text-primary" />
            ) : (
              <Circle size={14} />
            )}
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ManualPanel({
  kind,
  condition,
  onKind,
  onCondition,
  onSubmit,
  onCancel,
}: {
  kind: ItemKind;
  condition: VisibleCondition;
  onKind: (value: ItemKind) => void;
  onCondition: (value: VisibleCondition) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <section className="rise-in mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-testid="section-manual-fallback">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">What is it?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the item type and condition. WasteLess will suggest what to do next.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            Back
          </button>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {ITEM_KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onKind(item.id)}
            aria-pressed={kind === item.id}
            className={`min-h-11 rounded-lg border px-3 text-left text-sm font-medium transition-colors ${
              kind === item.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-6 font-semibold">What&apos;s its visible condition?</p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {CONDITIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onCondition(item.id)}
            aria-pressed={condition === item.id}
            className={`min-h-11 rounded-lg border px-3 text-left text-sm font-medium transition-colors ${
              condition === item.id
                ? 'border-primary bg-secondary text-secondary-foreground'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        data-testid="button-manual-recommend"
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Suggest what to do <ArrowRight size={16} />
      </button>
    </section>
  );
}

function formatResultSummary(data: IdentifiedAnalysis): string {
  const lines = [
    'WasteLess action plan',
    '====================',
    `Recommendation: ${OPTION_COPY[data.best_option].label}`,
    `Item: ${data.item}`,
    `Material: ${data.material}`,
    `Why: ${data.reason}`,
    '',
    'Condition check:',
    `Question: ${data.condition_check.question}`,
    `If yes: ${data.condition_check.if_good}`,
    `If no: ${data.condition_check.if_bad}`,
    '',
    'Action steps:',
    ...data.steps.map((step, index) => `${index + 1}. ${step}`),
  ];
  if (data.warning) {
    lines.push('', `Warning: ${data.warning}`);
  }
  lines.push('', 'Other options:');
  data.other_options.forEach((optionItem) => {
    lines.push(`- ${OPTION_COPY[optionItem.type].label}: ${optionItem.title} — ${optionItem.note}`);
  });
  lines.push('', 'Second-life ideas:');
  data.creative_ideas.forEach((idea) => {
    lines.push(`- ${idea.title} (${idea.effort})`);
  });
  lines.push(
    '',
    'Market research:',
    'No live local prices, listings, or buyer-demand data was available for this report.',
  );
  return lines.join('\n');
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ReportVisualSummary({
  data,
  completedSteps,
}: {
  data: IdentifiedAnalysis;
  completedSteps: number;
}) {
  const options = [
    { type: data.best_option, label: OPTION_COPY[data.best_option].label, selected: true },
    ...data.other_options.map((optionItem) => ({
      type: optionItem.type,
      label: OPTION_COPY[optionItem.type].label,
      selected: false,
    })),
  ];
  const progress = data.steps.length ? Math.round((completedSteps / data.steps.length) * 100) : 0;

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2" data-testid="section-report-visuals">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Action progress</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{progress}%</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-primary">
            <BarChart3 size={17} />
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${progress}% of action steps complete`}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {completedSteps} of {data.steps.length} practical steps checked off.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Decision map</p>
            <p className="mt-2 text-sm font-medium">One recommended path, three alternatives</p>
          </div>
          <span className="text-xs text-muted-foreground">{data.warning ? 'Check first' : 'Ready to check'}</span>
        </div>
        <div className="mt-4 space-y-2">
          {options.map((optionItem) => (
            <div key={optionItem.type} className="flex items-center gap-3 text-xs">
              <span className={`h-2 flex-1 rounded-full ${optionItem.selected ? 'bg-primary' : 'bg-secondary'}`} />
              <span className={`w-16 ${optionItem.selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {optionItem.label}
              </span>
              {optionItem.selected && <span className="font-mono text-[9px] uppercase text-primary">Best</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 sm:col-span-2 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm">
            <BarChart3 size={17} />
          </div>
          <div>
            <p className="font-semibold">Market research not available for this report</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              WasteLess does not currently fetch live local prices, listings, or buyer demand, so no market claims are
              shown. Use the recommendation and condition check above before choosing a local resale or donation channel.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResultPanel({
  data,
  source,
  preview,
  onReset,
}: {
  data: IdentifiedAnalysis;
  source: ResultSource;
  preview: string | null;
  onReset: () => void;
}) {
  const [done, setDone] = useState<boolean[]>(() => data.steps.map(() => false));
  const [copied, setCopied] = useState(false);
  const option = OPTION_COPY[data.best_option];
  const completedSteps = done.filter(Boolean).length;

  useEffect(() => {
    setDone(data.steps.map(() => false));
    setCopied(false);
  }, [data]);

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(formatResultSummary(data));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadPlan = () => {
    const safeItem = data.item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
    downloadTextFile(`wasteless-${safeItem}-action-plan.txt`, formatResultSummary(data));
  };

  return (
    <section
      className="print-report rise-in pb-4"
      data-testid="section-analysis-result"
      aria-labelledby="result-heading"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-8">
        {preview && (
          <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-muted/30 lg:mb-0 lg:sticky lg:top-6">
            <img src={preview} alt="Analyzed item" className="max-h-72 w-full object-contain p-3" />
          </div>
        )}
        <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Best option</p>
      <h2 id="result-heading" className="mt-3 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl" data-testid="text-best-option">
        {option.label}
      </h2>
      <p className="mt-3 text-lg font-medium">{option.line}</p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground" data-testid="text-reason">
        {data.reason}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border bg-card px-2.5 py-1">
          Item: <strong className="font-medium text-foreground">{data.item}</strong>
        </span>
        <span className="rounded-full border border-border bg-card px-2.5 py-1">
          Material: <strong className="font-medium text-foreground" data-testid="text-material">{data.material}</strong>
        </span>
        {data.recipient_type && (
          <span className="rounded-full border border-border bg-card px-2.5 py-1">
            Best for: <strong className="font-medium text-foreground" data-testid="text-recipient">{data.recipient_type}</strong>
          </span>
        )}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{sourceNote(source)}</p>

      {data.warning && (
        <div
          className="mt-6 flex gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm leading-6"
          data-testid="status-warning"
        >
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-accent-foreground" />
          <span>
            <strong className="font-semibold">Before you go further: </strong>
            {data.warning}
          </span>
        </div>
      )}

      <ReportVisualSummary data={data} completedSteps={completedSteps} />

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Check this first</p>
        <p className="mt-3 text-sm font-medium leading-6">{data.condition_check.question}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-secondary/40 p-4 text-sm leading-6">
            <p className="font-semibold">If yes</p>
            <p className="mt-2 text-muted-foreground">{data.condition_check.if_good}</p>
          </div>
          <div className="rounded-xl bg-muted p-4 text-sm leading-6">
            <p className="font-semibold">If no</p>
            <p className="mt-2 text-muted-foreground">{data.condition_check.if_bad}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">What to do</p>
          <span className="text-xs text-muted-foreground">
            {completedSteps}/{data.steps.length} done
          </span>
        </div>
        <ul className="mt-4 space-y-3">
          {data.steps.map((step, index) => {
            const id = `step-${index + 1}`;
            return (
              <li key={`${step}-${index}`}>
                <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl p-1 text-sm leading-6">
                  <input
                    id={id}
                    type="checkbox"
                    checked={done[index] ?? false}
                    onChange={() =>
                      setDone((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)))
                    }
                    className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                    data-testid={`text-step-${index + 1}`}
                  />
                  <span className={done[index] ? 'text-muted-foreground line-through' : ''}>{step}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Other options</p>
        <div className="mt-4 grid gap-3">
          {data.other_options.map((optionItem, index) => (
            <div
              key={`${optionItem.title}-${index}`}
              className="rounded-xl border border-border bg-muted/40 p-4"
              data-testid={`row-other-option-${index + 1}`}
            >
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {OPTION_COPY[optionItem.type]?.label ?? optionItem.type}
              </p>
              <p className="mt-1 text-sm font-medium">{optionItem.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{optionItem.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Give it a second life</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.creative_ideas.map((idea, index) => (
            <div
              key={`${idea.title}-${index}`}
              className="rounded-xl border border-border bg-muted/45 p-4"
              data-testid={`card-creative-idea-${index + 1}`}
            >
              <p className="text-sm font-medium">{idea.title}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{idea.effort}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="no-print mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={copyPlan}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold sm:flex-none"
        >
          {copied ? 'Copied' : 'Copy action plan'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          data-testid="button-export-pdf"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold sm:flex-none"
        >
          <Printer size={15} /> Save as PDF
        </button>
        <button
          type="button"
          onClick={downloadPlan}
          data-testid="button-download-txt"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold sm:flex-none"
        >
          <Download size={15} /> Download TXT
        </button>
        <button
          type="button"
          onClick={onReset}
          data-testid="button-start-over"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground sm:flex-none"
        >
          <RefreshCw size={15} /> Check another item
        </button>
      </div>
      <p className="no-print mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText size={13} /> “Save as PDF” opens your browser&apos;s print dialog. Choose <strong>Save to PDF</strong>.
      </p>
        </div>
      </div>
    </section>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
