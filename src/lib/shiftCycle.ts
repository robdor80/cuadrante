import { ShiftCycleConfig, ShiftKind, shiftCycleConfigSchema } from '../domain/shift';

export type ShiftDateInput = Date | string;

function toDateKeyInTimeZone(value: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(value);
}

function parseDateInput(input: ShiftDateInput, timeZone: string): string {
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error(`Invalid date string "${input}". Expected YYYY-MM-DD.`);
    }

    return input;
  }

  return toDateKeyInTimeZone(input, timeZone);
}

function dateKeyToEpochDay(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getShiftKindForDate(input: ShiftDateInput, config: ShiftCycleConfig): ShiftKind {
  const validatedConfig = shiftCycleConfigSchema.parse(config);
  const dateKey = parseDateInput(input, validatedConfig.timezone);

  const dayDelta = dateKeyToEpochDay(dateKey) - dateKeyToEpochDay(validatedConfig.anchorDate);
  const index = mod(dayDelta, validatedConfig.pattern.length);

  return validatedConfig.pattern[index];
}

export function getCycleDayNumberForDate(input: ShiftDateInput, config: ShiftCycleConfig): number {
  const validatedConfig = shiftCycleConfigSchema.parse(config);
  const dateKey = parseDateInput(input, validatedConfig.timezone);

  const dayDelta = dateKeyToEpochDay(dateKey) - dateKeyToEpochDay(validatedConfig.anchorDate);
  return mod(dayDelta, validatedConfig.pattern.length) + 1;
}
