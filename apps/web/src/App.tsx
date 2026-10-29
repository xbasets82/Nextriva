import { AccountIdentity } from './auth/AccountIdentity.js';
import { DeletedIncidentsScreen } from './incidents/DeletedIncidentsScreen.js';
import { HomeScreen } from './HomeScreen.js';
import type {
  IncidentFilterAssignee,
  IncidentListQuery,
} from './api/incidents.js';
import { IncidentsScreen } from './incidents/IncidentsScreen.js';
import { IncidentScreen } from './incidents/IncidentScreen.js';
import { useEffect, useState } from 'react';
import type { Role } from './api/users.js';
import { SessionGate } from './auth/SessionGate.js';
import { resolveAuthenticatedRoute } from './auth/navigation.js';
import { confirmDiscard } from './users/CreateUserForm.js';
import { UsersScreen } from './users/UsersScreen.js';
import { PromotionsScreen } from './promotions/PromotionsScreen.js';
import { LandingPage } from './public/LandingPage.js';

function ProtectedScreen({
  route,
  role,
  userId,
  currentAssignee,
}: {
  route: string;
  role: Role;
  userId: string;
  currentAssignee: IncidentFilterAssignee;
}) {
  const [incidentQuery, setIncidentQuery] = useState<IncidentListQuery>({
    page: 1,
    pageSize: 10,
  });
  const [creationFromList, setCreationFromList] = useState(false);
  const destination = resolveAuthenticatedRoute(route, role);
  useEffect(() => {
    if (!destination.startsWith('#/incidents/new/')) setCreationFromList(false);
  }, [destination]);
  if (destination === '#/home')
    return (
      <HomeScreen
        onViewAll={() =>
          setIncidentQuery({ assignedToId: userId, page: 1, pageSize: 10 })
        }
      />
    );
  if (destination === '#/incidents')
    return (
      <IncidentsScreen
        role={role}
        currentAssignee={currentAssignee}
        query={incidentQuery}
        onQueryChange={setIncidentQuery}
        onCreate={(promotionId) => {
          setCreationFromList(true);
          window.location.hash = `/incidents/new/${encodeURIComponent(promotionId)}`;
        }}
      />
    );
  if (destination === '#/incidents/deleted')
    return <DeletedIncidentsScreen role={role} />;
  if (destination.startsWith('#/incidents/new/'))
    return (
      <IncidentScreen
        promotionId={destination.split('/')[3] ?? ''}
        returnToIncidents={creationFromList}
      />
    );
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
  const isLoginRoute = route === '#/login';
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

  if (route === '#/welcome' || route.startsWith('#/welcome/'))
    return (
      <main>
        <LandingPage section={route.split('/')[2] ?? ''} />
      </main>
    );
  const isRoot = !route || route === '#/' || route === '#';
  let canvasClass = isLoginRoute
    ? 'app-canvas grid min-h-svh place-items-center px-4 py-8 sm:px-6 sm:py-12'
    : 'app-canvas min-h-svh px-4 py-6 sm:px-6 sm:py-8 lg:px-10';
  let contentClass = `mx-auto flex w-full flex-col ${isLoginRoute ? 'max-w-2xl gap-8' : 'app-shell gap-6 sm:gap-8'}`;
  if (isRoot) {
    canvasClass = 'min-h-svh bg-background';
    contentClass = 'w-full';
  }
  return (
    <main className={canvasClass}>
      <div className={contentClass}>
        {isLoginRoute && (
          <header className="text-center">
            <img
              src="/nextriva-icon-192.png"
              alt="Nextriva"
              width={192}
              height={192}
              className="mx-auto size-24 max-w-full object-contain"
            />
          </header>
        )}

        <SessionGate anonymousContent={isRoot ? <LandingPage /> : undefined}>
          {(user, logoutControl) => {
            const currentRoute = resolveAuthenticatedRoute(route, user.role);
            const isCurrent = (path: string) =>
              currentRoute === path || currentRoute.startsWith(`${path}/`);
            return (
              <>
                <header className="app-header grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4 rounded-xl border border-border/70 bg-card p-3 sm:p-4 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2">
                  <a
                    href="#/home"
                    aria-label="Nextriva — Inicio"
                    className="min-w-0 justify-self-start rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <img
                      src="/nextriva-wordmark-blue.png"
                      alt="Nextriva"
                      width={2508}
                      height={627}
                      className="h-auto w-40 max-w-full justify-self-start object-contain md:w-40 lg:w-56 xl:w-64"
                    />
                  </a>
                  <nav
                    aria-label="Principal"
                    className="flex items-center justify-center gap-1 rounded-lg border border-border/70 bg-background/80 p-1 max-md:col-span-2 max-md:row-start-2 max-md:w-full"
                  >
                    <a
                      href="#/home"
                      aria-label="Inicio"
                      aria-current={isCurrent('#/home') ? 'page' : undefined}
                      className={`rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${isCurrent('#/home') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                    >
                      <svg
                        aria-hidden="true"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" />
                      </svg>
                    </a>
                    {user.role === 'ADMIN' && (
                      <a
                        href="#/users"
                        aria-current={isCurrent('#/users') ? 'page' : undefined}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none max-sm:flex-1 max-sm:px-2 max-sm:text-center ${isCurrent('#/users') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                      >
                        Usuarios
                      </a>
                    )}
                    <a
                      href="#/promotions"
                      aria-current={
                        isCurrent('#/promotions') ? 'page' : undefined
                      }
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none max-sm:flex-1 max-sm:px-2 max-sm:text-center ${isCurrent('#/promotions') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                    >
                      Promociones
                    </a>
                    <a
                      href="#/incidents"
                      aria-current={
                        isCurrent('#/incidents') ? 'page' : undefined
                      }
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none max-sm:flex-1 max-sm:px-2 max-sm:text-center ${isCurrent('#/incidents') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                    >
                      Incidencias
                    </a>
                  </nav>
                  <div className="flex min-w-0 items-center justify-self-end gap-2 xl:gap-3">
                    <AccountIdentity user={user} />
                    {logoutControl}
                  </div>
                </header>
                <ProtectedScreen
                  route={route}
                  role={user.role}
                  userId={user.id}
                  currentAssignee={user}
                />
              </>
            );
          }}
        </SessionGate>
      </div>
    </main>
  );
}
