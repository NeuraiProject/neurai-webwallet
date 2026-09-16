/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Wallet } from '@neuraiproject/neurai-jswallet';
import { useMempool } from '@/hooks/useMempool';
import { PendingTransactions } from '@/PendingTransactions';
import { Events, triggerEvent } from '@/Events';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const pending = [{assetName:'XNA', satoshis:'-10000000000000001'}];
function Harness({ wallet, section = 'Send' }: {wallet: Wallet | null; section?: string}) {
  const mempool = useMempool(wallet, 1);
  return <><header>Wallet header</header><PendingTransactions mempool={mempool} baseCurrency="XNA"/><main>{section}</main></>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a transfer after login refreshes the global banner and it survives section changes', async () => {
  const getMempool=jest.fn().mockResolvedValue([]);
  const wallet={getMempool} as unknown as Wallet;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  try {
    await act(async()=>root.render(<Harness wallet={null}/>));
    await act(async()=>root.render(<Harness wallet={wallet}/>));
    expect(container.querySelector('[role=status]')).toBeNull();
    getMempool.mockResolvedValue(pending);
    await act(async()=>triggerEvent(Events.INFO__TRANSFER_IN_PROCESS));
    const banner=container.querySelector('[role=status]')!;
    expect(banner.textContent).toContain('1 pending transaction');
    expect(banner.textContent).toContain('100,000,000.00000001');
    expect(banner.previousElementSibling?.tagName).toBe('HEADER');
    for (const section of ['Home','Receive','Assets','Settings']) {
      await act(async()=>root.render(<Harness wallet={wallet} section={section}/>));
      expect(container.querySelector('[role=status]')).not.toBeNull();
      expect(container.querySelector('main')!.textContent).toBe(section);
    }
    getMempool.mockResolvedValue([]);
    await act(async()=>{ jest.advanceTimersByTime(10000); });
    expect(container.querySelector('[role=status]')).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();}
});

test('retries the index after broadcast and ignores responses from a previous wallet', async () => {
  let completeOld!: (value: unknown) => void;
  const first={getMempool:jest.fn(()=>new Promise(resolve=>{completeOld=resolve;}))} as unknown as Wallet;
  const getMempool=jest.fn().mockResolvedValue([]);
  const second={getMempool} as unknown as Wallet;
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  try {
    await act(async()=>root.render(<Harness wallet={first}/>));
    await act(async()=>root.render(<Harness wallet={second}/>));
    await act(async()=>completeOld(pending));
    expect(container.querySelector('[role=status]')).toBeNull();
    await act(async()=>triggerEvent(Events.INFO__TRANSFER_IN_PROCESS));
    getMempool.mockResolvedValue(pending);
    await act(async()=>{jest.advanceTimersByTime(1000);});
    expect(container.querySelector('[role=status]')).not.toBeNull();
    await act(async()=>root.render(<Harness wallet={null}/>));
    expect(container.querySelector('[role=status]')).toBeNull();
    const calls=getMempool.mock.calls.length;
    await act(async()=>{jest.advanceTimersByTime(10000);});
    expect(getMempool).toHaveBeenCalledTimes(calls);
  } finally {await act(async()=>root.unmount());container.remove();}
});
