import { describe, expect, it } from 'vitest';

import { DEFAULT_SHIFT_CYCLE_CONFIG } from '../domain/shift';
import { getCycleDayNumberForDate, getShiftKindForDate } from './shiftCycle';

describe('shift cycle base 6x6', () => {
  it('uses 2026-04-18 as day 1 (MORNING)', () => {
    expect(getCycleDayNumberForDate('2026-04-18', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe(1);
    expect(getShiftKindForDate('2026-04-18', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('MORNING');
  });

  it('maps the complete 12-day pattern', () => {
    expect(getShiftKindForDate('2026-04-19', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('MORNING');
    expect(getShiftKindForDate('2026-04-20', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('AFTERNOON');
    expect(getShiftKindForDate('2026-04-21', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('AFTERNOON');
    expect(getShiftKindForDate('2026-04-22', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('NIGHT');
    expect(getShiftKindForDate('2026-04-23', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('NIGHT');
    expect(getShiftKindForDate('2026-04-24', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
    expect(getShiftKindForDate('2026-04-25', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
    expect(getShiftKindForDate('2026-04-26', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
    expect(getShiftKindForDate('2026-04-27', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
    expect(getShiftKindForDate('2026-04-28', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
    expect(getShiftKindForDate('2026-04-29', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('OFF');
  });

  it('restarts after day 12', () => {
    expect(getCycleDayNumberForDate('2026-04-30', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe(1);
    expect(getShiftKindForDate('2026-04-30', DEFAULT_SHIFT_CYCLE_CONFIG)).toBe('MORNING');
  });
});
