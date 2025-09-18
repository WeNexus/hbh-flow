#!/usr/bin/env -S SWCRC=true node --import @swc-node/register/esm-register --no-experimental-strip-types --enable-source-maps

import { type Options } from 'execa';
import process from 'node:process';
import * as path from 'node:path';
import dotenv from 'dotenv';

const args = process.argv.slice(2);
const projectRoot = import.meta.dirname;
const env = dotenv.config();
const nestApps = ['api', 'worker'];

async function dev() {
  const { default: chalk } = await import('chalk');
  const { execa } = await import('execa');

  const execaOptions: Options = {
    cwd: projectRoot,
    shell: true,
    cleanup: true,
  };
  const getStdIoOptions = (
    prefix: string,
    color: (str: string) => string,
  ): Pick<Options, 'stdout' | 'stderr'> => {
    return {
      *stdout(line: string) {
        if (line.trim() === '') {
          // do not add prefix for empty lines
          console.log(line);
          yield line;
        } else {
          // add prefix and color to the line
          const msg = `${chalk.magenta('[')}${color(prefix)}${chalk.magenta(']')} ${line}`;

          console.log(msg);
          yield msg;
        }
      },
      *stderr(line: string) {
        if (line.trim() === '') {
          // do not add prefix for empty lines
          console.log(line);
          yield line;
        } else {
          // add prefix and color to the line
          const msg = `${chalk.magenta('[')}${color(prefix)}${chalk.magenta(']')} ${line}`;

          console.error(msg);
          yield msg;
        }
      },
    };
  };

  if (process.env.NGROK_AUTHTOKEN && process.env.NGROK_DOMAIN) {
    const ngrok = await import('@ngrok/ngrok');

    const listener = await ngrok.connect({
      addr: Number(process.env.API_PORT || '3001'),
      authtoken: process.env.NGROK_AUTHTOKEN,
      domain: process.env.NGROK_DOMAIN,
    });

    console.log(
      '\n',
      chalk.green(`Ngrok tunnel established at: ${listener.url()}`),
    );
  }

  // start api and worker
  for (const app of nestApps) {
    execa(
      'node',
      [
        '--watch',
        '--watch-preserve-output',
        '--import @swc-node/register/esm-register',
        `./apps/${app}/main.ts`,
        '--enable-source-maps',
        '--no-experimental-strip-types',
      ],
      {
        ipc: true,
        ...execaOptions,
        ...getStdIoOptions(
          app,
          app === 'api' ? chalk.blueBright : chalk.cyanBright,
        ),
        env: env.parsed,
      },
    );
  }

  // start ui
  const uiDir = path.join(projectRoot, 'apps/ui');

  execa(
    path.join(uiDir, 'node_modules/.bin/vite'),
    ['--port', process.env.UI_PORT || '3002', '--strictPort'],
    {
      ...execaOptions,
      cwd: uiDir,
      ...getStdIoOptions('ui', chalk.yellowBright),
      env: env.parsed,
    },
  ).catch((error) => console.error('Error starting the ui:', error));
}

async function prod() {
  const { default: cluster } = await import('node:cluster');
  const { default: os } = await import('node:os');

  if (cluster.isPrimary) {
    const cpus =
      process.env.NODE_ENV === 'development' ? 1 : os.cpus().length - 1;

    for (let i = 0; i < cpus; i++) {
      cluster.fork();
    }

    await import('./apps/api/main.js');
  } else {
    await import('./apps/worker/main.js');
  }
}

if (args.includes('--prod')) {
  await prod();
} else {
  await dev();
}
