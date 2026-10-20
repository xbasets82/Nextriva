import type { User } from '../../generated/prisma/client.js';
import { PasswordHasher } from './password-hasher.js';
import { normalizeEmail, toSafeUser } from './user-projection.js';

export type NewUserRecord = Pick<
  User,
  'firstName' | 'lastName' | 'email' | 'passwordHash' | 'role'
>;

export interface UsersWriter {
  create(user: NewUserRecord): Promise<User>;
}

export interface CreateUserInput extends Omit<
  NewUserRecord,
  'email' | 'passwordHash'
> {
  email: string;
  password: string;
}

export class UsersService {
  constructor(
    private readonly usersWriter: UsersWriter,
    private readonly passwordHasher: Pick<PasswordHasher, 'hash'>,
  ) {}

  async create(input: CreateUserInput) {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.usersWriter.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: normalizeEmail(input.email),
      passwordHash,
      role: input.role,
    });

    return toSafeUser(user);
  }
}
