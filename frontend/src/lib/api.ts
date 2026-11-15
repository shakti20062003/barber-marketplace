const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface ApiFetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const details = body?.error?.details;
    // The backend's generic "Validation failed" message hides the actual
    // per-field reason in `details` (from ZodValidationPipe) — surface that
    // instead whenever it's present, so e.g. a phone-format error shows the
    // real reason rather than a meaningless "Validation failed" toast.
    const detailMessage = Array.isArray(details) ? details[0]?.message : undefined;
    throw new ApiError(res.status, detailMessage ?? body?.error?.message ?? 'Request failed', details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
