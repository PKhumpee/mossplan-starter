import type { Env } from '../env';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor';
}

/** Hono generics shared by every route module. T06's `requireSession` sets `user`. */
export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser };
};
