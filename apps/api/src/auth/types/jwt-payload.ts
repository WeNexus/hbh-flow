export interface JwtPayload {
  uid: string; // User ID
  cst: string; // CSRF Token Hash
}
