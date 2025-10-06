export type GQLResponse<T> = T & {
  userErrors?: Array<{
    field: string[];
    message: string;
    code?: string;
  }>;
};

export interface GQLInput {
  connection: string;
  query: string;
  root: string;
  variables?: Record<string, any>;
}

export interface StagedUploadInput {
  connection: string;
  filename: string;
  mimeType: string;
  httpMethod?: 'POST' | 'PUT';
  resource: 'BULK_MUTATION_VARIABLES' | 'FILE';
  data: Buffer | string | NodeJS.ReadableStream;
}
