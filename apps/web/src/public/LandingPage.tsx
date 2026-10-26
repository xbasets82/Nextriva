import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { phaseLabels, phases } from '../api/promotions.js';
import './landing.css';

const sections = [
  ['features', 'Funcionalidades'],
  ['how-it-works', 'Cómo funciona'],
  ['benefits', 'Ventajas'],
  ['contact', 'Contacto'],
] as const;
const features = [
  [
    'Promociones conectadas',
    'Organiza cada promoción, sus fases simultáneas y las personas que participan.',
    'M3 21h18M5 21V5l7-3 7 3v16M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5',
  ],
  [
    'Incidencias con contexto',
    'Registra el problema, identifica su fase de origen y asigna un responsable.',
    'M9 3h6l1 3h4v15H4V6h4l1-3ZM9 11h6m-6 5h4',
  ],
  [
    'Equipos coordinados',
    'Trabaja con administradores, gestores y colaboradores, con acceso según su ámbito.',
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 0a4 4 0 0 1 0 8',
  ],
  [
    'Soluciones verificadas',
    'Documenta la solución y envíala a una persona autorizada distinta para su validación.',
    'm8 12 3 3 5-6M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z',
  ],
  [
    'Historia trazable',
    'Consulta comentarios y actividades para conocer quién actuó, cuándo y qué cambió.',
    'M3 12a9 9 0 1 0 3-6M3 3v6h6m3-2v5l3 2',
  ],
  [
    'Tu trabajo, a la vista',
    'Consulta en Home tus incidencias asignadas, sus estados y las que requieren atención.',
    'M3 3v18h18M7 16v-4m5 4V8m5 8V5',
  ],
] as const;

function LandingIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

function focusSection(section: string) {
  const target = document.getElementById(`landing-${section || 'content'}`);
  const scrollTarget =
    !section || section === 'content' ? target?.closest('.landing') : target;
  scrollTarget?.scrollIntoView?.({ block: 'start' });
  target?.focus({ preventScroll: true });
}

function followCurrentSection(
  event: MouseEvent<HTMLAnchorElement>,
  section: string,
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  if (window.location.hash === event.currentTarget.hash) focusSection(section);
}

function Brand() {
  return (
    <a
      href="#/welcome"
      aria-label="Nextriva — Presentación"
      onClick={(event) => followCurrentSection(event, '')}
    >
      <img
        src="/nextriva-wordmark-blue.png"
        alt="Nextriva"
        width={2508}
        height={627}
        className="landing-brand"
      />
    </a>
  );
}

function ContactDemo() {
  const [attempted, setAttempted] = useState(false);
  return (
    <form
      aria-label="Contacto de demostración"
      aria-describedby="contact-demo-note"
      onSubmit={(event) => {
        event.preventDefault();
        if (event.currentTarget.checkValidity()) setAttempted(true);
        else event.currentTarget.reportValidity();
      }}
    >
      <p id="contact-demo-note" className="landing-demo-note">
        Formulario de demostración. El servicio de contacto todavía no está
        disponible. No introduzcas datos personales reales: los datos no se
        envían ni se almacenan.
      </p>
      <div className="landing-contact-grid">
        <label htmlFor="contact-name">
          Nombre
          <input
            id="contact-name"
            required
            maxLength={100}
            autoComplete="off"
          />
        </label>
        <label htmlFor="contact-company">
          <span>Empresa (opcional)</span>
          <input id="contact-company" maxLength={150} autoComplete="off" />
        </label>
      </div>
      <label htmlFor="contact-email">
        Email
        <input
          id="contact-email"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
        />
      </label>
      <label htmlFor="contact-message">
        Mensaje
        <textarea id="contact-message" rows={4} required maxLength={2000} />
      </label>
      <button className="landing-button landing-button-primary" type="submit">
        Enviar consulta <span className="landing-demo-tag">Demo</span>
      </button>
      {attempted && (
        <p role="status">
          El contacto todavía no está disponible. No se ha enviado ni guardado
          ningún dato.
        </p>
      )}
    </form>
  );
}

export function LandingPage({ section = '' }: { section?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    focusSection(section);
  }, [section]);
  return (
    <div className="landing">
      <a
        className="landing-skip"
        href="#/welcome/content"
        onClick={(event) => followCurrentSection(event, 'content')}
      >
        Saltar al contenido
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Brand />
          <button
            ref={menuButton}
            type="button"
            className="landing-menu-toggle"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <LandingIcon
              path={
                menuOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'
              }
            />
          </button>
          <nav
            id="landing-navigation"
            aria-label="Pública"
            data-open={menuOpen}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButton.current?.focus();
              }
            }}
          >
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#/welcome/${id}`}
                onClick={(event) => {
                  setMenuOpen(false);
                  followCurrentSection(event, id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <a href="#/login" className="landing-button landing-access">
            Acceder <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-content">
        <div className="landing-container landing-hero-grid">
          <div>
            <p className="landing-eyebrow">
              PROMOCIONES · EQUIPOS · INCIDENCIAS
            </p>
            <h1 id="landing-content" tabIndex={-1}>
              Cada promoción. <br />
              Cada incidencia. <br />
              <span>Todo bajo control.</span>
            </h1>
            <p className="landing-lead">
              Un espacio compartido para coordinar equipos, resolver incidencias
              y conservar la trazabilidad de tus promociones inmobiliarias.
            </p>
            <div className="landing-actions">
              <a href="#/login" className="landing-button landing-button-light">
                Acceder a Nextriva <span aria-hidden="true">↗</span>
              </a>
              <a
                href="#/welcome/features"
                className="landing-discover"
                onClick={(event) => followCurrentSection(event, 'features')}
              >
                Descubrir funcionalidades <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="landing-hero-note">
              Desde la planificación hasta la posventa.
            </p>
          </div>
          <div
            className="landing-preview"
            aria-label="Ejemplo ilustrativo con datos ficticios"
          >
            <div className="landing-preview-top">
              <span className="landing-preview-dot" />
              <span>Tu promoción, en perspectiva</span>
              <span className="landing-demo-tag">Ejemplo ficticio</span>
            </div>
            <div className="landing-preview-body">
              <p className="landing-preview-label">PROMOCIÓN DE EJEMPLO</p>
              <h2>Residencial Horizonte</h2>
              <p className="landing-preview-subtitle">
                Construcción · Preentrega
              </p>
              <div className="landing-preview-incident">
                <span>DEMO-001</span>
                <span className="landing-preview-status">En curso</span>
                <strong>Revisión del acceso principal</strong>
                <p>Responsable asignado · Solución en preparación</p>
              </div>
              <div
                className="landing-preview-flow"
                aria-label="Flujo ilustrativo de una incidencia"
              >
                <span>Registro</span>
                <span>Resolución</span>
                <span>Validación</span>
              </div>
              <div className="landing-preview-history">
                <LandingIcon path="m5 12 4 4L19 6" />
                <p>
                  Cada actuación conserva su contexto.
                  <br />
                  <strong>Una historia compartida y trazable.</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="landing-section landing-container"
        aria-labelledby="landing-features"
      >
        <p className="landing-eyebrow">UN MISMO ESPACIO DE TRABAJO</p>
        <h2 id="landing-features" tabIndex={-1}>
          El trabajo, conectado de principio a fin.
        </h2>
        <p className="landing-intro">
          La información de la promoción y la gestión de incidencias, reunidas
          para trabajar con contexto.
        </p>
        <div className="landing-feature-grid">
          {features.map(([title, description, path]) => (
            <article key={title} className="landing-feature">
              <span className="landing-feature-icon">
                <LandingIcon path={path} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="landing-lifecycle"
        aria-labelledby="landing-lifecycle-title"
      >
        <div className="landing-container landing-section">
          <p className="landing-eyebrow">UNA PROMOCIÓN, MUCHOS MOMENTOS</p>
          <h2 id="landing-lifecycle-title">Contexto en cada fase.</h2>
          <p className="landing-intro">
            Las fases pueden solaparse. Registra incidencias desde las primeras
            etapas y conserva su origen a lo largo del proceso.
          </p>
          <ol
            className="landing-phase-grid"
            aria-label="Fases de una promoción"
          >
            {phases.map((phase, index) => (
              <li key={phase}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{phaseLabels[phase]}</h3>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="landing-section landing-container"
        aria-labelledby="landing-how-it-works"
      >
        <p className="landing-eyebrow">CÓMO FUNCIONA</p>
        <h2 id="landing-how-it-works" tabIndex={-1}>
          Del primer registro al cierre validado.
        </h2>
        <ol className="landing-steps">
          {[
            [
              'Organiza la promoción',
              'Reúne la información y selecciona las fases activas.',
            ],
            [
              'Conecta al equipo',
              'Vincula participantes y asigna responsables.',
            ],
            [
              'Trabaja en la solución',
              'Registra incidencias, añade comentarios y documenta la respuesta.',
            ],
            [
              'Valida y conserva',
              'Una persona autorizada distinta valida la solución; el historial conserva las actuaciones.',
            ],
          ].map(([title, description], index) => (
            <li key={title}>
              <span className="landing-step-number">{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-benefits" aria-labelledby="landing-benefits">
        <div className="landing-container landing-section landing-benefits-grid">
          <div>
            <p className="landing-eyebrow">MENOS DISPERSIÓN. MÁS CONTEXTO.</p>
            <h2 id="landing-benefits" tabIndex={-1}>
              Una visión compartida.
              <br />
              Responsabilidades claras.
            </h2>
            <p>
              Consulta lo que ocurre en cada promoción y sigue el trabajo de tu
              equipo desde un mismo lugar.
            </p>
          </div>
          <ul>
            {[
              'Información de promociones e incidencias centralizada.',
              'Acceso según el rol y la participación en cada promoción.',
              'Responsables, soluciones y decisiones identificables.',
              'Continuidad de la información a través de las fases.',
            ].map((benefit) => (
              <li key={benefit}>
                <LandingIcon path="m5 12 4 4L19 6" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="landing-section landing-container landing-contact"
        aria-labelledby="landing-contact"
      >
        <div>
          <p className="landing-eyebrow">HABLEMOS DE TU EQUIPO</p>
          <h2 id="landing-contact" tabIndex={-1}>
            El siguiente paso,
            <br />
            cuando estés preparado.
          </h2>
          <p className="landing-intro">
            Estamos preparando los canales de contacto. Mientras tanto, puedes
            explorar esta demostración de interfaz.
          </p>
          <ul className="landing-future-contact">
            <li>
              Correo de contacto <span>Pendiente de configurar</span>
            </li>
            <li>
              Solicitar demostración <span>Próximamente</span>
            </li>
            <li>
              Información comercial <span>Próximamente</span>
            </li>
          </ul>
        </div>
        <ContactDemo />
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-top">
            <div>
              <Brand />
              <p>Promociones, equipos e incidencias conectados.</p>
            </div>
            <nav aria-label="Pie de página">
              {sections.map(([id, label]) => (
                <a
                  key={id}
                  href={`#/welcome/${id}`}
                  onClick={(event) => followCurrentSection(event, id)}
                >
                  {label}
                </a>
              ))}
              <a href="#/login">Acceder</a>
            </nav>
          </div>
          <div className="landing-footer-bottom">
            <p>© {new Date().getFullYear()} Nextriva</p>
            <p>
              Información legal y políticas de privacidad y cookies pendientes
              de publicación.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
