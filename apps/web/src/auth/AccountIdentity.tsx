import { useState } from 'react';
import type { User } from '../api/users.js';

const roleLabels = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  COLLABORATOR: 'Colaborador',
} as const;

export function AccountIdentity({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const name = `${user.firstName} ${user.lastName}`.trim() || 'Mi cuenta';
  const initials =
    `${user.firstName.trim().charAt(0)}${user.lastName.trim().charAt(0)}`.toLocaleUpperCase(
      'es',
    );
  return (
    <div role="group" aria-label="Cuenta de usuario" className="min-w-0">
      <details
        className="account-identity"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary aria-label={`${name} · ${roleLabels[user.role]}`}>
          <span aria-hidden="true" className="account-avatar">
            {initials || 'N'}
          </span>
          <span className="account-name">
            <span className="block truncate font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">
              {roleLabels[user.role]}
            </span>
          </span>
        </summary>
        {open && (
          <div className="account-popover">
            <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
            <p className="text-xs text-muted-foreground">
              {roleLabels[user.role]}
            </p>
            <p className="mt-2 text-xs [overflow-wrap:anywhere]">
              {user.email}
            </p>
          </div>
        )}
      </details>
    </div>
  );
}
