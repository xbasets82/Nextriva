export const safeUserSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'firstName',
    'lastName',
    'email',
    'role',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'COLLABORATOR'] },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
