export function createC4ReviewWorker(corrupt=false):Worker {
  const url=new URL('./C4.worker.ts',import.meta.url);
  if(corrupt)url.searchParams.set('corrupt','1');
  return new Worker(url,{type:'module'});
}
