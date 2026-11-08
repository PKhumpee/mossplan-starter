// Typed fetch wrapper for the admin islands (CONTRACTS §5): unwraps `{ data }`, throws `ApiError` from
// `{ error }`, and sends signed-out users to the login page.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialised request body. */
  body?: unknown;
  /** Appended to the path; `undefined`/`null` values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

export const LOGIN_PATH = '/admin/login/';

/** Sends the browser to the sign-in page, remembering where it was (T06 reads `next`). */
export function redirectToLogin(): void {
  const { pathname, search } = window.location;
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`${LOGIN_PATH}?next=${next}`);
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      init.body = body;
      // Browser fetch sets multipart/form-data boundary automatically; do not override Content-Type
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
    );
  }

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'UNAUTHENTICATED', 'หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง');
  }

  const json = await readJson(res);

  if (!res.ok) {
    const err = isRecord(json) && isRecord(json.error) ? json.error : undefined;
    const code = typeof err?.code === 'string' ? err.code : 'HTTP_ERROR';
    const message =
      typeof err?.message === 'string' ? err.message : `เกิดข้อผิดพลาด (${res.status}) ลองอีกครั้ง`;
    throw new ApiError(res.status, code, message);
  }

  if (isRecord(json) && 'data' in json) return json.data as T;
  return undefined as T;
}

api.get = <T>(path: string, query?: ApiOptions['query'], signal?: AbortSignal) => {
  const options: ApiOptions = { method: 'GET' };
  if (query) options.query = query;
  if (signal) options.signal = signal;
  return api<T>(path, options);
};
api.post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
api.put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
api.patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
api.delete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
