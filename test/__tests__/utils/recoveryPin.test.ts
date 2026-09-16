import { webcrypto } from 'node:crypto';
import { setMnemonicWithPin } from '@/utils';
import { verifyRecoveryPin } from '@/utils/recoveryPin';
const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key,value) => {values.set(key,value);}, removeItem: key => {values.delete(key);}, clear:()=>values.clear(), key:i=>[...values.keys()][i]??null, get length(){return values.size;} };
}
beforeEach(()=>{
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:storage(),configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:storage(),configurable:true});
});

test('requires the actual PIN to decrypt the active wallet backup', async()=>{
  await setMnemonicWithPin(words,'123456',{network:'xna'});
  await expect(verifyRecoveryPin('654321','xna',words,'')).rejects.toThrow('Incorrect PIN');
  await expect(verifyRecoveryPin('123456','xna',words,'')).resolves.toBe(words);
});

test('rejects missing or legacy unencrypted storage instead of accepting any PIN', async()=>{
  await expect(verifyRecoveryPin('123456','xna',words,'')).rejects.toThrow('unavailable');
  localStorage.setItem('mnemonic:xna',words);
  await expect(verifyRecoveryPin('123456','xna',words,'')).rejects.toThrow('unavailable');
});

test('verifies session-only wallets and never copies an extra passphrase as recovery words', async()=>{
  await setMnemonicWithPin(words+'|||extra-secret','123456',{network:'xna-pq-test',persist:false});
  await expect(verifyRecoveryPin('123456','xna-pq-test',words,'extra-secret')).resolves.toBe(words);
  await expect(verifyRecoveryPin('123456','xna-pq-test',words,'different')).rejects.toThrow('does not match');
  await expect(verifyRecoveryPin('123456','xna',words,'extra-secret')).rejects.toThrow('unavailable');
});

test('rejects a protected backup belonging to another mnemonic', async()=>{
  await setMnemonicWithPin(words,'123456',{network:'xna'});
  await expect(verifyRecoveryPin('123456','xna','another wallet','')).rejects.toThrow('does not match');
});
