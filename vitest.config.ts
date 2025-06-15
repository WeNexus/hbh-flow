import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { swc } from 'rollup-plugin-swc3';

export default defineConfig({
  plugins: [swc(), tsconfigPaths()],
});
