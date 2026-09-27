import { key as NeuraiKey } from '@neuraiproject/neurai-jswallet';
import { legacyKeyNetworkFor } from './keyNetwork';

export type DepinChatNetwork =
  | 'xna'
  | 'xna-test'
  | 'xna-legacy'
  | 'xna-legacy-test'
  | 'xna-ecdsa'
  | 'xna-ecdsa-test';

/**
 * DePIN chat identity is a Legacy P2PKH address derived via BIP44
 * (`m/44'/coinType'/...`), whatever address type the wallet itself uses: DePIN
 * only serves P2PKH holders. PQ networks (AuthScript and strict) use NIP-022
 * PQ-HD derivation and have no BIP44 path, so chat identity is not available
 * there.
 */
export function isDepinChatSupportedNetwork(network: string): network is DepinChatNetwork {
  return legacyKeyNetworkFor(network) !== null;
}

export type DepinChatIdentity = {
  address: string;
  wif: string;
  publicKey: string; // compressed hex (33 bytes => 66 hex chars)
  path: string;
  coinType: number;
  account: number;
  index: number;
};

function compressPubKeyHex(pubKeyHex: string): string {
  const hex = (pubKeyHex ?? '').trim().toLowerCase().replace(/^0x/, '');
  if (hex.length === 66 && (hex.startsWith('02') || hex.startsWith('03'))) {
    return hex;
  }

  // Uncompressed: 65 bytes => 130 hex chars, starts with 04
  if (hex.length === 130 && hex.startsWith('04')) {
    const xHex = hex.slice(2, 66);
    const yHex = hex.slice(66, 130);
    const yLastByte = parseInt(yHex.slice(-2), 16);
    const prefix = yLastByte % 2 === 0 ? '02' : '03';
    return `${prefix}${xHex}`;
  }

  // If it’s some other format, return as-is and let caller validate.
  return hex;
}

export function deriveDepinChatIdentity(params: {
  network: DepinChatNetwork;
  mnemonic: string;
  passphrase?: string;
  account?: number;
  index?: number;
}): DepinChatIdentity {
  const account = params.account ?? 100;
  const index = params.index ?? 0;

  const mnemonic = (params.mnemonic ?? '').trim();
  if (!mnemonic) {
    throw new Error('Missing mnemonic');
  }

  const passphrase = params.passphrase ?? '';

  // Never the wallet network itself: neurai-key 5 reads `xna` / `xna-test` as
  // ECDSA witness v3 and `xna-legacy` as coin type 1900.
  const keyNetwork = legacyKeyNetworkFor(params.network);
  if (!keyNetwork) {
    throw new Error(`No DePIN chat identity on network '${String(params.network)}'`);
  }
  const hdKey = NeuraiKey.getHDKey(keyNetwork, mnemonic, passphrase);
  const coinType = NeuraiKey.getCoinType(keyNetwork);

  const path = `m/44'/${coinType}'/${account}'/0/${index}`;
  const addrObj = NeuraiKey.getAddressByPath(keyNetwork, hdKey, path);

  const wif = String(addrObj?.WIF ?? '').trim();
  const address = String(addrObj?.address ?? '').trim();
  const publicKey = compressPubKeyHex(String(addrObj?.publicKey ?? ''));

  if (!address) throw new Error('Failed to derive chat address');
  if (!wif) throw new Error('Failed to derive chat private key (WIF)');
  if (publicKey.length !== 66) throw new Error('Failed to derive compressed public key for chat identity');

  return {
    address,
    wif,
    publicKey,
    path,
    coinType,
    account,
    index,
  };
}
