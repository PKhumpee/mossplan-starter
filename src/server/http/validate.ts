import type { Context } from 'hono';
import { z } from 'zod';

/** Thrown for a request body that is not valid JSON; mapped to 400 `VALIDATION_FAILED`. */
export class InvalidJsonError extends Error {
  constructor() {
    super('Request body is not valid JSON');
    this.name = 'InvalidJsonError';
  }
}

/**
 * Parses `data` with `schema`. A ZodError propagates to the app's error handler (400 `VALIDATION_FAILED`).
 * Use `z.strictObject` for request bodies so unknown fields are rejected (CONTRACTS §5).
 */
export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new InvalidJsonError();
  }
  return validate(schema, body);
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return validate(schema, c.req.query());
}

export function parseParams<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return validate(schema, c.req.param());
}

/** `?page=` (1-based) and `?limit=` (default 20, max 100) for list endpoints (CONTRACTS §5). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
