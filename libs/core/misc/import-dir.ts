import fs, { Stats } from 'node:fs';
import path from 'node:path';

const extensionsRegx = /^(?!.*\.d\.ts$).*\.(js|ts|mts|cjs|mjs)$/;

export async function importDir(
  dir: string,
  pick: (path: string, stat: Stats) => any,
): Promise<any[]> {
  const queue = [dir];
  const mods: string[] = [];

  while (queue.length > 0) {
    const dir = queue.shift();

    if (!dir) {
      break;
    }

    const entries = await fs.promises.readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      const stat = await fs.promises.stat(fullPath);

      if (stat.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!extensionsRegx.test(entry)) {
        continue;
      }

      const result = await pick(fullPath, stat);

      if (result !== undefined) {
        mods.push(result);
      }
    }
  }

  return mods;
}
