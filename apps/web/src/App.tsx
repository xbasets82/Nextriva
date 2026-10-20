import { useEffect, useState } from 'react';
import { UsersScreen } from './users/UsersScreen.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';

type HealthState =
  { kind: 'loading' } | { kind: 'success'; status: 'ok' } | { kind: 'error' };

async function getHealthState(): Promise<HealthState> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      return { kind: 'error' };
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('status' in payload) ||
      payload.status !== 'ok'
    ) {
      return { kind: 'error' };
    }

    return { kind: 'success', status: payload.status };
  } catch {
    return { kind: 'error' };
  }
}

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;

    void getHealthState().then((state) => {
      if (active) {
        setHealth(state);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-svh bg-muted/30 px-6 py-16 sm:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <header className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.24em] text-primary">
            NEXTRIVA
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Nextriva
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            Estado inicial del servicio.
          </p>
        </header>

        <UsersScreen />
        <Card className="border-border/70 shadow-lg shadow-foreground/5">
          <CardHeader>
            <h2 className="font-heading text-lg font-medium">
              Estado del servicio
            </h2>
            <CardDescription>
              Comprobación de disponibilidad de la API.
            </CardDescription>
          </CardHeader>
          <CardContent aria-busy={health.kind === 'loading'}>
            {health.kind === 'loading' ? (
              <p role="status" className="text-muted-foreground">
                Consultando el estado del servicio…
              </p>
            ) : null}
            {health.kind === 'success' ? (
              <p role="status" className="font-medium text-foreground">
                Estado del servicio: {health.status}
              </p>
            ) : null}
            {health.kind === 'error' ? (
              <p role="alert" className="text-destructive">
                No se pudo consultar el estado del servicio. Inténtalo de nuevo
                más tarde.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
