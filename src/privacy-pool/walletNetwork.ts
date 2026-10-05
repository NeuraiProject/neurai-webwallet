import Signer from '@neuraiproject/neurai-sign-transaction';

// These are jswallet identifiers from the UI, not neurai-key 5 identifiers.
// In particular, xna-pq-test in jswallet means generic AuthScript v1.
const TEST_WALLETS = {
  'xna-test': {family:'legacy', signer:'xna-legacy-test'},
  'xna-legacy-test': {family:'legacy', signer:'xna-legacy-test'},
  'xna-ecdsa-test': {family:'ecdsa', signer:'xna-test'},
  'xna-pq-strict-test': {family:'pq', signer:'xna-pq-test'},
} as const;

export function poolWalletNetwork(network:string) {
  const config=Object.prototype.hasOwnProperty.call(TEST_WALLETS,network)
    ? TEST_WALLETS[network as keyof typeof TEST_WALLETS] : null;
  return config;
}

/** Apply the same chain/family translation as jswallet's transaction engine. */
export function signPoolTransaction(network:string,
  raw:string, coins:Parameters<typeof Signer.sign>[2], keys:Parameters<typeof Signer.sign>[3]) {
  const config=poolWalletNetwork(network);
  if(!config)throw new Error('Unsupported wallet network for this privacy pool');
  return Signer.sign(config.signer,raw,coins,keys);
}

/** C6 opt-in per-input sighash; existing C4/C5 callers keep ALL defaults. */
export function signPoolInputs(network:string,raw:string,coins:Parameters<typeof Signer.sign>[2],keys:Parameters<typeof Signer.sign>[3],inputHashTypes:Record<number,1|131>) {
  const config=poolWalletNetwork(network);if(!config)throw new Error('Unsupported C6 wallet network');
  return Signer.sign(config.signer,raw,coins,keys,{debug:false,inputHashTypes});
}
