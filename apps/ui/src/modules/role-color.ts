import type { Role } from '@/types/backend-types.ts';

export const roleColor = (role: Role) => {
  switch (role) {
    case 'SYSTEM':
      return 'error';
    case 'ADMIN':
      return 'primary';
    case 'DEVELOPER':
      return 'secondary';
    case 'DATA_ENTRY':
      return 'warning';
    case 'OBSERVER':
      return 'info';
    default:
      return 'default';
  }
};