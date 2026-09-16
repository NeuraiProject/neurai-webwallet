/** @jest-environment jsdom */
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {ReceiveAddress} from '@/ReceiveAddress';
import {useReceiveAddress} from '@/hooks/useReceiveAddress';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const address='NfrFWhPKcMQ7BbFGWtsAnaC6G5qEUSsD4f';
const wallet={getAddressObjects:()=>[{address,path:"m/44'/1900'/0'/0/0"}]} as any;
const writeText=jest.fn();
const button=(c:HTMLElement,text:string)=>[...c.querySelectorAll('button')].find(b=>b.textContent===text)!;
beforeEach(()=>{
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
});
test('receive card copies the actual address and keeps the QR open across same-address refreshes',async()=>{
  const c=document.createElement('div');const root=createRoot(c);
  try {
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={address} compact/>));
    expect(c.querySelector('svg[role=img]')).not.toBeNull();
    const addressButton = c.querySelector('[aria-label="Copy receive address"]')!;
    expect(addressButton.querySelectorAll('span')).toHaveLength(3);
    expect(addressButton.textContent).toBe(address);
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.click());
    expect(writeText).toHaveBeenCalledWith(address);
    expect(c.textContent).not.toContain("Derivation path");
    expect(button(c,'Copy address')).toBeUndefined();
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.click());
    expect(writeText).toHaveBeenCalledWith(address);expect(c.querySelector('[role=status]')?.textContent).toBe('Copied');
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Show larger QR"]')!.click());
    const dialog=c.querySelector('dialog');
    expect(c.querySelectorAll('svg[role=img] circle').length).toBeGreaterThan(100);
    expect(c.querySelector('img')).toBeNull();
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={address} compact/>));
    expect(c.querySelector('dialog')).toBe(dialog);
    await act(async()=>button(c,'Close').click());expect(c.querySelector('dialog')).toBeNull();
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Show larger QR"]')!.click());
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress="different-address" compact/>));
    expect(c.querySelector('dialog')).toBeNull();expect(button(c,'Copied')).toBeUndefined();
  } finally {await act(async()=>root.unmount());}
});
test('copy denial shows an error, without reporting success',async()=>{
  writeText.mockRejectedValue(new Error('denied'));
  const c=document.createElement('div');const root=createRoot(c);
  try {
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={address}/>));
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.click());
    expect(c.querySelector('[role=alert]')?.textContent).toContain('Could not copy');
    expect(button(c,'Copied')).toBeUndefined();
  } finally {await act(async()=>root.unmount());}
});
test('address loading ignores stale responses from a previous wallet',async()=>{
  let finish!: (value:string)=>void;
  const old={getReceiveAddress:()=>new Promise<string>(r=>{finish=r;})} as any;
  const current={getReceiveAddress:async()=>address} as any;
  function Probe({w}:{w:any}){return <span>{useReceiveAddress(w,1)}</span>;}
  const c=document.createElement('div');const root=createRoot(c);
  try {
    await act(async()=>root.render(<Probe w={old}/>));
    await act(async()=>root.render(<Probe w={current}/>));
    await act(async()=>finish('old-address'));
    expect(c.textContent).toBe(address);
  } finally {await act(async()=>root.unmount());}
});

test('copied feedback disappears after a brief delay',async()=>{
  jest.useFakeTimers();
  const c=document.createElement('div');const root=createRoot(c);
  try {
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={address} compact/>));
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.click());
    expect(c.querySelector('[role=status]')?.textContent).toBe('Copied');
    await act(async()=>jest.advanceTimersByTime(1500));
    expect(c.querySelector('[role=status]')?.textContent).toBe('');
  } finally {await act(async()=>root.unmount());jest.useRealTimers();}
});

test('PQ uses four centered parts and the eye hides both outputs and prevents copying or enlarging',async()=>{
  const c=document.createElement('div');const root=createRoot(c);
  const pq='tnq1pavsksr40nq495pmyt8unn73828a6ek8h9xf9f6ys0qa3fystrzxqc4883n';
  try {
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={pq} compact/>));
    const addressButton=c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!;
    const qrButton=c.querySelector<HTMLButtonElement>('[aria-label="Show larger QR"]')!;
    expect(addressButton.querySelectorAll('span')).toHaveLength(4);
    expect(addressButton.className).toContain('text-center');
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Hide address and QR"]')!.click());
    expect(addressButton.disabled).toBe(true);expect(qrButton.disabled).toBe(true);
    expect(addressButton.style.filter).toContain('blur');expect(qrButton.style.filter).toContain('blur');
    await act(async()=>{addressButton.click();qrButton.click();});
    expect(writeText).not.toHaveBeenCalled();expect(c.querySelector('dialog')).toBeNull();
    await act(async()=>root.render(<ReceiveAddress wallet={wallet} receiveAddress={address} compact/>));
    expect(c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.disabled).toBe(true);
    await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Show address and QR"]')!.click());
    expect(c.querySelector<HTMLButtonElement>('[aria-label="Copy receive address"]')!.disabled).toBe(false);
  } finally {await act(async()=>root.unmount());}
});
