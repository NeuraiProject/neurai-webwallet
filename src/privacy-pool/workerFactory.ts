export function createPoolWorker(): Worker {
  return new Worker(new URL('./Pool.worker.ts', import.meta.url), { type: 'module' });
}

export function createC5PoolWorker(): Worker {
  return new Worker(new URL('./PoolC5.worker.ts', import.meta.url), { type: 'module' });
}

export function createC6PoolWorker(): Worker {
  return new Worker(new URL('./PoolC6.worker.ts', import.meta.url), { type: 'module' });
}

export function createC6AssetPoolWorker(): Worker {
 return new Worker(new URL('./PoolC6Asset.worker.ts', import.meta.url), {type:'module'});
}
