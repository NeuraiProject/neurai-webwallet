import { Wallet } from "@neuraiproject/neurai-jswallet";
import { IAsset } from "./Types";

// @ts-ignore - Parcel handles CommonJS require for CryptoJS
const CryptoJS = require("crypto-js");

const S = "U2FsdGVkX1/UYDOP/PD64YU3tbCAeJBR";
const SEPARATOR = "|||";
const STORAGE_KEY = "mnemonic";
const SESSION_KEY = "mnemonic_session";

function decryptMnemonic(raw: string) {
  const decryptedBytes = CryptoJS.AES.decrypt(raw, S);
  return decryptedBytes.toString(CryptoJS.enc.Utf8);
}

function isEncryptedMnemonic(value: string): boolean {
  return value.indexOf(" ") === -1 && value.includes(SEPARATOR) === false;
}

export function getMnemonic(): string {
  const sessionRaw = sessionStorage.getItem(SESSION_KEY);
  if (sessionRaw && sessionRaw.length > 0) {
    return isEncryptedMnemonic(sessionRaw)
      ? decryptMnemonic(sessionRaw)
      : sessionRaw;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || raw.length === 0) {
    return "";
  }

  if (isEncryptedMnemonic(raw)) {
    return decryptMnemonic(raw);
  }

  // Handle existing plain text mnemonics by re-saving as encrypted in persistent storage
  setMnemonic(raw, { persist: true });
  return raw;
}

export function getMnemonicAndPassphrase(): { mnemonic: string; passphrase: string } {
  const fullData = getMnemonic();
  
  // Check if passphrase exists (new format)
  if (fullData.includes(SEPARATOR)) {
    const [mnemonic, passphrase] = fullData.split(SEPARATOR);
    return { mnemonic, passphrase };
  }
  
  // Old format without passphrase (backward compatible)
  return { mnemonic: fullData, passphrase: "" };
}

export function setMnemonic(_value: string, options?: { persist?: boolean }) {
  const value = _value.trim();
  const persist = options?.persist ?? true;
  const storage = persist ? localStorage : sessionStorage;
  const key = persist ? STORAGE_KEY : SESSION_KEY;
  const otherStorage = persist ? sessionStorage : localStorage;
  const otherKey = persist ? SESSION_KEY : STORAGE_KEY;

  if (!value) {
    storage.removeItem(key);
    otherStorage.removeItem(otherKey);
    return;
  }
  const isEncrypted = isEncryptedMnemonic(value);

  if (isEncrypted) {
    storage.setItem(key, value);
  } else {
    const cipherText = CryptoJS.AES.encrypt(value, S).toString();
    storage.setItem(key, cipherText);
  }

  // Ensure the alternate storage does not retain previous values
  otherStorage.removeItem(otherKey);
}
export function getAssetBalanceIncludingMempool(
  wallet: Wallet,
  assets: IAsset[],
  mempool: any
) {
  const allAssets: { [key: string]: number } = {}; //Object with assets from blockchain and from mempool
  //Add assets from blockchain
  assets.map(
    (asset: IAsset) => (allAssets[asset.assetName] = asset.balance / 1e8)
  );

  //Add assets from mempool
  if (mempool && mempool.length > 0) {
    mempool.map((m: IAsset) => {
      //Ignore base currency such as XNA
      if (m.assetName === wallet.baseCurrency) {
        return;
      }
      const hasAsset = allAssets.hasOwnProperty(m.assetName);

      if (hasAsset === false) {
        allAssets[m.assetName] = 0;
      }
      const pending = getAssetBalanceFromMempool(m.assetName, mempool);
      allAssets[m.assetName] += pending;
    });
  }

  return allAssets;
}
export function getAssetBalanceFromMempool(assetName: string, mempool: any) {
  if (!mempool) {
    return 0;
  }
  if (mempool.length === 0) {
    return 0;
  }

  let pending = 0;
  mempool.map((item: any) => {
    if (item.assetName === assetName) {
      pending = pending + item.satoshis / 1e8;
    }
  });
  return pending;
}

export const WALLET_ADDRESS = "- Wallet address (first address in wallet)";
