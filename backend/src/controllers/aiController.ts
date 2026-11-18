import type { Request, Response } from 'express';
import { interpretTranscript } from '../services/ai/intentService.js';

export async function interpretHandler(req: Request, res: Response) {
  try {
    const { transcript } = req.body ?? {};
    const result = await interpretTranscript(String(transcript ?? ''));
    res.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to interpret the transcript.';
    res.status(400).json({ ok: false, message });
  }
}
