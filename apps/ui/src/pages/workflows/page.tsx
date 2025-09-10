import { Folder } from './folder/folder.tsx';
import { useParams } from 'react-router';
import { useMemo } from 'react';

export function Workflows() {
  const param = useParams()['*'];

  const entity = useMemo(() => {
    if (!param) {
      return null;
    }

    const [type, id] = param.split('__').pop()?.split('_') ?? [];

    if (type === 'folder') {
      return {
        type: 'folder' as const,
        id: Number(id),
      };
    }

    if (type === 'workflow') {
      return {
        type: 'workflow' as const,
        id: Number(id),
      };
    }

    return null;
  }, [param]);

  if (!entity || entity.type === 'folder') {
    return <Folder folderId={entity?.id ?? null} />;
  }

  return <div>Workflow {entity.id}</div>;
}
