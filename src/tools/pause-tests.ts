import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { CONFIG_DIR, PAUSE_CONFIG } from '../lib/paths.js';

function pauseFile(configDir: string): string {
  return join(configDir, 'pause.json');
}

export const pauseTestsSchema = z.object({
  duration_minutes: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe('How long to pause tests, in minutes (1–60)'),
  reason: z
    .string()
    .optional()
    .describe('Why tests are being paused (e.g. "Deploy v2.3.0")'),
});

export type PauseTestsInput = z.infer<typeof pauseTestsSchema>;

export interface PauseState {
  paused_until: string;
  reason?: string;
}

export function isTestsPaused(configDir: string = CONFIG_DIR): { paused: boolean; until?: string; reason?: string } {
  const file = configDir === CONFIG_DIR ? PAUSE_CONFIG : pauseFile(configDir);
  if (!existsSync(file)) return { paused: false };

  const state = JSON.parse(readFileSync(file, 'utf-8')) as PauseState;
  const pausedUntil = new Date(state.paused_until);

  if (Date.now() >= pausedUntil.getTime()) return { paused: false };

  return { paused: true, until: state.paused_until, reason: state.reason };
}

export function pauseTests(input: PauseTestsInput): string {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const pausedUntil = new Date(Date.now() + input.duration_minutes * 60 * 1000);
  const state: PauseState = {
    paused_until: pausedUntil.toISOString(),
    reason: input.reason,
  };

  writeFileSync(PAUSE_CONFIG, JSON.stringify(state, null, 2), 'utf-8');

  const lines = [`Tests paused for ${input.duration_minutes} minute(s).`];
  lines.push(`Resumes automatically at: ${pausedUntil.toLocaleTimeString()}`);
  if (input.reason) lines.push(`Reason: ${input.reason}`);

  return lines.join('\n');
}
