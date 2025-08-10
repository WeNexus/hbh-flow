import type { PageContext } from '@/types/page-context.ts';
import { CircularProgress } from '@mui/material';
import { useOutletContext } from 'react-router';
import { useEffect, useState } from 'react';
import { api } from '@/modules/api';

import type {
  ProviderListOutputSchema,
} from '@/types/schema.ts';

export function Integrations() {
  const ctx = useOutletContext<PageContext>();
  const [data, setData] = useState<ProviderListOutputSchema | null>(null);

  useEffect(() => {
    ctx.setShowSearch(true);
    ctx.setShowDatePicker(false);
  }, [ctx]);

  useEffect(() => {
    api.get<ProviderListOutputSchema>('/providers').then((r) => {
      setData(r.data);
    });
  }, []);

  if (!data) {
    return (
      <div>
        <CircularProgress></CircularProgress>
      </div>
    );
  }

  return (
    <div>
      <p>Manage your integrations with various providers.</p>
      <ul>
        {data.data.map((provider) => (
          <li key={provider.id}>
            <h2>{provider.name}</h2>
            <p>{provider.description}</p>
            <a href={provider.documentationUrl} target="_blank" rel="noopener noreferrer">
              Documentation
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
