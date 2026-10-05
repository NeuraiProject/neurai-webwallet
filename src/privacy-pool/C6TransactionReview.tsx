import React from 'react';
/** Review the captured transaction, not the live form values. Publishing remains
 * an explicit action; durable private reservations are kept when closing it.
 */
export function C6TransactionReview({title,form,txid,amount,unit='XNA',fee,busy,onPublish,onClose,publishLabel,closeLabel='Discard funding preview'}:{title:string;form?:string;txid:string;amount?:string;unit?:string;fee:string;busy:boolean;onPublish:()=>void;onClose:()=>void;publishLabel:string;closeLabel?:string}) {
  return <section className="neurai-card neurai-stack min-w-0 border border-primary/40 bg-primary/5" aria-label={title}>
    <div className="flex items-center justify-between gap-2"><h3 className="neurai-card__title m-0">{title}</h3>{form&&<span className="badge badge-outline font-mono">{form}</span>}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-base-200/50 p-3">
      {amount!==undefined&&<div><p className="neurai-eyebrow m-0">Amount</p><strong className="text-lg tabular-nums">{amount} {unit}</strong></div>}
      <div><p className="neurai-eyebrow m-0">Network fee</p><strong className="text-lg tabular-nums">{fee} XNA</strong></div>
    </div>
    <p className="neurai-hint m-0">The node accepted this transaction for review. It has not been broadcast.</p>
    <div className="min-w-0"><p className="neurai-eyebrow mb-1">Transaction ID</p><code className="block rounded-lg bg-base-200 p-3 font-mono text-xs break-all">{txid}</code></div>
    <div className="flex flex-wrap gap-2"><button className="neurai-btn--primary" disabled={busy} onClick={onPublish}>{publishLabel}</button><button className="neurai-btn--secondary" disabled={busy} onClick={onClose}>{closeLabel}</button></div>
  </section>;
}
