/** @jest-environment jsdom */
jest.mock('@yudiel/react-qr-scanner',()=>({Scanner:()=>null}));
jest.mock('../../src/betterDialog',()=>({betterAlert:jest.fn(),betterConfirm:jest.fn(),betterToast:jest.fn()}));
import React, { act } from 'react';
import {createRoot} from 'react-dom/client';
import {Send, SendPanel} from '@/Send';
import type {Wallet} from '@neuraiproject/neurai-jswallet';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const utxo = (id:string, satoshis:string) => ({txid:id.repeat(64),outputIndex:0,address:'mine',assetName:'XNA',satoshis,value:0,script:'00',height:10});

test('opening, selecting, Max and clearing Coin Control updates the form exactly', async () => {
  const wallet = {baseCurrency:'XNA', getAddresses:()=>['mine'],getUTXOs:async()=>[utxo('a','10000000000000001'),utxo('b','1')],getAssetUTXOs:async()=>[],getMempool:async()=>[],getUTXOsInMempool:async()=>[]} as unknown as Wallet;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  try {
    await act(async()=>root.render(<Send wallet={wallet} assets={[]} balance="100000000.00000002" mempool={[]}/>));
    const toggle=[...container.querySelectorAll('button')].find(b=>b.textContent==='Coin Control')!;
    await act(async()=>toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel=container.querySelector('#coin-control-panel')!;
    expect(panel.parentElement?.className).toContain('lg:grid-cols-2');
    const checks=panel.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(checks).toHaveLength(2);
    await act(async()=>{ checks[0].click(); checks[1].click(); });
    expect(container.textContent).toContain('100,000,000.00000002');
    await act(async()=>([...container.querySelectorAll('a')].find(a=>a.textContent==='Max')!).click());
    expect(container.querySelector<HTMLInputElement>('#send-amount')!.value).toBe('100000000.00000002');
    await act(async()=>checks[1].click());
    expect(container.querySelector<HTMLInputElement>('#send-amount')!.value).toBe('100000000.00000001');
    await act(async()=>{([...panel.querySelectorAll('button')].find(b=>b.textContent==='Clear selection')!).click();});
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    await act(async()=>toggle.click());
    expect(container.querySelector('#coin-control-panel')).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();}
});

test('Coin Control stays visibly active and retains the draft when navigating away and back', async () => {
  const getUTXOs = jest.fn(async()=>[utxo('a','10000000000000001')]);
  const wallet = {baseCurrency:'XNA', getAddresses:()=>['mine'],getUTXOs,getAssetUTXOs:async()=>[],getMempool:async()=>[],getUTXOsInMempool:async()=>[]} as unknown as Wallet;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const render = (active:boolean) => root.render(<SendPanel active={active} wallet={wallet} assets={[]} balance="100000000.00000001" mempool={[]}/>);
  try {
    await act(async()=>render(true));
    const toggle=container.querySelector<HTMLButtonElement>('button[aria-controls="coin-control-panel"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async()=>toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('border-primary');
    expect(toggle.className).not.toContain('neurai-btn--primary');
    await act(async()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await act(async()=>[...container.querySelectorAll('a')].find(a=>a.textContent==='Max')!.click());
    await act(async()=>render(false));
    expect(container.firstElementChild?.hasAttribute('hidden')).toBe(true);
    await act(async()=>render(true));
    expect(container.firstElementChild?.hasAttribute('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('#send-amount')!.value).toBe('100000000.00000001');
    expect(getUTXOs).toHaveBeenCalledTimes(1);
    await act(async()=>toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.className).toContain('neurai-btn--secondary');
  } finally {await act(async()=>root.unmount());container.remove();}
});
