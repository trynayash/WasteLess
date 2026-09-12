import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";
import app from "./app";
import {
  analysisResponseSchema,
  validateAnalysisData,
} from "./lib/analyze-schema";
import {
  analyzeWithVision,
  friendlyAnalyzeError,
} from "./lib/vision-providers";
import { recommendFromKind } from "./lib/recommend";

type HttpResponse = {
  status: number;
  contentType: string | undefined;
  body: unknown;
};

async function request(
  body: string,
  contentType = "application/json",
): Promise<HttpResponse> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await new Promise<HttpResponse>((resolve, reject) => {
      const http = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/analyze",
          method: "POST",
          headers: {
            "content-type": contentType,
            "content-length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            try {
              resolve({
                status: res.statusCode ?? 0,
                contentType: res.headers["content-type"],
                body: JSON.parse(raw),
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      http.on("error", reject);
      http.end(body);
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function assertFailure(response: HttpResponse, status: number, error: string) {
  assert.equal(response.status, status);
  assert.match(response.contentType ?? "", /^application\/json(?:;|$)/);
  assert.deepEqual(response.body, { success: false, error });
}

test("accepts a complete recommendation response", () => {
  const data = recommendFromKind("furniture", "usable");
  const response = analysisResponseSchema.parse({ success: true, data });

  assert.equal(response.success, true);
  assert.equal(response.data.identified, true);
  assert.equal(response.data.best_option, "reuse");
  assert.equal(response.data.steps.length, 4);
  assert.equal(response.data.other_options.length, 3);
  assert.equal(response.data.creative_ideas.length, 3);
  assert.deepEqual(
    response.data.other_options.map((option) => option.type).sort(),
    ["donate", "recycle", "sell"],
  );
  assert.strictEqual(validateAnalysisData(response.data), response.data);
});

test("reports provider unavailability without inventing an analysis", async () => {
  const keys = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_AI_STUDIO_API_KEY",
    "HF_TOKEN",
    "HUGGINGFACE_API_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const saved = new Map<string, string | undefined>(
    keys.map((key) => [key, process.env[key]]),
  );

  for (const key of keys) {
    delete process.env[key];
  }

  try {
    await assert.rejects(
      analyzeWithVision(Buffer.from("not-an-image"), "image/jpeg"),
      (error: unknown) =>
        error instanceof Error && error.message === "VISION_UNAVAILABLE",
    );
    assert.equal(
      friendlyAnalyzeError(new Error("VISION_UNAVAILABLE")),
      "Image analysis is not configured yet. Choose the item type below instead.",
    );
  } finally {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("rejects malformed JSON with the documented failure envelope", async () => {
  const response = await request('{"image":');

  assertFailure(response, 400, "Please send a valid resized image.");

  const missingFields = await request("{}");
  assertFailure(missingFields, 400, "Please send a valid resized image.");
});

test("rejects malformed photos before calling a vision provider", async () => {
  const providerKeys = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_AI_STUDIO_API_KEY",
    "HF_TOKEN",
    "HUGGINGFACE_API_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const savedKeys = new Map(providerKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  for (const key of providerKeys) {
    delete process.env[key];
  }
  process.env.GEMINI_API_KEY = "test-provider-key";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("The vision provider should not be called.");
  };

  try {
    const unsupported = await request(
      JSON.stringify({
        image: "data:image/gif;base64,AA==",
        media_type: "image/png",
      }),
    );
    assertFailure(unsupported, 400, "Please send a supported image.");

    const unsupportedMediaType = await request(
      JSON.stringify({
        image: "data:image/gif;base64,AA==",
        media_type: "image/gif",
      }),
    );
    assertFailure(
      unsupportedMediaType,
      400,
      "Please send a valid resized image.",
    );

    const empty = await request(
      JSON.stringify({
        image: "data:image/jpeg;base64,=",
        media_type: "image/jpeg",
      }),
    );
    assertFailure(
      empty,
      413,
      "The resized image is too large. Please try another photo.",
    );

    const oversizedImage = Buffer.alloc(2_500_001, 0x41).toString("base64");
    const oversized = await request(
      JSON.stringify({
        image: `data:image/jpeg;base64,${oversizedImage}`,
        media_type: "image/jpeg",
      }),
    );
    assertFailure(
      oversized,
      413,
      "The resized image is too large. Please try another photo.",
    );

    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of providerKeys) {
      const value = savedKeys.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("rejects a request body over the JSON parser limit with the failure envelope", async () => {
  const body = JSON.stringify({
    image: `data:image/jpeg;base64,${Buffer.alloc(3_000_001, 0x41).toString("base64")}`,
    media_type: "image/jpeg",
  });
  const response = await request(body);

  assertFailure(
    response,
    413,
    "The resized image is too large. Please try another photo.",
  );
});