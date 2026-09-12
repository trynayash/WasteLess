import { z } from "zod";

const optionType = z.enum(["reuse", "donate", "sell", "recycle"]);

const identifiedAnalysisSchema = z.object({
    item: z.string().min(1),
    material: z.string().min(1),
    identified: z.literal(true),
    best_option: optionType,
    reason: z.string().min(1).max(160),
    condition_check: z.object({
      question: z.string().min(1),
      if_good: z.string().min(1),
      if_bad: z.string().min(1),
    }),
    steps: z.array(z.string().min(1)).min(3).max(5),
    other_options: z
      .array(
        z.object({
          type: optionType,
          title: z.string().min(1),
          note: z.string().min(1),
        }),
      )
      .length(3),
    creative_ideas: z
      .array(
        z.object({
          title: z.string().min(1),
          effort: z.enum(["easy", "medium", "involved"]),
        }),
      )
      .length(3),
    recipient_type: z.string().nullable(),
    warning: z.string().nullable(),
  });

export const analysisDataSchema = z.discriminatedUnion("identified", [
  identifiedAnalysisSchema,
  z.object({
    identified: z.literal(false),
    reason: z.string().min(1),
  }),
]);

export const analysisResponseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: analysisDataSchema }),
  z.object({ success: z.literal(false), error: z.string().min(1) }),
]);

export type AnalysisData = z.infer<typeof analysisDataSchema>;

export function validateAnalysisData(data: AnalysisData): AnalysisData {
  if (!data.identified) {
    return data;
  }

  const types = data.other_options.map((option) => option.type);
  if (
    types.some((type) => type === data.best_option) ||
    new Set(types).size !== types.length
  ) {
    throw new Error("Invalid other option types");
  }

  return data;
}