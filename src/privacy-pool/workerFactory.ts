export function createPoolWorker(): Worker {
  return new Worker(new URL('./Pool.worker.ts', import.meta.url), { type: 'module' });
}
