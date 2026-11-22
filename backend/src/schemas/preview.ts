import { z } from 'zod';

export const createPreviewSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required.'),
});

export const previewIdParamSchema = z.object({
  id: z.string().min(1, 'Preview ID is required.'),
});
