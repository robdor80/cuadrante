import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="space-y-2 text-center">
      <h2 className="text-2xl font-semibold">Pagina no encontrada</h2>
      <p className="text-sm text-muted">La ruta solicitada no existe.</p>
      <Link to="/" className="inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
        Volver al inicio
      </Link>
    </section>
  );
}
