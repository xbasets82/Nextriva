import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';

export const iconButtonClassName =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50';

export function PromotionIcon({
  kind,
}: {
  kind:
    | 'create'
    | 'location'
    | 'active'
    | 'archived'
    | 'clear'
    | 'reset'
    | 'back'
    | 'incident'
    | 'edit'
    | 'archive'
    | 'reactivate'
    | 'add'
    | 'remove'
    | 'list'
    | 'send'
    | 'save'
    | 'start'
    | 'approve'
    | 'reject'
    | 'delete';
}) {
  const icon = {
    create: 'building-2',
    location: 'map-pin',
    active: 'circle-check',
    archived: 'circle-pause',
    clear: 'filter-x',
    reset: 'rotate-ccw',
    back: 'arrow-left',
    incident: 'file-plus-2',
    edit: 'pencil',
    archive: 'archive',
    reactivate: 'archive-restore',
    add: 'plus',
    remove: 'user-round-minus',
    list: 'list',
    send: 'send',
    save: 'save',
    start: 'play',
    approve: 'check',
    reject: 'x',
    delete: 'trash-2',
  }[kind];
  return (
    <svg
      aria-hidden="true"
      data-icon={icon}
      className={
        kind === 'location' ? 'inline-block size-4 shrink-0' : undefined
      }
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'create' && (
        <>
          <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
          <path d="M9 9v.01M9 12v.01M9 15v.01M16 14v.01M16 17v.01" />
        </>
      )}
      {kind === 'location' && (
        <>
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {kind === 'active' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      )}
      {kind === 'archived' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9v6M15 9v6" />
        </>
      )}
      {kind === 'clear' && (
        <>
          <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5L4 5Z" />
          <path d="m17 15 5 5m0-5-5 5" />
        </>
      )}
      {kind === 'reset' && <path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" />}
      {kind === 'list' && (
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      )}
      {kind === 'send' && <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />}
      {kind === 'save' && (
        <path d="M19 21H5a2 2 0 0 1-2-2V3h14l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8" />
      )}
      {kind === 'start' && <path d="m8 4 13 8-13 8V4Z" />}
      {kind === 'approve' && <path d="m5 12 4 4L19 6" />}
      {kind === 'delete' && (
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      )}
      {kind === 'reject' && <path d="m6 6 12 12M6 18 18 6" />}
      {kind === 'back' && <path d="m12 5-7 7 7 7M5 12h15" />}
      {kind === 'incident' && (
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M12 12v6m-3-3h6" />
      )}
      {kind === 'edit' && <path d="m16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5" />}
      {(kind === 'archive' || kind === 'reactivate') && (
        <path d="M3 3h18v4H3zM5 7v14h14V7" />
      )}
      {kind === 'archive' && <path d="M10 11h4" />}
      {kind === 'reactivate' && <path d="m9 13 3-3 3 3m-3-3v7" />}
      {kind === 'add' && <path d="M12 5v14M5 12h14" />}
      {kind === 'remove' && (
        <>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-2a7 7 0 0 1 14 0v2M17 10h5" />
        </>
      )}
    </svg>
  );
}

export function FilterChevron() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PromotionAction({
  label,
  icon,
  href,
  onClick,
  disabled,
  buttonRef,
  className,
  type = 'button',
}: {
  label: string;
  icon: Parameters<typeof PromotionIcon>[0]['kind'];
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const tooltipId = useId();
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
  const content: ReactNode = <PromotionIcon kind={icon} />;
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
      {href ? (
        <a
          href={href}
          aria-label={label}
          aria-describedby={open ? tooltipId : undefined}
          className={className ?? iconButtonClassName}
        >
          {content}
        </a>
      ) : (
        <button
          ref={buttonRef}
          type={type}
          aria-label={label}
          aria-describedby={open ? tooltipId : undefined}
          disabled={disabled}
          onClick={onClick}
          className={className ?? iconButtonClassName}
        >
          {content}
        </button>
      )}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute ${icon === 'back' ? 'left-0' : 'right-0'} top-full z-20 w-max max-w-48 rounded-md bg-foreground px-2 py-1 text-xs text-background`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function PromotionStateIndicator({
  status,
}: {
  status: 'ACTIVE' | 'ARCHIVED';
}) {
  const label = status === 'ACTIVE' ? 'Activa' : 'Archivada';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={
        status === 'ACTIVE'
          ? 'inline-flex text-emerald-700 dark:text-emerald-400'
          : 'inline-flex text-muted-foreground'
      }
    >
      <PromotionIcon kind={status === 'ACTIVE' ? 'active' : 'archived'} />
    </span>
  );
}
