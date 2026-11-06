export function createC7PoolWorker(): Worker {
  return new Worker(new URL('./PoolC7.worker.ts', import.meta.url), { type: 'module' });
}
