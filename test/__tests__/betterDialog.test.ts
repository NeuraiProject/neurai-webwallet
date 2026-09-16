/** @jest-environment jsdom */
import {betterConfirm} from '@/betterDialog';

test('confirmation displays an escaped warning and explicit action, and cancellation stays false',async()=>{
  const result=betterConfirm('About to send','Send 1500 XNA?',{
    warning:{title:'MAINNET - REAL FUNDS',text:'Real funds <img src=x onerror=alert(1)>'},confirmLabel:'Send',
  });
  const dialog=document.querySelector('dialog')!;
  expect(dialog.querySelector('[role=alert]')?.textContent).toContain('MAINNET - REAL FUNDS');
  expect(dialog.querySelector('img')).toBeNull();
  expect(dialog.querySelector('[data-action=ok]')?.textContent).toBe('Send');
  (dialog.querySelector('[data-action=cancel]') as HTMLButtonElement).click();
  await expect(result).resolves.toBe(false);
  expect(document.querySelector('dialog')).toBeNull();
});

test('ordinary confirmations have no mainnet warning and keep the default action',async()=>{
  const result=betterConfirm('About to send','Send test funds?');
  const dialog=document.querySelector('dialog')!;
  expect(dialog.querySelector('[role=alert]')).toBeNull();
  expect(dialog.querySelector('[data-action=ok]')?.textContent).toBe('OK');
  (dialog.querySelector('[data-action=ok]') as HTMLButtonElement).click();
  await expect(result).resolves.toBe(true);
});
