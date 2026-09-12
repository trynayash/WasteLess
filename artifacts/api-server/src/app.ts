import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { analysisResponseSchema } from "./lib/analyze-schema";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// A 2.5 MB decoded image is roughly 3.34 MB as base64, plus the JSON envelope.
// Keep the parser limit above that size so the analyze route can return its
// documented decoded-image failure envelope.
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const parserError = error as {
      status?: number;
      statusCode?: number;
      type?: string;
    };
    const status = parserError.status ?? parserError.statusCode;

    if (parserError.type === "entity.parse.failed" || status === 400) {
      res
        .status(400)
        .type("application/json")
        .json(
          analysisResponseSchema.parse({
            success: false,
            error: "Please send a valid resized image.",
          }),
        );
      return;
    }

    if (parserError.type === "entity.too.large" || status === 413) {
      res
        .status(413)
        .type("application/json")
        .json(
          analysisResponseSchema.parse({
            success: false,
            error: "The resized image is too large. Please try another photo.",
          }),
        );
      return;
    }

    next(error);
  },
);

export default app;
