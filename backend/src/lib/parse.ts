import type { z } from "zod";
import { AppError } from "../middleware/error.js";

export function parseOrThrow<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown,
  message: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_FAILED", message, {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  return parsed.data;
}
