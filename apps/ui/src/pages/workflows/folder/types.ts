import type { FolderSchema, WorkflowSchema } from '@/types/schema.ts';

export type Row =
  | {
  type: 'workflow';
  data: WorkflowSchema;
}
  | {
  type: 'folder';
  data: FolderSchema;
};

export interface WorkflowsProps {
  defaultPageSize?: number;
  hideColumns?: string[];
  embedded?: boolean;
  folderId: number | null;
}