export class ApiError extends Error {
    status: number;
    code: string;
    details: unknown;
    constructor(status: number, code: string, message: string, details: unknown) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

type Json = unknown;

async function parseError(res: Response): Promise<ApiError> {
    let body: any = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const message = body?.error?.message ?? res.statusText ?? 'Request failed';
    return new ApiError(res.status, code, message, body?.error?.details);
}

export const apiClient = {
    async request<T>(method: string, path: string, body?: Json): Promise<T> {
        const res = await fetch(path, {
            method,
            credentials: 'include',
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.status === 204) return undefined as T;
        if (!res.ok) throw await parseError(res);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) return undefined as T;
        return (await res.json()) as T;
    },
    get: <T>(p: string) => apiClient.request<T>('GET', p),
    post: <T>(p: string, b?: Json) => apiClient.request<T>('POST', p, b),
    patch: <T>(p: string, b?: Json) => apiClient.request<T>('PATCH', p, b),
    delete: <T>(p: string) => apiClient.request<T>('DELETE', p),
};