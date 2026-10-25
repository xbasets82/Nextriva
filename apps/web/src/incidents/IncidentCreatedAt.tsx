const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatIncidentCreatedAt(
  value: string,
  includeTime = false,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return (includeTime ? dateTimeFormatter : dateFormatter).format(date);
}

export function IncidentCreatedAt({
  value,
  includeTime = false,
  className = '',
}: {
  value: string;
  includeTime?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground ${className}`}
    >
      <svg
        aria-hidden="true"
        className="size-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
      <time dateTime={value}>
        {formatIncidentCreatedAt(value, includeTime)}
      </time>
    </span>
  );
}
