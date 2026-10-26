const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let tokenProvider = () => null;

// The shared authentication context can provide its current token through this adapter.
export function setApiTokenProvider(provider) {
  tokenProvider = typeof provider === 'function' ? provider : () => null;
}

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class ContractUnavailableError extends Error {
  constructor(feature) {
    super(`The backend contract for ${feature} is not defined.`);
    this.name = 'ContractUnavailableError';
  }
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  if (!API_BASE_URL) throw new ApiError('Configure the API base URL before connecting this page to the backend.');
  const token = await tokenProvider();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the TenderBridge API. Check the connection and try again.');
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) throw new ApiError(payload?.message || `Request failed (${response.status}).`, response.status, payload);
  return payload;
}

export async function requestBlob(path) {
  if (!API_BASE_URL) throw new ApiError('Configure the API base URL before connecting this page to the backend.');
  const token = await tokenProvider();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Could not reach the TenderBridge API. Check the connection and try again.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, response.status, payload);
  }
  return response.blob();
}

export function explainError(error) {
  return error?.message || 'Something went wrong. Please try again.';
}
