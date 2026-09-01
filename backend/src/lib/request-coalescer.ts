/**
 * Deduplicates in-flight async work by key. Concurrent callers with the same
 * key share one promise instead of hitting the database N times.
 */
export class RequestCoalescer {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async execute<T>(key: string, asyncTask: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = asyncTask().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

export const requestCoalescer = new RequestCoalescer();
