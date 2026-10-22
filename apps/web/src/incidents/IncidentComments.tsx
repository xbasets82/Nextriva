import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createIncidentComment,
  type IncidentDetail,
} from '../api/incidents.js';
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
    <section aria-labelledby="incident-comments-heading" className="space-y-4">
      <h3 id="incident-comments-heading" className="text-xl font-semibold">
        Comentarios
      </h3>
      {comments.length === 0 ? (
        <p>No hay comentarios.</p>
      ) : (
        <ol className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-xl border p-4">
              <p className="whitespace-pre-wrap break-words">{comment.body}</p>
              <p className="break-words">Autor: {comment.authorName}</p>
              <time dateTime={comment.createdAt}>
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
          className="space-y-2"
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
            className="min-h-24 w-full rounded-md border bg-background p-2"
          />
          {invalid && (
            <p role="alert" id="incident-comment-error">
              Escribe entre 1 y 2000 caracteres.
            </p>
          )}
          <button
            disabled={busy}
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            {busy ? 'Añadiendo…' : 'Añadir comentario'}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
