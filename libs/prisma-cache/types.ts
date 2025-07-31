import type { Prisma } from '@prisma/client/extension';
import type { Redis, RedisOptions } from 'ioredis';
import type { CacheCase } from './cache-key';

import type {
  ModelQueryOptionsCbArgs,
  Operation,
  JsArgs,
} from '@prisma/client/runtime/library';

export const AUTO_REQUIRED_ARG_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
] as const satisfies ReadonlyArray<Operation>;

export const AUTO_OPTIONAL_ARG_OPERATIONS = [
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
] as const satisfies ReadonlyArray<Operation>;

export const AUTO_OPERATIONS = [
  ...AUTO_REQUIRED_ARG_OPERATIONS,
  ...AUTO_OPTIONAL_ARG_OPERATIONS,
] as const;
export type autoOperations = (typeof AUTO_OPERATIONS)[number];

export const CACHE_REQUIRED_ARG_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
] as const satisfies ReadonlyArray<Operation>;

export const CACHE_OPTIONAL_ARG_OPERATIONS = [
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
] as const satisfies ReadonlyArray<Operation>;

export const CACHE_OPERATIONS = [
  ...CACHE_REQUIRED_ARG_OPERATIONS,
  ...CACHE_OPTIONAL_ARG_OPERATIONS,
] as const;

export const UNCACHE_REQUIRED_ARG_OPERATIONS = [
  'create',
  'delete',
  'update',
  'upsert',
] as const satisfies ReadonlyArray<Operation>;

export const UNCACHE_OPTIONAL_ARG_OPERATIONS = [
  'createMany',
  'createManyAndReturn',
  'deleteMany',
  'updateMany',
] as const satisfies ReadonlyArray<Operation>;

export const UNCACHE_OPERATIONS = [
  ...UNCACHE_REQUIRED_ARG_OPERATIONS,
  ...UNCACHE_OPTIONAL_ARG_OPERATIONS,
] as const;

export interface CacheOptionsWithStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Custom time-to-live (ttl) value.
   * If undefined, key stays in cache till uncached
   */
  ttl?: number;

  /**
   * Custom stale value.
   * Stale cannot be set without ttl
   */
  stale?: never;
}

export interface CacheOptionsWithoutStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Custom time-to-live (ttl) value.
   * If undefined, key stays in cache till uncached
   */
  ttl: number;

  /**
   * Custom stale value.
   * If undefined, stale is zero
   */
  stale?: number;
}

export type CacheOptions = CacheOptionsWithStale | CacheOptionsWithoutStale;

export interface UncacheOptions {
  /**
   * Uncache keys
   */
  uncacheKeys: string[];

  /**
   * Pattern in keys?
   */
  hasPattern?: boolean;
}

type PrismaCacheArgs = {
  cache?: CacheOptions | boolean;
};

type PrismaUncacheArgs = {
  uncache?: UncacheOptions;
};

type CacheResultPromise<T, A, O extends Operation> = Promise<{
  result: Prisma.Result<T, A, O>;
  isCached: boolean;
}>;

type UnCacheResultPromise<T, A, O extends Operation> = Promise<{
  result: Prisma.Result<T, A, O>;
}>;

type CacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => CacheResultPromise<T, A, O>;

type CacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => CacheResultPromise<T, A, O>;

type UncacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => UnCacheResultPromise<T, A, O>;

type UncacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => UnCacheResultPromise<T, A, O>;

type OperationsConfig<
  RequiredArg extends Operation[],
  OptionalArg extends Operation[],
> = {
  requiredArg: RequiredArg;
  optionalArg: OptionalArg;
};

type ModelExtension<
  Config extends OperationsConfig<Operation[], Operation[]>,
  M extends 'cache' | 'uncache',
> = {
  [RO in Config['requiredArg'][number]]: M extends 'cache'
    ? CacheRequiredArgsFunction<RO>
    : UncacheRequiredArgsFunction<RO>;
} & {
  [OO in Config['optionalArg'][number]]: M extends 'cache'
    ? CacheOptionalArgsFunction<OO>
    : UncacheOptionalArgsFunction<OO>;
};

type cacheConfig = {
  requiredArg: (typeof CACHE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof CACHE_OPTIONAL_ARG_OPERATIONS)[number][];
};

type uncacheConfig = {
  requiredArg: (typeof UNCACHE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof UNCACHE_OPTIONAL_ARG_OPERATIONS)[number][];
};

export type ExtendedModel = ModelExtension<cacheConfig, 'cache'> &
  ModelExtension<uncacheConfig, 'uncache'>;

export type CacheType = 'JSON' | 'STRING';

export type CacheKey = {
  /**
   * Cache key delimiter
   * Default value: ':'
   */
  delimiter?: string;

  /**
   * Use CacheCase to set how the generated INBUILT type keys are formatted
   * Formatting strips non alpha-numeric characters
   * Default value: CacheCase.SNAKE_CASE
   */
  case?: CacheCase;

  /**
   * AutoCache key prefix
   * Default value: 'prisma'
   */
  prefix?: string;
};

interface LoggerInput {
  msg: string;

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  [key: string]: any;
}

interface Logger {
  debug: (input: LoggerInput) => void;
  warn: (input: LoggerInput) => void;
  error: (input: LoggerInput) => void;
}

export type CacheConfig = {
  auto: AutoCacheConfig;

  /**
   * Redis Cache Type (Redis instance must support JSON module to use JSON)
   */
  type: CacheType;

  /**
   * Inbuilt cache key generation config
   */
  cacheKey?: CacheKey;

  /**
   * Default time-to-live (ttl) value
   */
  ttl: number;

  /**
   * Default stale time after ttl
   */
  stale: number;

  /**
   * Custom transfomrer for serializing and deserializing data
   */
  transformer?: {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    serialize: (data: any) => any;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    deserialize: (data: any) => any;
  };
  logger?: Logger;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  onError?: (error: any) => void;
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;
};

export interface ModelConfig {
  /**
   * Model
   */
  model: string;

  /**
   * Excluded cache operations
   */
  excludedOperations?: autoOperations[];

  /**
   * Auto - stale time after ttl
   */
  stale?: number;

  /**
   * Model specific time-to-live (ttl) value
   */
  ttl?: number;
}

export type AutoCacheConfig =
  | {
      /**
       * Default excluded models
       */
      excludedModels?: string[];

      /**
       * Default excluded cache operations
       */
      excludedOperations?: autoOperations[];

      /**
       * Default model configuration
       */
      models?: ModelConfig[];

      /**
       * Auto stale time after ttl
       */
      stale?: number;

      /**
       * Auto time-to-live (ttl) value
       */
      ttl?: number;
    }
  | boolean;

export interface PrismaExtensionRedisOptions {
  /**
   * Cache config
   */
  config: CacheConfig;

  /**
   * Redis client config (ioredis)
   */
  client: RedisOptions;
}

export type DeletePatterns = {
  /**
   * Redis client
   */
  redis: Redis;

  /**
   * Patterns for key deletion
   */
  patterns: string[];
};

export type ActionParams = {
  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;

  /**
   * Redis client
   */
  redis: Redis;

  /**
   * CacheConfig
   */
  config: CacheConfig;

  /**
   * Auto stale time after ttl
   */
  stale?: number;

  /**
   * Auto time-to-live (ttl) value
   */
  ttl?: number;
};

export type ActionCheckParams = {
  /**
   * Auto cache config
   */
  auto?: AutoCacheConfig;

  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;
};

export type GetDataParams = {
  ttl: number;
  stale: number;
  config: CacheConfig;
  key: string;
  redis: Redis;
  args: JsArgs;
  query: (args: JsArgs) => Promise<unknown>;
};

export type CacheContext = {
  isCached: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: <Any Result>
  result: any;
  stale: number;
  timestamp: number;
  ttl: number;
};

export type RedisCacheResultOrError =
  | [error: Error | null, result: unknown][]
  | null;

export type RedisCacheCommands = Record<
  string,
  {
    get: (redis: Redis, key: string) => Promise<RedisCacheResultOrError>;
    set: (
      redis: Redis,
      key: string,
      value: string,
      ttl: number,
    ) => Promise<RedisCacheResultOrError>;
  }
>;

export type CacheKeyParams = {
  /**
   * Key params to generate key
   */
  params: Record<string, string>[];

  /**
   * Model name
   */
  model?: string;

  /**
   * Operation name
   */
  operation?: Operation;
};

export type CacheAutoKeyParams = {
  /**
   * Query args
   */
  args: JsArgs;

  /**
   * Model name
   */
  model: string;

  /**
   * Operation name
   */
  operation: Operation;
};

export type CacheKeyPatternParams = {
  /**
   * Key params to generate key
   */
  params: Record<string, string>[];

  /**
   * Model name
   */
  model?: string;

  /**
   * Operation name
   */
  operation?: Operation;
};
