import { z } from 'zod';

export type ShiftKind = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'OFF';

export const SHIFT_CYCLE_PATTERN: readonly ShiftKind[] = [
  'MORNING',
  'MORNING',
  'AFTERNOON',
  'AFTERNOON',
  'NIGHT',
  'NIGHT',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
] as const;

export const SHIFT_CYCLE_LENGTH = 12;

export interface ShiftCycleConfig {
  anchorDate: string;
  timezone: 'Europe/Madrid';
  pattern: readonly ShiftKind[];
}

export const shiftKindSchema = z.enum(['MORNING', 'AFTERNOON', 'NIGHT', 'OFF']);

export const shiftCycleConfigSchema = z.object({
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.literal('Europe/Madrid'),
  pattern: z.array(shiftKindSchema).length(SHIFT_CYCLE_LENGTH),
});

export const DEFAULT_SHIFT_CYCLE_CONFIG: ShiftCycleConfig = {
  anchorDate: '2026-04-18',
  timezone: 'Europe/Madrid',
  pattern: SHIFT_CYCLE_PATTERN,
};
