import {
  analysisDataSchema,
  validateAnalysisData,
  type AnalysisData,
} from "./analyze-schema";
import { kindFromCaption, recommendFromKind } from "./recommend";
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_USER_PROMPT,
  analysisRepairPrompt,
} from "./analyze-prompt";

const REQUEST_TIMEOUT_MS = 45_000;

export type VisionProvider = "gemini" | "huggingface" | "anthropic";

export type VisionAnalysisResult = {
  data: AnalysisData;
  provider: VisionProvider;
};
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const HF_VISION_URL =
  "https://router.huggingface.co/hf-inference/models/Salesforce/blip-image-captioning-base";

function unknownResult(reason: string): AnalysisData {
  return { identified: false, reason };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function anthropicKey(): string | undefined {
  const key = process.env["ANTHROPIC_API_KEY"];
  return key && key.trim() !== "" ? key.trim() : undefined;
}

function hfToken(): string | undefined {
  const token = process.env["HF_TOKEN"] ?? process.env["HUGGINGFACE_API_KEY"];
  return token && token.trim() !== "" ? token.trim() : undefined;
}

function geminiKey(): string | undefined {
  const key =
    process.env["GEMINI_API_KEY"] ??
    process.env["GOOGLE_API_KEY"] ??
    process.env["GEMINI_AI_STUDIO_API_KEY"];
  return key && key.trim() !== "" ? key.trim() : undefined;
}

function hasVisionProvider(): boolean {
  return Boolean(geminiKey() || anthropicKey() || hfToken());
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

function validationIssue(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message.startsWith("VALIDATION_FAILED:")) {
    return error.message.slice("VALIDATION_FAILED:".length);
  }
  return null;
}

function parseValidated(raw: unknown): AnalysisData {
  const parsed = analysisDataSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues.map((item) => item.message).join("; ");
    throw new Error(`VALIDATION_FAILED:${issue}`);
  }
  try {
    return validateAnalysisData(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analysis shape";
    throw new Error(`VALIDATION_FAILED:${message}`);
  }
}

async function fetchAnthropicText(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<string> {
  const apiKey = anthropicKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: ANALYSIS_USER_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("ANTHROPIC_UNAVAILABLE");
    }

    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("content" in payload) ||
      !Array.isArray(payload.content)
    ) {
      throw new Error("INVALID_ANTHROPIC_RESPONSE");
    }

    const textBlock = payload.content.find(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string",
    );

    if (!textBlock) {
      throw new Error("INVALID_ANTHROPIC_RESPONSE");
    }

    return textBlock.text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGeminiText(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  userPrompt: string = ANALYSIS_USER_PROMPT,
): Promise<string> {
  const apiKey = geminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: ANALYSIS_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mediaType, data: imageBase64 } },
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
          temperature: 0.15,
        },
      }),
    });

    if (!response.ok) {
      throw new Error("GEMINI_UNAVAILABLE");
    }

    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("candidates" in payload) ||
      !Array.isArray(payload.candidates)
    ) {
      throw new Error("INVALID_GEMINI_RESPONSE");
    }

    const first = payload.candidates[0];
    if (
      !first ||
      typeof first !== "object" ||
      !("content" in first) ||
      typeof first.content !== "object" ||
      first.content === null ||
      !("parts" in first.content) ||
      !Array.isArray(first.content.parts)
    ) {
      throw new Error("INVALID_GEMINI_RESPONSE");
    }

    const textPart = first.content.parts.find(
      (part: unknown): part is { text: string } =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string",
    );

    if (!textPart) {
      throw new Error("INVALID_GEMINI_RESPONSE");
    }

    return textPart.text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<AnalysisData> {
  let lastError: unknown;
  let repairHint: string | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const userPrompt = repairHint
        ? analysisRepairPrompt(repairHint)
        : ANALYSIS_USER_PROMPT;
      const text = await fetchGeminiText(imageBase64, mediaType, userPrompt);
      return parseValidated(extractJson(text));
    } catch (error) {
      lastError = error;
      const issue = validationIssue(error);
      if (issue) {
        repairHint = issue;
        continue;
      }
      if (
        isAbortError(error) ||
        (error instanceof Error &&
          (error.message === "GEMINI_UNAVAILABLE" ||
            error.message === "INVALID_GEMINI_RESPONSE"))
      ) {
        throw error;
      }
    }
  }
  throw lastError ?? new Error("INVALID_GEMINI_RESPONSE");
}

async function callAnthropic(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<AnalysisData> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await fetchAnthropicText(imageBase64, mediaType);
      return parseValidated(extractJson(text));
    } catch (error) {
      lastError = error;
      if (
        isAbortError(error) ||
        (error instanceof Error &&
          (error.message === "ANTHROPIC_UNAVAILABLE" ||
            error.message === "INVALID_ANTHROPIC_RESPONSE"))
      ) {
        throw error;
      }
    }
  }
  throw lastError ?? new Error("INVALID_ANTHROPIC_RESPONSE");
}

function parseCaption(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    const first = payload[0];
    if (
      first &&
      typeof first === "object" &&
      "generated_text" in first &&
      typeof first.generated_text === "string"
    ) {
      return first.generated_text;
    }
  }
  if (
    payload &&
    typeof payload === "object" &&
    "generated_text" in payload &&
    typeof payload.generated_text === "string"
  ) {
    return payload.generated_text;
  }
  return null;
}

async function getCaption(image: Buffer, mediaType: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "content-type": mediaType,
    accept: "application/json",
  };
  const token = hfToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(HF_VISION_URL, {
      method: "POST",
      headers,
      body: image,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("HF_UNAVAILABLE");
    }
    const caption = parseCaption(await response.json());
    if (!caption || caption.trim() === "") {
      throw new Error("INVALID_HF_RESPONSE");
    }
    return caption.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callHuggingFace(
  image: Buffer,
  mediaType: string,
): Promise<AnalysisData> {
  const caption = await getCaption(image, mediaType);
  const kind = kindFromCaption(caption);
  if (!kind) {
    return unknownResult(
      "I'm not sure what this is. Try another photo with better lighting or a closer view.",
    );
  }
  return validateAnalysisData(
    analysisDataSchema.parse(recommendFromKind(kind, "unsure")),
  );
}

async function tryProvider(run: () => Promise<AnalysisData>): Promise<AnalysisData | null> {
  try {
    return await run();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  }
}

export function getVisionStatus(): Record<VisionProvider, boolean> {
  return {
    gemini: Boolean(geminiKey()),
    huggingface: Boolean(hfToken()),
    anthropic: Boolean(anthropicKey()),
  };
}

export async function analyzeWithVision(
  image: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<VisionAnalysisResult> {
  const base64 = image.toString("base64");
  let lastFailure: unknown = new Error("VISION_UNAVAILABLE");

  if (geminiKey()) {
    const result = await tryProvider(() => callGemini(base64, mediaType));
    if (result) return { data: result, provider: "gemini" };
    lastFailure = new Error("GEMINI_UNAVAILABLE");
  }

  if (hfToken()) {
    const result = await tryProvider(() => callHuggingFace(image, mediaType));
    if (result) return { data: result, provider: "huggingface" };
    lastFailure = new Error("HF_UNAVAILABLE");
  }

  if (anthropicKey()) {
    const result = await tryProvider(() => callAnthropic(base64, mediaType));
    if (result) return { data: result, provider: "anthropic" };
    lastFailure = new Error("ANTHROPIC_UNAVAILABLE");
  }

  throw lastFailure;
}

export function friendlyAnalyzeError(error: unknown): string {
  if (isAbortError(error)) {
    return "The check took too long. Please try again.";
  }
  if (!hasVisionProvider()) {
    return "Image analysis is not configured yet. Choose the item type below instead.";
  }
  return "We couldn't check this item. Try again or choose the item type below.";
}
