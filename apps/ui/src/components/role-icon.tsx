import type { Role } from '@/types/backend-types.ts';
import { roleColor } from '@/modules/role-color.ts';
import { useMemo } from 'react';

import {
  EngineeringOutlined as EngineeringIcon,
  VisibilityOutlined as VisibilityIcon,
  KeyboardOutlined as KeyboardIcon,
  AndroidOutlined as AndroidIcon,
  ShieldOutlined as ShieldIcon,
  PersonOutlined as PersonIcon,
} from '@mui/icons-material';

export function RoleIcon({ role }: { role: Role }) {
  const color = useMemo(() => roleColor(role), [role]);

  switch (role) {
    case 'SYSTEM':
      return <AndroidIcon color={color} />;
    case 'ADMIN':
      return <ShieldIcon color={color} />;
    case 'DEVELOPER':
      return <EngineeringIcon color={color} />;
    case 'DATA_ENTRY':
      return <KeyboardIcon color={color} />;
    case 'OBSERVER':
      return <VisibilityIcon color={color} />;
    default:
      return <PersonIcon color={color} />;
  }
}
