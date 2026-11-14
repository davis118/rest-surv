import type { Box } from '../types';
import { apiUrl } from './backend';

const URL_BASE = apiUrl('/api/employees');
const UNAVAILABLE = 'The employee service is not available yet.';

/** A registered employee, as the backend stores it. */
export interface Employee {
  id: string;
  name: string;
  role: string | null;
  notes: string | null;
  created_at: string;
}

export interface NewEmployee {
  /** A JPEG snapshot of the camera. */
  image: Blob;
  /** The chosen face in that snapshot, as shares of its width and height. */
  box: Box;
  name: string;
  role: string;
  notes: string;
}

/** A failed call, with a message fit to show the user. `status` is null when nothing answered. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The server's own explanation, when it gave one. */
async function detailOf(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    // FastAPI reports rejected fields as a list of { msg }.
    if (Array.isArray(body.detail)) {
      const messages = body.detail.flatMap((d: unknown) => {
        const msg = (d as { msg?: unknown } | null)?.msg;
        return typeof msg === 'string' ? [msg] : [];
      });
      if (messages.length) return messages.join('; ');
    }
  } catch {
    // Not JSON: fall through to a generic message.
  }
  return null;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(URL_BASE + path, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError('Could not reach the server.', null);
  }
  if (response.ok) return response;
  const detail = await detailOf(response);
  // No such route, or the dev proxy found no backend behind it.
  const missing = response.status === 404 || response.status === 405 || (response.status >= 500 && !detail);
  if (missing) throw new ApiError(UNAVAILABLE, response.status);
  throw new ApiError(detail ?? `The server refused the request (${response.status}).`, response.status);
}

async function json<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(UNAVAILABLE, response.status);
  }
}

export async function listEmployees(signal?: AbortSignal): Promise<Employee[]> {
  const body = await json<{ employees?: Employee[] }>(await call('', { signal }));
  if (!Array.isArray(body.employees)) throw new ApiError(UNAVAILABLE, 200);
  return body.employees;
}

/** Registers the face at `box` in the snapshot under the given name. */
export async function registerEmployee({ image, box, name, role, notes }: NewEmployee): Promise<Employee> {
  const form = new FormData();
  form.append('image', image, 'snapshot.jpg');
  form.append('box', box.map((v) => v.toFixed(4)).join(','));
  form.append('name', name);
  if (role) form.append('role', role);
  if (notes) form.append('notes', notes);
  return json<Employee>(await call('', { method: 'POST', body: form }));
}

export async function removeEmployee(id: string): Promise<void> {
  await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
