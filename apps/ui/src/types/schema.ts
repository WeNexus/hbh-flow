import type { ListInputSchema as ListInputSchemaBase } from '#lib/core/schema';
import type * as S from '#app/api/schema';
import type { Jsonify } from 'type-fest';

export type ConnectionAuthorizationOutputSchema = S.ConnectionAuthorizationOutputSchema;
export type ConnectionWithProviderSchema = S.ConnectionWithProviderSchema;
export type ConnectionTestOutputSchema = S.ConnectionTestOutputSchema;
export type ProviderListOutputSchema = S.ProviderListOutputSchema;
export type ActivityListOutputSchema = S.ActivityListOutputSchema;
export type LoginOutputSchema = Jsonify<S.LoginOutputSchema>;
export type UserListOutputSchema = S.UserListOutputSchema;
export type ActivitySchema = Jsonify<S.ActivitySchema>;
export type ListInputSchema = ListInputSchemaBase;
export type ProviderSchema = S.ProviderSchema;
export type UserSchema = Jsonify<S.UserSchema>;
