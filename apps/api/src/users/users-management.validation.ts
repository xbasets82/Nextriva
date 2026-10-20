import { BadRequestException } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';
import { normalizeEmail } from './user-projection.js';

export interface UserDetails {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}
export interface NewManagedUser extends UserDetails {
  password: string;
}
const roles = ['ADMIN', 'MANAGER', 'COLLABORATOR'];
function invalid(): never {
  throw new BadRequestException('Datos de usuario inválidos');
}
function object(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    invalid();
  if (Object.keys(body).some((key) => !allowed.includes(key))) invalid();
  return body as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    invalid();
  return value.trim();
}
export function userChanges(body: unknown): Partial<UserDetails> {
  const source = object(body, ['firstName', 'lastName', 'email', 'role']);
  if (Object.keys(source).length === 0) invalid();
  const result: Partial<UserDetails> = {};
  if ('firstName' in source) result.firstName = text(source.firstName, 2, 100);
  if ('lastName' in source) result.lastName = text(source.lastName, 2, 150);
  if ('email' in source) {
    const email = normalizeEmail(text(source.email, 3, 320));
    const parts = email.split('@');
    const domain = parts[1];
    if (
      parts.length !== 2 ||
      !parts[0] ||
      !domain ||
      !domain.includes('.') ||
      domain.startsWith('.') ||
      domain.endsWith('.') ||
      /\s/.test(email)
    )
      invalid();
    result.email = email;
  }
  if ('role' in source) {
    if (typeof source.role !== 'string' || !roles.includes(source.role))
      invalid();
    result.role = source.role as UserRole;
  }
  return result;
}
export function newManagedUser(body: unknown): NewManagedUser {
  const source = object(body, [
    'firstName',
    'lastName',
    'email',
    'role',
    'password',
  ]);
  const details = userChanges(
    Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== 'password'),
    ),
  );
  if (
    !details.firstName ||
    !details.lastName ||
    !details.email ||
    !details.role ||
    typeof source.password !== 'string' ||
    !source.password ||
    source.password.length > 1024
  )
    invalid();
  return {
    firstName: details.firstName,
    lastName: details.lastName,
    email: details.email,
    role: details.role,
    password: source.password,
  };
}
export function userStatus(body: unknown): boolean {
  const source = object(body, ['isActive']);
  if (typeof source.isActive !== 'boolean') invalid();
  return source.isActive;
}
export function userId(value: string): string {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value;
}
