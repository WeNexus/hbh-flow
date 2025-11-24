import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { importDir } from '#lib/core/misc';
import { Type } from '@nestjs/common';

const thisFile = new URL(import.meta.url).pathname;

export const workflows: Type<WorkflowBase>[] = await importDir(
  import.meta.dirname,
  async (path) => {
    if (path === thisFile) {
      return;
    }

    const mod = await import(path);

    for (const exportKey of Object.keys(mod)) {
      const exported = mod[exportKey];

      if (typeof exported !== 'function') {
        continue;
      }

      if (Object.getPrototypeOf(exported) === WorkflowBase) {
        return exported as Type<WorkflowBase>;
      }
    }
  },
);
