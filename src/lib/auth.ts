export const SYNAP_API_KEY_STORAGE_KEY = 'synap_api_key';

export function getStoredApiKey(): string {
  return '';
}

export function setStoredApiKey(_key: string): void {}

export function clearStoredApiKey(): void {}

export function getAuthHeaders(headers: HeadersInit = {}): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      result[key] = value;
    });
  } else if (headers && typeof headers === 'object') {
    Object.assign(result, headers);
  }
  return result;
}

export function notifyUnauthorized(): void {}
