import { Recycle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="app-shell flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
          <Recycle size={20} strokeWidth={2.1} />
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">WasteLess</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">This page is not here.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The object you were looking for does not have a route. Go back to the start and check another item.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Back to WasteLess
        </Link>
      </div>
    </main>
  );
}
