import type { NestFactoryStatic } from '@nestjs/core/nest-factory.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvService } from './env/env.service.js';

const initSentryMock = vi.fn();
const listenMock = vi.fn();

vi.mock('./sentry.js', () => ({
  initSentry: initSentryMock,
}));

vi.mock(import('@nestjs/core'), async (importOriginal) => {
  const { default: original } = await importOriginal();

  return {
    ...original,
    NestFactory: {
      ...original.NestFactory,
      createApplicationContext(...args: any[]) {
        // @ts-expect-error NestFactory.createApplicationContext expects a module and options, but we are mocking it
        return original.NestFactory.createApplicationContext(...args);
      },
      async create(...args: any[]) {
        // @ts-expect-error NestFactory.create expects a module and options, but we are mocking it
        const app = await original.NestFactory.create(...args);

        return new Proxy(app, {
          get(target, prop) {
            if (prop === 'listen') {
              return listenMock;
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return target[prop];
          },
          set(target, prop, value) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            target[prop] = value;
            return true;
          },
        });
      },
    } as NestFactoryStatic,
  };
});

const { bootstrap, AppType } = await import('./bootstrap.js');

describe('bootstrap()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize Sentry with the correct app type', async () => {
    await bootstrap({ appType: AppType.API });
    expect(initSentryMock).toHaveBeenCalledWith(AppType.API);

    initSentryMock.mockClear();

    await bootstrap({ appType: AppType.Worker });
    expect(initSentryMock).toHaveBeenCalledWith(AppType.Worker);
  });

  it('should create a Nest application context for Worker app type', async () => {
    const { NestFactory } = await import('@nestjs/core');

    const nestFactoryMock = vi.spyOn(NestFactory, 'createApplicationContext');

    await bootstrap({ appType: AppType.Worker });
    expect(nestFactoryMock).toHaveBeenCalledWith(expect.anything());
  });

  it('should create a NestExpressApplication for API app type', async () => {
    const { NestFactory } = await import('@nestjs/core');

    const nestFactoryMock = vi.spyOn(NestFactory, 'create');

    await bootstrap({ appType: AppType.API });

    expect(nestFactoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        forceCloseConnections: true,
      }),
    );
  });

  it('should call listen on the application for API app type', async () => {
    const envService = { getNumber: vi.fn().mockReturnValue(3001) };

    vi.spyOn(EnvService.prototype, 'getNumber').mockImplementation(
      envService.getNumber,
    );

    await bootstrap({ appType: AppType.API });
    expect(listenMock).toHaveBeenCalledWith(3001);
  });

  it('should not call listen for Worker app type', async () => {
    await bootstrap({ appType: AppType.Worker });
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('should handle different app types in the same test run', async () => {
    const appApi = await bootstrap({ appType: AppType.API });
    const appWorker = await bootstrap({ appType: AppType.Worker });

    expect(appApi).toBeDefined();
    expect(appWorker).toBeDefined();
  });
});
