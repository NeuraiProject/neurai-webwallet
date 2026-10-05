import React from 'react';
/** Lightweight chain notification. Never invokes the private worker or locks forms. */
export function useC6ChainNotice(open:boolean, rpc:(method:string,params?:unknown[])=>Promise<any>, scannedHeight?:number){
  const [height,setHeight]=React.useState<number|null>(null);
  React.useEffect(()=>{
    setHeight(null);if(!open)return;
    let cancelled=false,pending=false;
    async function poll(){
      if(cancelled||pending||document.visibilityState!=='visible')return;pending=true;
      try{const next=await rpc('getblockcount',[]);if(!cancelled&&Number.isSafeInteger(next))setHeight(next);}catch{/* Manual scans surface RPC errors; a notification cannot invalidate a balance. */}
      finally{pending=false;}
    }
    void poll();const timer=setInterval(()=>void poll(),30000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[open,rpc]);
  return height!==null&&scannedHeight!==undefined&&height>scannedHeight?height:null;
}
