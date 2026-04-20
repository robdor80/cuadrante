import { Link } from 'react-router-dom';

import { isFirebaseConfigured } from '../infra/firebase/client';

export function LoginPage() {
  return (
    <section className="mx-auto max-w-md space-y-4 text-center">
      <h2 className="text-2xl font-semibold">Acceso a Cuadrante</h2>
      <p className="text-sm text-muted">
        En Parte 1 dejamos la base lista, pero sin activar login real ni lista blanca.
      </p>

      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 font-medium text-slate-600"
      >
        Continuar con Google (fase posterior)
      </button>

      <p className="text-xs text-muted">
        Firebase configurado: <span className="font-semibold">{isFirebaseConfigured ? 'si' : 'no'}</span>
      </p>

      <Link
        to="/calendario"
        className="inline-flex rounded-lg border border-border px-3 py-2 text-sm text-primary hover:bg-blue-50"
      >
        Ver base de calendario
      </Link>
    </section>
  );
}
