/** @jest-environment jsdom */
jest.mock('../../src/utils/recoveryPin',()=>({verifyRecoveryPin:jest.fn()}));
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Settings} from '@/Settings';
import {verifyRecoveryPin} from '@/utils/recoveryPin';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const words='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const verify=jest.mocked(verifyRecoveryPin);
const writeText=jest.fn();
function enterPin(container: HTMLElement, value:string) {
  const field=container.querySelector<HTMLInputElement>('#recovery-pin')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
}
function button(container:HTMLElement,label:string) {
  return [...container.querySelectorAll('button')].find(b=>b.textContent===label)!;
}
beforeEach(()=>{
  jest.clearAllMocks();localStorage.clear();sessionStorage.clear();
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  writeText.mockResolvedValue(undefined);
});

test('viewing requires a valid PIN on every attempt and never writes to the clipboard',async()=>{
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Settings network="xna" mnemonic={words}/>));
    await act(async()=>button(container,'View recovery words').click());
    expect(writeText).not.toHaveBeenCalled();
    expect(container.querySelector('ol')).toBeNull();
    expect(container.textContent).not.toContain(words);
    verify.mockRejectedValueOnce(new Error('Incorrect PIN. Try again.'));
    await act(async()=>enterPin(container,'wrong1'));
    await act(async()=>button(container,'Verify PIN & show').click());
    expect(writeText).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')!.textContent).toContain('Incorrect PIN');
    verify.mockResolvedValueOnce(words);
    await act(async()=>enterPin(container,'123456'));
    await act(async()=>button(container,'Verify PIN & show').click());
    expect(verify).toHaveBeenLastCalledWith('123456','xna',words,'');
    expect(container.querySelectorAll('ol li')).toHaveLength(12);
    expect(writeText).not.toHaveBeenCalled();
    await act(async()=>button(container,'Close').click());
    expect(container.querySelector('ol')).toBeNull();
    await act(async()=>button(container,'View recovery words').click());
    expect(container.querySelector<HTMLInputElement>('#recovery-pin')!.value).toBe('');
    expect(writeText).not.toHaveBeenCalled();
  } finally {await act(async()=>root.unmount());container.remove();}
});

test('cancelling while verification is running prevents clipboard access',async()=>{
  let finish!: (value:string)=>void;
  verify.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Settings network="xna" mnemonic={words}/>));
    await act(async()=>button(container,'View recovery words').click());
    await act(async()=>enterPin(container,'123456'));
    await act(async()=>button(container,'Verify PIN & show').click());
    await act(async()=>button(container,'Cancel').click());
    await act(async()=>finish(words));
    expect(writeText).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();}
});

test('passphrase warning appears without revealing the passphrase or word count in settings',async()=>{
  verify.mockResolvedValueOnce(words);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Settings network="xna" mnemonic={words} passphrase="private-extra"/>));
    expect(container.textContent).not.toMatch(/12 words|24 words|private-extra/);
    await act(async()=>button(container,'View recovery words').click());
    await act(async()=>enterPin(container,'123456'));
    await act(async()=>button(container,'Verify PIN & show').click());
    expect(container.querySelector('[role=note]')!.textContent).toContain('These words alone cannot restore');
    expect(container.textContent).not.toContain('private-extra');
    expect(verify).toHaveBeenLastCalledWith('123456','xna',words,'private-extra');
  } finally {await act(async()=>root.unmount());container.remove();}
});

test('login settings expose no recovery action and show the explicit selected network',async()=>{
  localStorage.setItem('wallet_network','xna');
  const container=document.createElement('div');const root=createRoot(container);
  try {
    await act(async()=>root.render(<Settings network="xna-pq-test"/>));
    expect(container.textContent).toContain('Testnet PQ');
    expect(button(container,'View recovery words')).toBeUndefined();
  } finally {await act(async()=>root.unmount());}
});

test('network details come from the active wallet RPC and recovery follows RPC',async()=>{
  const wallet={rpc:jest.fn().mockResolvedValue({chain:'regtest',blocks:123,headers:124,difficulty:0.5,bestblockhash:'abc123',verificationprogress:0.9,initialblockdownload:true})};
  const container=document.createElement('div');const root=createRoot(container);
  try {
    await act(async()=>root.render(<Settings wallet={wallet as any} network="xna-pq-test" mnemonic={words}/>));
    expect(wallet.rpc).toHaveBeenCalledWith('getblockchaininfo',[]);
    expect(container.textContent).toContain('regtest');
    expect(container.textContent).toContain('abc123');
    expect(container.textContent).toContain('90.00%');
    const sections=[...container.querySelectorAll('section')].map(s=>s.getAttribute('aria-labelledby'));
    expect(sections).toEqual(['settings-network-title','settings-rpc-title','settings-wallet-title']);
  } finally {await act(async()=>root.unmount());}
});
