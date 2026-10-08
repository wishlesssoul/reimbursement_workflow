import type { AdminUser, User, RequestRecord, ReviewAdvisoryResponse } from './types';

const API_BASE = '/api';
let refreshInFlight: Promise<boolean> | null = null;
let lastRefreshResult: { refreshToken: string; result: boolean } | null = null;

async function refreshStoredSession() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  if (lastRefreshResult?.refreshToken === refreshToken) return lastRefreshResult.result;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const data = await response.json() as { token: string; refreshToken: string; user: User };
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    return true;
  })();

  try {
    const result = await refreshInFlight;
    lastRefreshResult = { refreshToken, result };
    return result;
  } finally {
    refreshInFlight = null;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const sendRequest = () => {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    const token = localStorage.getItem('token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };

  let res = await sendRequest();
  if (res.status === 401 && !['/auth/login', '/auth/refresh', '/auth/logout'].includes(path)) {
    if (await refreshStoredSession()) res = await sendRequest();
  }

  const responseBody = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(responseBody.message || 'Request failed');
  }

  return responseBody as T;
}

export async function loginUser(email: string, password: string) {
  const data = await apiFetch<{ token: string; refreshToken: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  localStorage.setItem('token', data.token);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function logoutUser() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return;
  await apiFetch<{ message: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function fetchAdminUsers() {
  const data = await apiFetch<{ users: AdminUser[] }>('/admin/users');
  return data.users;
}

export async function fetchCurrentUser() {
  return apiFetch<{ user: User }>('/auth/me');
}

export async function fetchMyRequests() {
  const data = await apiFetch<{ requests: RequestRecord[] }>('/requests/my');
  return data.requests;
}

export async function submitRequest(payload: {
  customerReference: string;
  expenseDate: string;
  amountInr: number;
  description: string;
}) {
  return apiFetch<{ message: string; request: RequestRecord }>('/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitCustomerResponse(requestId: string, response: string, version: number) {
  return apiFetch<{ message: string; status: string }>(`/requests/${requestId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ response, version }),
  });
}

export async function fetchReviewerQueue(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiFetch<{ requests: RequestRecord[] }>(`/reviewer/requests${query}`);
  return data.requests;
}

export async function fetchRequestByReference(reference: string) {
  const data = await apiFetch<{ request: RequestRecord }>(`/requests/${encodeURIComponent(reference)}`);
  return data.request;
}

export async function fetchReviewerRequest(requestId: string) {
  const data = await apiFetch<{ request: RequestRecord }>(`/reviewer/requests/${requestId}`);
  return data.request;
}

export async function startReviewRequest(requestId: string, version: number) {
  return apiFetch<{ message: string; status: string }>(`/reviewer/requests/${requestId}/start`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export async function submitReviewDecision(requestId: string, decision: string, explanation: string, version: number) {
  return apiFetch<{ message: string; status: string }>(`/reviewer/requests/${requestId}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, explanation, version }),
  });
}

export async function fetchReviewAdvisory(requestId: string) {
  return apiFetch<ReviewAdvisoryResponse>(`/reviewer/requests/${encodeURIComponent(requestId)}/advisory`, {
    method: 'POST',
  });
}

export async function seedDemoData() {
  return apiFetch<{ message: string }>('/admin/seed-demo-data', {
    method: 'POST',
  });
}
