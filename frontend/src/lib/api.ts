export const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message: string } };
    return body.error?.message ?? `Сервер ответил ${response.status}`;
  } catch {
    return `Сервер ответил ${response.status}`;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<T>;
}
