import type { IncidentIdentity } from '../api/incidents.js';

export function IncidentPerson({
  person,
  historical = false,
}: {
  person: IncidentIdentity | null | undefined;
  historical?: boolean;
}) {
  if (!person)
    return (
      <span>
        {historical
          ? 'Identidad histórica no registrada'
          : 'Identidad no disponible'}
      </span>
    );
  return (
    <span className="inline-grid min-w-0 gap-1">
      <span className="break-words">
        {`${person.firstName} ${person.lastName}`.trim() ||
          'Nombre no registrado'}
      </span>
      {person.email && (
        <span className="break-all text-xs text-muted-foreground">
          {person.email}
        </span>
      )}
    </span>
  );
}
