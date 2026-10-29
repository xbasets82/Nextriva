import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createIncidentComment,
  type IncidentDetail,
} from '../api/incidents.js';
import {
  PromotionAction,
  iconButtonClassName,
} from '../promotions/PromotionControls.js';
import { ApiError } from '../api/transport.js';

function commentError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return 'La incidencia está cerrada o la promoción archivada. No admite comentarios.';
    if (error.status === 404)
      return 'La incidencia no está disponible o ya no tienes acceso.';
    if (error.status === 403)
      return 'No tienes permiso para añadir comentarios.';
  }
  return 'No se pudo añadir el comentario. Inténtalo de nuevo.';
}

export function IncidentComments({ incident }: { incident: IncidentDetail }) {
  const [comments, setComments] = useState(incident.comments);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const focusAfterSave = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      focusAfterSave.current = false;
      field.current?.focus();
    }
  }, [busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const value = body.trim();
    if (!value || value.length > 2000) {
      setInvalid(true);
      field.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setInvalid(false);
    setMessage('');
    try {
      const created = await createIncidentComment(incident.id, value);
      if (!mounted.current) return;
      setComments((items) => [...items, created]);
      setBody('');
      setMessage('Comentario añadido.');
      focusAfterSave.current = true;
    } catch (error) {
      if (!mounted.current) return;
      setMessage(commentError(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="incident-comments-heading"
      className="space-y-3 border-t pt-4"
    >
      <h3 id="incident-comments-heading" className="text-base font-semibold">
        Comentarios
      </h3>
      {comments.length === 0 ? (
        <p>No hay comentarios.</p>
      ) : (
        <ol className="divide-y">
          {comments.map((comment) => (
            <li key={comment.id} className="space-y-1 py-3 text-sm">
              <p className="whitespace-pre-wrap break-words">{comment.body}</p>
              <p className="break-words font-medium">
                Autor: {comment.authorName}
              </p>
              <time
                className="text-xs text-muted-foreground"
                dateTime={comment.createdAt}
              >
                {new Date(comment.createdAt).toLocaleString('es-ES')}
              </time>
            </li>
          ))}
        </ol>
      )}
      {incident.status === 'CLOSED' ? (
        <p>La incidencia está cerrada. No admite comentarios.</p>
      ) : (
        <form
          aria-label="Añadir comentario"
          aria-busy={busy}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="grid gap-2"
        >
          <label htmlFor="incident-comment">Comentario</label>
          <textarea
            ref={field}
            id="incident-comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            required
            aria-invalid={invalid}
            aria-describedby={invalid ? 'incident-comment-error' : undefined}
            disabled={busy}
            className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
          {invalid && (
            <p role="alert" id="incident-comment-error">
              Escribe entre 1 y 2000 caracteres.
            </p>
          )}
          <div className="flex justify-end">
            <PromotionAction
              type="submit"
              icon="send"
              label={busy ? 'Añadiendo…' : 'Publicar comentario'}
              disabled={busy}
              className={`${iconButtonClassName} bg-background text-foreground hover:bg-muted`}
            />
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
