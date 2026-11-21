// 동시 실행 수 제한 + 재시도 큐 (PRD 6-3: 동시 3~5건, 실패 시 2회 재시도)

export interface QueueOptions<T> {
  concurrency: number;
  retries: number;
  retryDelayMs?: number;
  onProgress?: (p: { done: number; failed: number; total: number; item: T; ok: boolean; error?: unknown }) => void;
  shouldStop?: () => boolean;
}

export interface QueueResult<T> {
  succeeded: T[];
  failed: { item: T; error: unknown }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runQueue<T>(
  items: T[],
  worker: (item: T, attempt: number) => Promise<void>,
  opts: QueueOptions<T>,
): Promise<QueueResult<T>> {
  const succeeded: T[] = [];
  const failed: { item: T; error: unknown }[] = [];
  let next = 0;
  const delay = opts.retryDelayMs ?? 2000;

  async function lane() {
    while (next < items.length) {
      if (opts.shouldStop?.()) return;
      const item = items[next++];
      let lastError: unknown;
      let ok = false;
      for (let attempt = 0; attempt <= opts.retries; attempt++) {
        try {
          await worker(item, attempt);
          ok = true;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < opts.retries) await sleep(delay * (attempt + 1));
        }
      }
      if (ok) succeeded.push(item);
      else failed.push({ item, error: lastError });
      opts.onProgress?.({
        done: succeeded.length + failed.length,
        failed: failed.length,
        total: items.length,
        item,
        ok,
        error: ok ? undefined : lastError,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, lane));
  return { succeeded, failed };
}
