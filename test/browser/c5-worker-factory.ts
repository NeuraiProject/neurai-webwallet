export function createC5ReviewWorker(corrupt=false,slow=false):Worker {
  const url=new URL('./C5.worker.ts',import.meta.url);
  if(slow)url.searchParams.set('slow','1');
  if(corrupt)url.searchParams.set('corrupt','1');
  return new Worker(url,{type:'module'});
}
