import { useCallback, useEffect, useState } from 'react';
import type { WorkflowSchema } from '@/types/schema.ts';
import { useHeader } from '@/hooks/use-header.ts';
import { useApi } from '@/hooks/use-api.ts';

export interface WorkflowProps {
  workflowId: number;
}

export function Workflow({ workflowId }: WorkflowProps) {
  const [workflow, setWorkflow] = useState<WorkflowSchema | null>(null);
  const { UI: updateHeaderUI } = useHeader();
  const { api } = useApi();

  const fetchWorkflow = useCallback(async () => {
    const res = await api.get<WorkflowSchema>(`/workflows/${workflowId}`);

    setWorkflow(res.data);
  }, [api, workflowId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: false,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!workflow) {
    return <div>Loading...</div>;
  }

  return <div>Workflow: {workflowId}</div>;
}