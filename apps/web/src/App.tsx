import { IncidentsScreen } from './incidents/IncidentsScreen.js';
import { IncidentScreen } from './incidents/IncidentScreen.js';
import { useEffect, useState } from 'react';
import type { Role } from './api/users.js';
import { SessionGate } from './auth/SessionGate.js';
import { resolveAuthenticatedRoute } from './auth/navigation.js';
import { confirmDiscard } from './users/CreateUserForm.js';
import { UsersScreen } from './users/UsersScreen.js';
import { PromotionsScreen } from './promotions/PromotionsScreen.js';

function ProtectedScreen({
  route,
  role,
  userId,
}: {
  route: string;
  role: Role;
  userId: string;
}) {
  const destination = resolveAuthenticatedRoute(route, role);
  if (destination === '#/incidents') return <IncidentsScreen />;
  if (destination.startsWith('#/incidents/new/'))
    return <IncidentScreen promotionId={destination.split('/')[3] ?? ''} />;
  if (destination.startsWith('#/incidents/'))
    return (
      <IncidentScreen
        id={destination.split('/')[2] ?? ''}
        role={role}
        userId={userId}
      />
    );
  if (destination.startsWith('#/promotions'))
    return <PromotionsScreen id={destination.split('/')[2]} role={role} />;
  if (destination === '#/users') return <UsersScreen />;
  return <p>Selecciona Usuarios, Promociones o Incidencias para continuar.</p>;
}

export function App() {
  const [route, setRoute] = useState(window.location.hash);
  const isLoginRoute = !route || route === '#/login';
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

  return (
    <main
      className={
        isLoginRoute
          ? 'grid min-h-svh place-items-center bg-background px-4 py-8 sm:px-6 sm:py-12'
          : 'min-h-svh bg-muted/30 px-6 py-16 sm:py-24'
      }
    >
      <div
        className={`mx-auto flex w-full max-w-2xl flex-col ${isLoginRoute ? 'gap-8' : 'gap-10'}`}
      >
        <header className="text-center">
          <p className="font-heading text-3xl font-medium tracking-[0.2em] text-foreground sm:text-4xl">
            NEXTRIVA
          </p>
        </header>

        <SessionGate>
          {(user) => (
            <>
              <nav aria-label="Principal" className="flex flex-wrap gap-5">
                {user.role === 'ADMIN' && (
                  <a href="#/users" className="underline">
                    Usuarios
                  </a>
                )}
                <a href="#/promotions" className="underline">
                  Promociones
                </a>
                <a href="#/incidents" className="underline">
                  Incidencias
                </a>
              </nav>
              <ProtectedScreen
                route={route}
                role={user.role}
                userId={user.id}
              />
            </>
          )}
        </SessionGate>
      </div>
    </main>
  );
}
