export interface ZohoUserInfo {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  pictureUrl: string | null;
}
