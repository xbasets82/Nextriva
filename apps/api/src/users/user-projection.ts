import type { User } from '../../generated/prisma/client.js';

export type UserRecord = User;
export type SafeUser = Omit<UserRecord, 'passwordHash'>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toSafeUser(user: UserRecord): SafeUser {
  const {
    id,
    firstName,
    lastName,
    email,
    role,
    isActive,
    createdAt,
    updatedAt,
  } = user;
  return {
    id,
    firstName,
    lastName,
    email,
    role,
    isActive,
    createdAt,
    updatedAt,
  };
}
