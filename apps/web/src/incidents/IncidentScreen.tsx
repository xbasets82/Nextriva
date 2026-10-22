import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createIncident,
  getIncident,
  incidentError,
  categories,
  priorities,
  statusLabels,
  type Incident,
  type IncidentInput,
} from '../api/incidents.js';
import { getPromotion, phases, phaseLabels } from '../api/promotions.js';

export function IncidentScreen({
  id,
  promotionId,
}: {
  id?: string;
  promotionId?: string;
}) {
  const [incident, setIncident] = useState<Incident>();
  const [promotionName, setPromotionName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(true);
  const routeRevision = useRef(0);
  useEffect(() => {
    active.current = true;
    const revision = ++routeRevision.current;
    const isCurrent = () =>
      active.current && routeRevision.current === revision;
    setPromotionName('');
    setBusy(false);
    setErrors([]);
    setLoading(true);
    setMessage('');
    setIncident(undefined);
    void (
      id
        ? getIncident(id).then((value) => {
            if (isCurrent()) setIncident(value);
          })
        : getPromotion(promotionId ?? '').then((value) => {
            if (isCurrent()) setPromotionName(value.name);
          })
    )
      .catch((error) => {
        if (isCurrent()) setMessage(incidentError(error));
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => {
      active.current = false;
    };
  }, [id, promotionId, attempt]);
  useEffect(() => {
    if (!loading) heading.current?.focus();
  }, [loading, incident]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const originPhase = phases.find(
      (value) => value === values.get('originPhase'),
    );
    const category = (
      Object.keys(categories) as Array<keyof typeof categories>
    ).find((value) => value === values.get('category'));
    const priority = (
      Object.keys(priorities) as Array<keyof typeof priorities>
    ).find((value) => value === values.get('priority'));
    const invalid = [
      ...(title.length < 5 || title.length > 150 ? ['title'] : []),
      ...(description.length < 10 || description.length > 5000
        ? ['description']
        : []),
      ...(!originPhase ? ['originPhase'] : []),
      ...(!category ? ['category'] : []),
      ...(!priority ? ['priority'] : []),
    ];
    setErrors(invalid);
    if (invalid.length || !originPhase || !category || !priority) {
      setMessage('Revisa los campos indicados.');
      form.current
        ?.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)
        ?.focus();
      return;
    }
    const input: IncidentInput = {
      promotionId: promotionId ?? '',
      title,
      description,
      originPhase,
      category,
      priority,
    };
    const revision = routeRevision.current;
    setBusy(true);
    setMessage('');
    try {
      const created = await createIncident(input);
      if (active.current && routeRevision.current === revision)
        window.location.hash = `/incidents/${created.id}`;
    } catch (error) {
      if (active.current && routeRevision.current === revision)
        setMessage(incidentError(error));
    } finally {
      if (active.current && routeRevision.current === revision) setBusy(false);
    }
  }
  if (loading) return <p role="status">Consultando incidencia…</p>;
  return (
    <section className="space-y-4">
      <a
        href={`#/promotions/${incident?.promotionId ?? promotionId ?? ''}`}
        className="underline"
      >
        Volver a la promoción
      </a>
      {message && <p role="alert">{message}</p>}
      {message && !promotionName && !incident && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Reintentar
        </button>
      )}
      {incident ? (
        <>
          <h2
            ref={heading}
            tabIndex={-1}
            className="break-words text-2xl font-semibold"
          >
            {incident.title}
          </h2>
          <p>{incident.publicCode}</p>
          <p>{statusLabels[incident.status]}</p>
          <p>{phaseLabels[incident.originPhase]}</p>
          <p>{categories[incident.category]}</p>
          <p>{priorities[incident.priority]}</p>
          <p className="whitespace-pre-wrap break-words">
            {incident.description}
          </p>
        </>
      ) : (
        promotionName && (
          <form
            ref={form}
            noValidate
            aria-label="Crear incidencia"
            aria-busy={busy}
            onSubmit={(event) => void submit(event)}
            className="space-y-4 rounded-xl border bg-card p-4"
          >
            <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
              Crear incidencia
            </h2>
            <p>{promotionName}</p>
            <fieldset disabled={busy} className="grid gap-4">
              <legend className="sr-only">Datos de la incidencia</legend>
              <label htmlFor="incident-title">Título</label>
              <input
                className="w-full rounded-md border bg-background p-2"
                id="incident-title"
                name="title"
                aria-invalid={errors.includes('title')}
                aria-describedby={
                  errors.includes('title') ? 'incident-error-title' : undefined
                }
                required
                minLength={5}
                maxLength={150}
              />
              <label htmlFor="incident-description">Descripción</label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-2"
                id="incident-description"
                name="description"
                aria-invalid={errors.includes('description')}
                aria-describedby={
                  errors.includes('description')
                    ? 'incident-error-description'
                    : undefined
                }
                required
                minLength={10}
                maxLength={5000}
              />
              <label htmlFor="incident-phase">Fase de origen</label>
              <select
                className="w-full rounded-md border bg-background p-2"
                id="incident-phase"
                name="originPhase"
                aria-invalid={errors.includes('originPhase')}
                aria-describedby={
                  errors.includes('originPhase')
                    ? 'incident-error-originPhase'
                    : undefined
                }
                required
                defaultValue=""
              >
                <option value="">Selecciona una fase</option>
                {phases.map((phase) => (
                  <option key={phase} value={phase}>
                    {phaseLabels[phase]}
                  </option>
                ))}
              </select>
              <label htmlFor="incident-category">Categoría</label>
              <select
                className="w-full rounded-md border bg-background p-2"
                id="incident-category"
                name="category"
                aria-invalid={errors.includes('category')}
                aria-describedby={
                  errors.includes('category')
                    ? 'incident-error-category'
                    : undefined
                }
                required
                defaultValue=""
              >
                <option value="">Selecciona una categoría</option>
                {Object.entries(categories).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="incident-priority">Prioridad</label>
              <select
                className="w-full rounded-md border bg-background p-2"
                id="incident-priority"
                name="priority"
                aria-invalid={errors.includes('priority')}
                aria-describedby={
                  errors.includes('priority')
                    ? 'incident-error-priority'
                    : undefined
                }
                required
                defaultValue=""
              >
                <option value="">Selecciona una prioridad</option>
                {Object.entries(priorities).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.includes('title') && (
                <p id="incident-error-title" className="text-destructive">
                  Título: entre 5 y 150 caracteres.
                </p>
              )}
              {errors.includes('description') && (
                <p id="incident-error-description" className="text-destructive">
                  Descripción: entre 10 y 5000 caracteres.
                </p>
              )}
              {errors.includes('originPhase') && (
                <p id="incident-error-originPhase" className="text-destructive">
                  Selecciona una fase de origen.
                </p>
              )}
              {errors.includes('category') && (
                <p id="incident-error-category" className="text-destructive">
                  Selecciona una categoría.
                </p>
              )}
              {errors.includes('priority') && (
                <p id="incident-error-priority" className="text-destructive">
                  Selecciona una prioridad.
                </p>
              )}
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
              >
                {busy ? 'Creando…' : 'Crear incidencia'}
              </button>
            </fieldset>
          </form>
        )
      )}
    </section>
  );
}
