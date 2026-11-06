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

/** Sign the pool transaction's funding input with the per-input sighash the
 * pool asks for, applying the same chain/family translation as jswallet. */
export function signPoolInputs(network:string,raw:string,coins:Parameters<typeof Signer.sign>[2],keys:Parameters<typeof Signer.sign>[3],inputHashTypes:Record<number,1|131>) {
  const config=poolWalletNetwork(network);if(!config)throw new Error('Unsupported wallet network for this privacy pool');
  return Signer.sign(config.signer,raw,coins,keys,{debug:false,inputHashTypes});
}
