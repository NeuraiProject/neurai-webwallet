import NeuraiKey from '@neuraiproject/neurai-key';

export type DepinChatNetwork = 'xna' | 'xna-test' | 'xna-legacy' | 'xna-legacy-test';

export type DepinChatIdentity = {
  address: string;
  wif: string;
  publicKey: string; // compressed hex (33 bytes => 66 hex chars)
  path: string;
  coinType: number;
  account: number;
  index: number;
};

type NeuraiKeyApi = {
  getHDKey: (network: DepinChatNetwork, mnemonic: string, passphrase: string) => unknown;
  getCoinType: (network: DepinChatNetwork) => number;
  getAddressByPath: (
    network: DepinChatNetwork,
    hdKey: unknown,
    path: string
  ) => { WIF?: string; address?: string; publicKey?: string } | null;
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

  const keyApi = NeuraiKey as unknown as NeuraiKeyApi;
  const hdKey = keyApi.getHDKey(params.network, mnemonic, passphrase);
  const coinType = keyApi.getCoinType(params.network);

  const path = `m/44'/${coinType}'/${account}'/0/${index}`;
  const addrObj = keyApi.getAddressByPath(params.network, hdKey, path);

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
