export class UserUniqueConstraintError extends Error {
  constructor() {
    super('The user could not be created because of a uniqueness conflict.');
    this.name = 'UserUniqueConstraintError';
  }
}
