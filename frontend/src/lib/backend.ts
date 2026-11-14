/**
 * Where the backend lives.
 *
 * Empty in development, where Vite proxies /ws and /api to the local server.
 * In a deployed build, VITE_BACKEND_URL is the backend's https origin.
 */
const BASE = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/+$/, '');

/** Full URL of a REST path such as /api/employees. */
export function apiUrl(path: string) {
  return BASE + path;
}

/** Full ws:// or wss:// URL of a WebSocket path such as /ws. */
export function socketUrl(path: string) {
  return (BASE || location.origin).replace(/^http/, 'ws') + path;
}
