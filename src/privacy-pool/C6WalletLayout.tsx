import React from 'react';
import {isTestnetChain} from '../buildTarget';
import {poolWalletNetwork} from './walletNetwork';

/** Explain the same local gates used by the private worker before offering actions. */
export function c6WalletBlockedReason(network:string|undefined,hasWords:boolean,poolNetwork:string|undefined):string|null {
  if(!network)return 'Open a transparent testnet wallet first, then return to Privacy.';
  if(!isTestnetChain(network))return 'Your selected wallet is on mainnet. Switch to a Legacy, PQ or ECDSA testnet wallet to use C6.';
  if(!poolWalletNetwork(network))return 'This wallet type is not supported by C6. Select a Legacy, strict PQ or ECDSA testnet wallet; generic AuthScript addresses are for contracts.';
  if(!hasWords)return 'The selected wallet has no recovery words available in this session. Unlock it with its PIN or reopen it with its words before opening C6.';
  if(poolNetwork!=='testnet')return 'This C6 instance is not configured for testnet. Private operations are disabled.';
  return null;
}

const actions=[
  ['deposit','Deposit','Move funds from your transparent wallet into a private note.'],
  ['transfer','Assign','Send private notes; any change remains private.'],
  ['withdraw','Withdraw','Send funds to a Legacy, PQ or ECDSA address.'],
  ['join','Join notes','Combine exactly two of your notes into one private note.'],
] as const;

/** Presentation only: locked forms remain visible without creating a worker or signing. */
export function C6WalletLayout({title,description,label,open,busy,phase,seconds,error,blockedReason,action,onAction,
  actionsBlocked,onCancel,walletPanel,operationPanel,history,identity,commitment}:{
  title:string;description:string;label:string;open:boolean;busy:boolean;phase:string;seconds:number;error:string;
  blockedReason:string|null;action:string;onAction:(action:string)=>void;actionsBlocked:boolean;onCancel:()=>void;
  walletPanel:React.ReactNode;operationPanel:React.ReactNode;history?:React.ReactNode;identity?:string;commitment?:string;
}) {
  return <section className="privacy-pool neurai-stack min-w-0" aria-label={label}>
    <header><h2 className="text-xl font-bold m-0">{title}</h2><p className="neurai-hint mt-1 mb-0">{description}</p></header>
    <p className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm m-0">C6 TEST keys · Each pool has a separate balance. Do not use valuable funds.</p>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <section className="neurai-card neurai-stack min-w-0" aria-label="C6 private wallet setup">
        <div><p className="neurai-eyebrow mb-1">Step 1</p><h3 className="neurai-card__title">Private wallet</h3></div>
        {blockedReason&&<p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error m-0">{blockedReason}</p>}
        {walletPanel}
      </section>
      <section className="neurai-card neurai-stack min-w-0" aria-label="C6 private operations">
        <div><p className="neurai-eyebrow mb-1">Step 2</p><h3 className="neurai-card__title">Use the pool</h3></div>
        {!open&&<p className="neurai-hint m-0">Open the private wallet in Step 1 to enable these operations. Your transparent balance is separate from your private balance.</p>}
        <div aria-label="Available C6 operations">
          <div role="tablist" aria-label="Pool operation" className="join w-full">
            {actions.map(([value,name])=><button key={value} type="button" role="tab" data-action={value} aria-selected={value===action}
              className={'btn join-item flex-1 min-w-0 px-2 text-xs sm:text-sm '+(value===action?'btn-primary':'btn-ghost border border-base-300')}
              disabled={actionsBlocked} onClick={()=>onAction(value)}>{name}</button>)}
          </div>
        </div>
        <p className="neurai-hint m-0">{actions.find(([value])=>value===action)?.[2]}</p>
        {operationPanel}
      </section>
    </div>
    {history}
    {error&&<p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error m-0">{error.startsWith('C6 private journal missing')?'This browser has no C6 operation history for these words and passphrases. For first-time use, choose Create new private history (Create new private asset history for assets). If you used C6 elsewhere, restore its latest encrypted backup before operating. Your normal wallet words derive keys, but do not restore pending-operation history.':error}</p>}
    <div className={'neurai-card privacy-operation '+(busy?'is-running':error?'is-error':'')} role="status" aria-live="polite" aria-atomic="true">
      {busy?<span className="privacy-operation__indicator" aria-hidden="true"/>:<span className="privacy-operation__dot" aria-hidden="true"/>}
      <strong>{busy?phase:open?phase:'Private wallet locked'}</strong>
      {busy&&<><time className="tabular-nums">{seconds}s</time><button className="neurai-btn--secondary btn-sm" onClick={onCancel}>Cancel local work and lock</button><span className="privacy-operation__track" aria-hidden="true"><span/></span></>}
    </div>
    {(identity||commitment)&&<details className="neurai-card min-w-0"><summary className="neurai-card__title cursor-pointer">Pool instance</summary>
      <div className="neurai-stack mt-3 text-sm">{identity&&<p className="m-0">{identity}</p>}{commitment&&<code className="break-all text-xs">{commitment}</code>}
        <p className="neurai-hint m-0">Public testnet instance. Its private balance is independent of C4, C5 and other C6 pools.</p></div>
    </details>}
  </section>;
}

export function C6LockedWalletHelp(){return <>
  <p className="text-sm text-base-content/70 m-0">The same words, address family and private passphrase recover the same private addresses. A different passphrase opens another wallet; spaces count.</p>
  <p className="neurai-hint m-0">First use here: create an encrypted history below. Returning on another device: restore its backup to preserve pending operations.</p>
</>;}
