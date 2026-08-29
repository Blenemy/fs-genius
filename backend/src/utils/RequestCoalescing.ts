class RequestCoalescer {
  private inFlight: Map<string, Promise<unknown>>;

  constructor() {
    this.inFlight = new Map<string, Promise<unknown>>();
  }

  async execute<T>(key: string, asyncTask: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    const promise = asyncTask().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

export const RequestCoalescerInstance = new RequestCoalescer();
