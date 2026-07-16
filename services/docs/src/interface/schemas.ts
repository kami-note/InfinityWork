import { z } from "zod";

export const createDocumentSchema = z.object({
  name: z.string().min(1),
  folderId: z.string().uuid().nullable().optional(),
});

export const saveContentSchema = z.object({
  content: z.unknown(),
});
