import type { Wallet } from '@neuraiproject/neurai-jswallet';

type ChainType = Wallet['network'];

/** neurai-key 5 labels of its Legacy P2PKH networks. */
export type LegacyKeyNetwork = 'xna-legacy' | 'xna-legacy-test' | 'xna-old-legacy';

/**
 * neurai-key 5 network that derives Legacy P2PKH addresses from a wallet
 * network's secp256k1 tree.
 *
 * jswallet keeps the network names it had with neurai-key 4, but its `key`
 * namespace is neurai-key 5, which reuses those names for other address types:
 * there `xna` / `xna-test` are ECDSA witness v3 (`nq1r…` / `tnq1r…`) and
 * `xna-legacy` is coin type 1900 instead of 0. Handing a wallet network straight
 * to `key.*` derives a different address without any error.
 *
 * Null for the PQ networks, which have no secp256k1 tree.
 */
const LEGACY_KEY_NETWORK: Record<ChainType, LegacyKeyNetwork | null> = {
  xna: 'xna-legacy',
  'xna-test': 'xna-legacy-test',
  'xna-legacy': 'xna-old-legacy',
  'xna-legacy-test': 'xna-legacy-test',
  'xna-ecdsa': 'xna-legacy',
  'xna-ecdsa-test': 'xna-legacy-test',
  'xna-pq': null,
  'xna-pq-test': null,
  'xna-pq-strict': null,
  'xna-pq-strict-test': null,
};

export function legacyKeyNetworkFor(network: string): LegacyKeyNetwork | null {
  return LEGACY_KEY_NETWORK[network as ChainType] ?? null;
}
