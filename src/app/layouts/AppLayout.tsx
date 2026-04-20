import { Link, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <header className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Turno 6x6</p>
            <h1 className="text-lg font-semibold">Cuadrante</h1>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link className="rounded-lg px-3 py-1 text-primary hover:bg-blue-50" to="/calendario">
              Calendario
            </Link>
            <Link className="rounded-lg px-3 py-1 text-primary hover:bg-blue-50" to="/login">
              Login
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
