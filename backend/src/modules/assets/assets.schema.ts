import { z } from "zod";
import { ALL_EDIT_PRESETS, EDIT_MAX_MS } from "../../shared/edits.js";

export const editRequestSchema = z.object({
  preset: z.enum(ALL_EDIT_PRESETS),
  startMs: z.number().int().nonnegative().max(EDIT_MAX_MS).optional(),
  endMs: z.number().int().positive().max(EDIT_MAX_MS).optional(),
});

export type EditRequestBody = z.infer<typeof editRequestSchema>;
