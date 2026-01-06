export interface Link {
  url?: string;
  label: string;
  active: boolean;
}

export interface Meta {
  current_page: number;
  from: number;
  last_page: number;
  links: Link[];
  path: string;
  per_page: number;
  to: number;
  total: number;
}

export interface Links {
  first: string;
  last: string;
  prev: string;
  next: string;
}

export type PaginatedResponse<T> = {
  links: Links;
  meta: Meta;
} & T;
