// Generate public synthetic C4 witnesses for the browser benchmark.
// Never use wallet backups, live notes, RPC, or these public secrets for funds.
import { readFile, writeFile } from 'node:fs/promises';
import { BrowserTestIdentity } from '@neuraiproject/neurai-privacy/browser';

if (process.argv[2] !== '--write') throw new Error('Pass --write to replace the reviewed synthetic fixtures');
const config = JSON.parse(await readFile(new URL('../src/privacy-pool/c4-testnet.json', import.meta.url), 'utf8'));
const manifest = config.manifest;
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = bytes => Buffer.from(bytes).toString('hex');
const identity = new BrowserTestIdentity(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2), bytes(manifest.domain), bytes(manifest.assetId), null);
const scriptHex = '5320' + '33'.repeat(32);
const sponsor = { txid: '22'.repeat(32), vout: 0, scriptHex, valueSats: '100000000' };
const funding = { txid: '33'.repeat(32), vout: 0, scriptHex, valueSats: '100000000000' };
const empty = { state: { mode: 0, slots: new Map(), seen: new Map([[0, [0n, 0n, 0]]]), nfs: new Map([[0, [0n, 0n, 0]]]), stateOutpoint: [manifest.birth, 0], reserveOutpoint: null }, reserveAtomic: 0n, notes: [] };
const note = amount => identity.createNote(identity.recipient(), String(amount));
const prepare = (scan, form, options = {}) => identity.prepareC4({ manifest, scan, form, sponsor, feeAtomic: '10000000', expectedGenesis: config.genesis, expectedCommitment: config.pin, ...options });
function after(prepared, reserve, tag) {
  const txid = tag.repeat(32);
  return { state: { ...prepared.state, stateOutpoint: [txid, 0], reserveOutpoint: [txid, 1] }, reserveAtomic: reserve, notes: [] };
}
try {
  const first = note(100000000000n);
  const d0 = prepare(empty, 'D0', { created: [first], funding });
  const funded = after(d0, 100000000000n, '44');
  const second = note(50000000000n);
  const d1 = prepare(funded, 'D1', { created: [second], funding: { ...funding, valueSats: '50000000000' } });
  const consumed = { note: hex(first.note), spent: false };
  const forms = { D0: d0, D1: d1 };
  for (let k = 1; k <= 4; k++) {
    const total = 100000000000n, each = total / BigInt(k);
    const created = Array.from({ length: k }, (_, i) => note(i === k - 1 ? total - each * BigInt(k - 1) : each));
    forms['T' + k] = prepare(funded, 'T' + k, { consumed, created });
  }
  forms.W_partial = prepare(after(d1, 150000000000n, '55'), 'W_partial', { consumed, payout: scriptHex });
  forms.W_full = prepare(funded, 'W_full', { consumed, payout: scriptHex });
  const output = {
    warning: 'PUBLIC SYNTHETIC TEST INPUTS. Not wallet data, not confirmed transactions, never broadcast.',
    commitment: config.pin, artifactsId: config.artifacts.id,
    forms: Object.fromEntries(Object.entries(forms).map(([form, p]) => [form, { input: p.input, publicSignals: p.publicSignals }]))
  };
  await writeFile(new URL('../src/privacy-benchmark/c4-fixtures.json', import.meta.url), JSON.stringify(output) + '\n');
  console.log('Generated eight C4 benchmark witnesses. Verify all eight against the pinned WASM, zkey and VK before adopting changes.');
} finally { identity.lock(); }
