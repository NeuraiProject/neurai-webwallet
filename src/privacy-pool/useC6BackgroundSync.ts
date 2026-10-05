import React from 'react';
type Tip={height:number;hash:string};
type Options={active:boolean;paused:boolean;tip?:Tip;rpc:(method:string,params?:unknown[])=>Promise<any>;canStart:()=>boolean;scan:()=>Promise<any>;apply:(messages:any)=>void};
/** Check the tip cheaply and refresh only a changed confirmed snapshot. The
 * caller shares the pending promise with foreground actions: a single worker
 * must never receive overlapping scan/prove/journal requests. No broadcasts.
 */
export function useC6BackgroundSync(options:Options){
  const latest=React.useRef(options);latest.current=options;
  const pending=React.useRef<Promise<void>|null>(null),generation=React.useRef(0),failures=React.useRef(0),retryAt=React.useRef(0);
  const [syncing,setSyncing]=React.useState(false),[warning,setWarning]=React.useState('');
  const reset=React.useCallback(()=>{generation.current++;pending.current=null;failures.current=0;retryAt.current=0;setSyncing(false);setWarning('');},[]);
  const isRunning=React.useCallback(()=>pending.current!==null,[]);
  const wait=React.useCallback(()=>pending.current??Promise.resolve(),[]);
  const poll=React.useCallback(()=>{
    const o=latest.current;
    if(pending.current||!o.active||o.paused||!o.canStart()||document.visibilityState!=='visible'||Date.now()<retryAt.current)return;
    const token=generation.current;
    const valid=()=>token===generation.current&&latest.current.active;
    const job=Promise.resolve().then(async()=>{
      const hash=await o.rpc('getbestblockhash',[]);
      if(!valid())return;
      if(typeof hash!=='string'||!/^[0-9a-f]{64}$/.test(hash))throw Error('RPC returned an invalid chain tip');
      // A foreground action may have acquired the worker while the tip RPC
      // was pending. Let it proceed without launching a new background scan.
      if(latest.current.paused||!latest.current.canStart())return;
      if(hash!==latest.current.tip?.hash){
        setSyncing(true);const result=await latest.current.scan();
        if(!valid())return;latest.current.apply(result);
      }
      if(valid()){failures.current=0;retryAt.current=0;setWarning('');}
    }).catch(e=>{
      if(!valid())return;
      failures.current++;retryAt.current=Date.now()+Math.min(120000,20000*2**Math.min(failures.current,3));
      setWarning('Automatic refresh failed; keeping the last checked balance. Retrying shortly. '+(e instanceof Error?e.message:String(e)));
    }).finally(()=>{if(pending.current===job){pending.current=null;if(valid())setSyncing(false);}});
    pending.current=job;
  },[]);
  React.useEffect(()=>{
    reset();if(!options.active)return;
    const timer=setInterval(poll,20000);
    const visible=()=>{if(document.visibilityState==='visible')poll();};
    document.addEventListener('visibilitychange',visible);
    return()=>{generation.current++;pending.current=null;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[options.active,options.rpc,poll,reset]);
  return {syncing,warning,wait,isRunning,reset};
}
