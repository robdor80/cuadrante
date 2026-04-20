import { ANCHOR_DATE, SHIFT_PATTERN, SHIFT_TIMEZONE } from './config.js';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const CALENDAR_GRID_SIZE = 42;

function normalizeDateKey(input) {
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error('Fecha invalida. Formato esperado: YYYY-MM-DD');
    }
    return input;
  }

  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    throw new Error('Fecha invalida. Usa Date o YYYY-MM-DD.');
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHIFT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(input);
}

function dateKeyToEpochDay(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY);
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function addDays(baseDate, amount) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + amount);
  return next;
}

function getMondayIndex(date) {
  const weekDay = date.getDay();
  return weekDay === 0 ? 6 : weekDay - 1;
}

export function getCycleDayNumber(dateInput) {
  const dayDelta = dateKeyToEpochDay(normalizeDateKey(dateInput)) - dateKeyToEpochDay(ANCHOR_DATE);
  return mod(dayDelta, SHIFT_PATTERN.length) + 1;
}

export function getShiftKindForDate(dateInput) {
  const cycleDay = getCycleDayNumber(dateInput);
  return SHIFT_PATTERN[cycleDay - 1];
}

export function getMonthAssignments(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const result = [];

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dateKey = normalizeDateKey(current);
    const shiftKind = getShiftKindForDate(dateKey);
    const cycleDay = getCycleDayNumber(dateKey);

    result.push({ dateKey, shiftKind, cycleDay });
  }

  return {
    monthLabel: firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    days: result,
  };
}

export function getMonthGrid6x7(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const monthLabel = firstDayOfMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const mondayIndex = getMondayIndex(firstDayOfMonth);
  const gridStart = addDays(firstDayOfMonth, -mondayIndex);

  const cells = [];

  for (let offset = 0; offset < CALENDAR_GRID_SIZE; offset += 1) {
    const cellDate = addDays(gridStart, offset);
    const dateKey = normalizeDateKey(cellDate);

    cells.push({
      dateKey,
      dayNumber: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === month,
      shiftKind: getShiftKindForDate(dateKey),
      cycleDay: getCycleDayNumber(dateKey),
    });
  }

  return {
    monthLabel,
    cells,
  };
}
