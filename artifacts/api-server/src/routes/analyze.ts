import { Router, type IRouter, type Response } from "express";
import { AnalyzeImageBody } from "@workspace/api-zod";
import { analysisResponseSchema } from "../lib/analyze-schema";
import { analyzeWithVision, friendlyAnalyzeError } from "../lib/vision-providers";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 2_500_000;
const jsonHeaders = { "content-type": "application/json" };

function sendFailure(res: Response, status: number, error: string) {
  res
    .status(status)
    .set(jsonHeaders)
    .json(analysisResponseSchema.parse({ success: false, error }));
}

router.post("/analyze", async (req, res) => {
  const input = AnalyzeImageBody.safeParse(req.body);
  if (!input.success) {
    sendFailure(res, 400, "Please send a valid resized image.");
    return;
  }

  const match = input.data.image.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match || match[1] !== input.data.media_type) {
    sendFailure(res, 400, "Please send a supported image.");
    return;
  }

  const image = Buffer.from(match[2], "base64");
  if (image.byteLength === 0 || image.byteLength > MAX_IMAGE_BYTES) {
    sendFailure(res, 413, "The resized image is too large. Please try another photo.");
    return;
  }

  try {
    const started = Date.now();
    const { data, provider } = await analyzeWithVision(
      image,
      match[1] as "image/jpeg" | "image/png" | "image/webp",
    );
    req.log.info(
      {
        provider,
        identified: data.identified,
        elapsedMs: Date.now() - started,
      },
      "analyze completed",
    );
    res.json(
      analysisResponseSchema.parse({
        success: true,
        data,
      }),
    );
  } catch (error) {
    req.log.warn(
      { err: error instanceof Error ? error.message : "unknown" },
      "analyze failed",
    );
    sendFailure(res, 502, friendlyAnalyzeError(error));
  }
});

export default router;
