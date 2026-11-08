import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes Wrangler-compatible SQL migrations to `migrations/`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './migrations',
});
