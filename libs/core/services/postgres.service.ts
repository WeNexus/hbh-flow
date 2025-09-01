import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EnvService } from '#lib/core/env';
import postgres, { Sql } from 'postgres';

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PostgresService implements OnModuleDestroy {
  constructor(env: EnvService) {
    const sql = postgres(env.getString('DATABASE_URL'), {
      max: 30,
      idle_timeout: 30,
      connect_timeout: 30,
    });

    const fn = function (
      this: PostgresService,
    ) {} as unknown as PostgresService;

    for (const key in sql) {
      if (!Object.prototype.hasOwnProperty.call(sql, key)) {
        continue;
      }

      if (typeof sql[key] === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
        fn[key] = sql[key].bind(this);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        fn[key] = sql[key];
      }
    }

    Object.setPrototypeOf(fn, PostgresService.prototype);

    fn.sql = sql;

    return new Proxy(fn, {
      apply(_: PostgresService, __: PostgresService, argArray: any[]): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        return (sql as any)(...argArray);
      },
    });
  }

  private sql: Sql;

  execute<T extends readonly (object | undefined)[] = any>(
    ...args: Parameters<Sql>
  ): Promise<T> {
    return this.sql<T>(...args);
  }

  onModuleDestroy() {
    return this.sql.end({ timeout: 10 }).catch(() => {});
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface PostgresService extends Sql {}
