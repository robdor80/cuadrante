import { endOfMonth, eachDayOfInterval, format, startOfMonth } from 'date-fns';

import { DEFAULT_SHIFT_CYCLE_CONFIG } from '../domain/shift';
import { getCycleDayNumberForDate, getShiftKindForDate } from '../lib/shiftCycle';

const SHIFT_LABELS: Record<string, string> = {
  MORNING: 'Manana',
  AFTERNOON: 'Tarde',
  NIGHT: 'Noche',
  OFF: 'Libre',
};

const SHIFT_STYLES: Record<string, string> = {
  MORNING: 'bg-amber-100 text-amber-900 border-amber-200',
  AFTERNOON: 'bg-orange-100 text-orange-900 border-orange-200',
  NIGHT: 'bg-slate-200 text-slate-900 border-slate-300',
  OFF: 'bg-emerald-100 text-emerald-900 border-emerald-200',
};

export function CalendarPage() {
  const today = new Date();
  const monthLabel = format(today, 'MMMM yyyy');

  const days = eachDayOfInterval({
    start: startOfMonth(today),
    end: endOfMonth(today),
  });

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold capitalize">Calendario {monthLabel}</h2>
        <p className="text-sm text-muted">
          Base del turno 6x6. Anchor: 2026-04-18 (dia 1 = primera manana).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const shift = getShiftKindForDate(dateKey, DEFAULT_SHIFT_CYCLE_CONFIG);
          const dayNumber = getCycleDayNumberForDate(dateKey, DEFAULT_SHIFT_CYCLE_CONFIG);

          return (
            <article
              key={dateKey}
              className="rounded-xl border border-border bg-white p-3 shadow-sm transition hover:shadow"
            >
              <p className="text-sm font-medium text-text">{format(day, 'dd/MM/yyyy')}</p>
              <p className="mt-2 text-xs text-muted">Dia de ciclo {dayNumber}/12</p>
              <p
                className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${SHIFT_STYLES[shift]}`}
              >
                {SHIFT_LABELS[shift]}
              </p>
            </article>
          );
        })}
      </div>

      <p className="rounded-lg border border-dashed border-border bg-slate-50 p-3 text-xs text-muted">
        El estado diario VOY/NO_VOY/VIALIA y su persistencia en Firestore se implementaran en fases
        posteriores.
      </p>
    </section>
  );
}
