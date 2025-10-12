export interface Session {
  app_id: number;
  app_version_id: number;
  install_id: number;
  client_id: string;
  account_id: number;
  user_id: number;
  slug: string;
  is_admin: boolean;
  is_view_only: boolean;
  is_guest: boolean;
  user_kind: string;
}
