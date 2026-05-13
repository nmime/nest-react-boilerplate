import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  platform: 'node',
  dts: true,
  tsconfig: './tsconfig.json',
  deps: {
    neverBundle: ['drizzle-orm', 'drizzle-orm/pg-core', 'pg', 'postgres'],
  },
})
