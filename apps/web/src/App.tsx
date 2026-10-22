import { useEffect, useState } from 'react';
import type { Role } from './api/users.js';
import { SessionGate } from './auth/SessionGate.js';
import { confirmDiscard } from './users/CreateUserForm.js';
import { UsersScreen } from './users/UsersScreen.js';
import { PromotionsScreen } from './promotions/PromotionsScreen.js';
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

function ProtectedScreen({ route, role }: { route: string; role: Role }) {
  if (route.startsWith('#/promotions'))
    return <PromotionsScreen id={route.split('/')[2]} role={role} />;
  if (route.startsWith('#/users'))
    return role === 'ADMIN' ? (
      <UsersScreen />
    ) : (
      <p role="alert">
        No tienes acceso a las funciones administrativas disponibles.
      </p>
    );
  return <p>Selecciona Usuarios o Promociones para continuar.</p>;
}

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    let previous = window.location.hash;
    const update = () => {
      const promotionForm = document.querySelector(
        '[data-promotion-dirty="true"]',
      );
      const userForm = document.querySelector<HTMLFormElement>(
        'form[aria-label="Crear usuario"], form[aria-label="Editar usuario"]',
      );
      const mayLeavePromotion =
        !promotionForm || window.confirm('¿Descartar cambios sin guardar?');
      if (!mayLeavePromotion || !confirmDiscard(userForm)) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + previous,
        );
        return;
      }
      previous = window.location.hash;
      setRoute(previous);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

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

        <SessionGate>
          {(user) => (
            <>
              <nav aria-label="Principal" className="flex gap-5">
                {user.role === 'ADMIN' && (
                  <a href="#/users" className="underline">
                    Usuarios
                  </a>
                )}
                <a href="#/promotions" className="underline">
                  Promociones
                </a>
              </nav>
              <ProtectedScreen route={route} role={user.role} />
            </>
          )}
        </SessionGate>
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
