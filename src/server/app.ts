import { Hono } from 'hono';
import { onError, onNotFound } from './http/errors';
import { securityHeaders } from './http/security';
import type { AppEnv } from './http/types';
import { affiliateRoutes } from './routes/affiliate';
import { articlesRoutes } from './routes/articles';
import { authRoutes } from './routes/auth';
import { buildsRoutes } from './routes/builds';
import { internalRoutes } from './routes/internal';
import { mediaRoutes } from './routes/media';
import { profileRoutes } from './routes/profile';
import { statsRoutes } from './routes/stats';
import { taxonomyRoutes } from './routes/taxonomy';
import { teamRoutes } from './routes/team';
import { settingsRoutes } from './routes/settings';
import { setupRoutes } from './routes/setup';
import { healthRoutes } from './routes/health';

// Every route module in CONTRACTS §5 is mounted from day one; owners fill their own file.
// Each module declares paths relative to `/api`, so all are mounted at `/`.
// Order matters where prefixes overlap: `profileRoutes` owns `/admin/team/users/:id/profile` and must
// come before `teamRoutes` (`/admin/team/*`).
export const app = new Hono<AppEnv>({ strict: false })
  .basePath('/api')
  .use('*', securityHeaders)
  .route('/', healthRoutes)
  .route('/', authRoutes)
  .route('/', articlesRoutes)
  .route('/', profileRoutes)
  .route('/', mediaRoutes)
  .route('/', taxonomyRoutes)
  .route('/', teamRoutes)
  .route('/', settingsRoutes)
  .route('/', setupRoutes)
  .route('/', buildsRoutes)
  .route('/', internalRoutes)
  .route('/', statsRoutes)
  .route('/', affiliateRoutes);

app.onError(onError);
app.notFound(onNotFound);
