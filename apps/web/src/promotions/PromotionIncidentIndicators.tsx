import { useEffect, useId, useState, type ReactNode } from 'react';
import { priorities, statusLabels, type Incident } from '../api/incidents.js';

function Indicator({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape') setDismissed(true);
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  return (
    <span
      className="relative inline-flex shrink-0"
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlurCapture={() => setFocused(false)}
    >
      <span
        role="img"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        tabIndex={0}
        className={`inline-flex size-8 cursor-help items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
      >
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-full z-20 w-max max-w-48 rounded-md bg-foreground px-2 py-1 text-xs text-background"
        >
          {label}
        </span>
      )}
    </span>
  );
}

function StatusIcon({ status }: { status: Incident['status'] }) {
  return (
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
      <circle
        cx="12"
        cy="12"
        r="9"
        strokeDasharray={status === 'IN_PROGRESS' ? '38 19' : undefined}
      />
      {status === 'PENDING_VALIDATION' && <path d="M12 7v5l3 2" />}
      {status === 'CLOSED' && <path d="m8 12 2.5 2.5L16 9" />}
    </svg>
  );
}

function PriorityIcon({ priority }: { priority: Incident['priority'] }) {
  const level = { LOW: 1, MEDIUM: 2, HIGH: 3 }[priority];
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 18v-4" />
      {level >= 2 && <path d="M12 18v-8" />}
      {level >= 3 && <path d="M18 18V6" />}
    </svg>
  );
}

export function PromotionIncidentIndicators({
  status,
  priority,
}: Pick<Incident, 'status' | 'priority'>) {
  const statusColor = {
    OPEN: 'text-sky-700 dark:text-sky-300',
    IN_PROGRESS: 'text-amber-700 dark:text-amber-300',
    PENDING_VALIDATION: 'text-violet-700 dark:text-violet-300',
    CLOSED: 'text-green-700 dark:text-green-300',
  }[status];
  const priorityColor = {
    LOW: 'text-slate-600 dark:text-slate-300',
    MEDIUM: 'text-amber-700 dark:text-amber-300',
    HIGH: 'text-red-700 dark:text-red-300',
  }[priority];
  return (
    <div
      role="group"
      aria-label="Estado y prioridad"
      className="col-start-2 row-span-2 row-start-1 flex shrink-0 items-center justify-end gap-1"
    >
      <Indicator label={statusLabels[status]} className={statusColor}>
        <StatusIcon status={status} />
      </Indicator>
      <Indicator label={priorities[priority]} className={priorityColor}>
        <PriorityIcon priority={priority} />
      </Indicator>
    </div>
  );
}
