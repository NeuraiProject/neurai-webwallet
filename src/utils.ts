import { Wallet } from "@neuraiproject/neurai-jswallet";
import { IAsset } from "./Types";

// @ts-ignore - Parcel handles this correctly
const CryptoJS = require("crypto-js");

const SEPARATOR = "|||";
const STORAGE_KEY = "mnemonic";
const SESSION_KEY = "mnemonic_session";

// Legacy (pre-PIN) storage encryption used a static, hardcoded passphrase.
// Keep read-only support to auto-migrate old wallets into pin-v2.
const LEGACY_STATIC_KEY = "U2FsdGVkX1/UYDOP/PD64YU3tbCAeJBR";

const PIN_PREFIX = "pin-v2:";
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;

type PinV2Envelope = {
  v: 2;
  alg: "PBKDF2-AES-GCM";
  hash: "SHA-256";
  it: number;
  ks: 256;
  s: string; // base64 salt
  iv: string; // base64 iv
  ct: string; // base64 ciphertext (includes GCM tag)
};

export type StoredSecretLocation = "local" | "session";

export type MempoolAsset = {
  assetName?: string;
  satoshis?: number;
};

export function normalizeAssetName(value?: string | null): string {
  return (value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase();
}

export function isBaseAssetName(assetName?: string | null, baseCurrency?: string | null): boolean {
  const normalizedAsset = normalizeAssetName(assetName);
  if (!normalizedAsset) {
    return false;
  }
  const normalizedBase = normalizeAssetName(baseCurrency);
  if (!normalizedBase) {
    return normalizedAsset === "XNA";
  }
  return normalizedAsset === normalizedBase;
}

export function getStoredMnemonicRaw(): { location: StoredSecretLocation; value: string } | null {
  const sessionRaw = sessionStorage.getItem(SESSION_KEY);
  if (sessionRaw && sessionRaw.length > 0) {
    return { location: "session", value: sessionRaw };
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && raw.length > 0) {
    return { location: "local", value: raw };
  }

  return null;
}

function isProbablyCiphertext(value: string): boolean {
  // A mnemonic will contain spaces; ciphertext typically won't.
  return value.indexOf(" ") === -1;
}

function decryptLegacyStaticAes(ciphertext: string): string {
  try {
    const decryptedBytes = CryptoJS.AES.decrypt(ciphertext, LEGACY_STATIC_KEY);
    const plaintext = decryptedBytes.toString(CryptoJS.enc.Utf8);
    return (plaintext || "").trim();
  } catch {
    return "";
  }
}

function getCryptoOrThrow(): Crypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("WebCrypto is required");
  }
  return cryptoObj;
}

function getSubtleOrThrow(): SubtleCrypto {
  const cryptoObj = getCryptoOrThrow();
  if (!cryptoObj.subtle) {
    throw new Error("WebCrypto is required");
  }
  return cryptoObj.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(""));
}

function base64ToBytes(base64: string): Uint8Array {
  // Accept base64url as well.
  const normalized = base64
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}

async function deriveAesKeyFromPin(pin: string, salt: Uint8Array, iterations: number) {
  const subtle = getSubtleOrThrow();
  const pinBytes = new TextEncoder().encode(pin.normalize("NFC"));
  const baseKey = await subtle.importKey("raw", pinBytes, { name: "PBKDF2" }, false, ["deriveKey"]);

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPinV2(plaintext: string, pin: string): Promise<string> {
  const subtle = getSubtleOrThrow();
  const cryptoObj = getCryptoOrThrow();
  const salt = cryptoObj.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const iv = cryptoObj.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));

  const key = await deriveAesKeyFromPin(pin, salt, PBKDF2_ITERATIONS);
  const ptBytes = new TextEncoder().encode(plaintext);

  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: AES_GCM_TAG_BITS },
    key,
    ptBytes
  );

  const env: PinV2Envelope = {
    v: 2,
    alg: "PBKDF2-AES-GCM",
    hash: "SHA-256",
    it: PBKDF2_ITERATIONS,
    ks: 256,
    s: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };

  return `${PIN_PREFIX}${utf8ToBase64(JSON.stringify(env))}`;
}

async function decryptPinV2(payload: string, pin: string): Promise<string> {
  const subtle = getSubtleOrThrow();
  const b64 = payload.startsWith(PIN_PREFIX) ? payload.slice(PIN_PREFIX.length) : payload;
  const json = base64ToUtf8(b64);
  const env = JSON.parse(json) as Partial<PinV2Envelope>;

  if (env.v !== 2 || env.alg !== "PBKDF2-AES-GCM" || env.hash !== "SHA-256" || env.ks !== 256) {
    return "";
  }
  if (typeof env.it !== "number" || env.it <= 0) return "";
  if (typeof env.s !== "string" || typeof env.iv !== "string" || typeof env.ct !== "string") return "";

  const salt = base64ToBytes(env.s);
  const iv = base64ToBytes(env.iv);
  const ct = base64ToBytes(env.ct);

  try {
    const key = await deriveAesKeyFromPin(pin, salt, env.it);
    const pt = await subtle.decrypt({ name: "AES-GCM", iv, tagLength: AES_GCM_TAG_BITS }, key, ct);
    return new TextDecoder().decode(new Uint8Array(pt));
  } catch {
    return "";
  }
}

export function splitMnemonicAndPassphrase(fullData: string): { mnemonic: string; passphrase: string } {
  const trimmed = (fullData || "").trim();
  if (!trimmed) return { mnemonic: "", passphrase: "" };
  if (trimmed.includes(SEPARATOR)) {
    const [mnemonic, passphrase] = trimmed.split(SEPARATOR);
    return { mnemonic: mnemonic || "", passphrase: passphrase || "" };
  }
  return { mnemonic: trimmed, passphrase: "" };
}

export function hasStoredMnemonic(): boolean {
  return !!getStoredMnemonicRaw();
}

export function isStoredMnemonicPinProtected(): boolean {
  const found = getStoredMnemonicRaw();
  return !!found?.value?.startsWith(PIN_PREFIX);
}

export async function decryptStoredMnemonicDataWithPin(pin: string): Promise<string> {
  const found = getStoredMnemonicRaw();
  if (!found) return "";

  const raw = found.value;

  if (raw.startsWith(PIN_PREFIX)) {
    return decryptPinV2(raw, pin);
  }

  // If it looks like a plaintext mnemonic/passphrase string, allow migrating it into pin-v2.
  // Any other encrypted format is not supported.
  if (isProbablyCiphertext(raw)) {
    // Attempt legacy (pre-PIN) decrypt so we can migrate into pin-v2.
    return decryptLegacyStaticAes(raw);
  }

  return raw;
}

export async function setMnemonicWithPin(
  mnemonicData: string,
  pin: string,
  options?: { persist?: boolean }
) {
  const value = (mnemonicData || "").trim();
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

  const payload = await encryptPinV2(value, pin);
  storage.setItem(key, payload);
  otherStorage.removeItem(otherKey);
}

export function clearStoredWalletSecrets() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

// Legacy exports kept to avoid breaking older imports (use the PIN-based helpers above).
export function getMnemonic(): string {
  const found = getStoredMnemonicRaw();
  if (!found) return "";
  return found.value;
}

export function getMnemonicAndPassphrase(): { mnemonic: string; passphrase: string } {
  const raw = getMnemonic();
  if (raw.startsWith(PIN_PREFIX)) {
    return { mnemonic: "", passphrase: "" };
  }
  return splitMnemonicAndPassphrase(raw);
}

export function setMnemonic(_value: string, options?: { persist?: boolean }) {
  const value = (_value || "").trim();
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

  storage.setItem(key, value);
  otherStorage.removeItem(otherKey);
}
export function getAssetBalanceIncludingMempool(
  wallet: Wallet,
  assets: IAsset[],
  mempool: MempoolAsset[] | null
) {
  const allAssets: { [key: string]: number } = {}; //Object with assets from blockchain and from mempool
  //Add assets from blockchain
  assets.forEach((asset: IAsset) => {
    if (!asset?.assetName || isBaseAssetName(asset.assetName, wallet.baseCurrency)) {
      return;
    }
    allAssets[asset.assetName] = asset.balance / 1e8;
  });

  //Add assets from mempool
  if (Array.isArray(mempool) && mempool.length > 0) {
    mempool.forEach((m) => {
      //Ignore base currency such as XNA
      if (!m.assetName || isBaseAssetName(m.assetName, wallet.baseCurrency)) {
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
export function getAssetBalanceFromMempool(assetName: string, mempool: MempoolAsset[] | null) {
  if (!Array.isArray(mempool)) {
    return 0;
  }
  if (mempool.length === 0) {
    return 0;
  }

  let pending = 0;
  mempool.forEach((item) => {
    if (item.assetName === assetName && typeof item.satoshis === "number") {
      pending = pending + item.satoshis / 1e8;
    }
  });
  return pending;
}

export const WALLET_ADDRESS = "- Wallet address (first address in wallet)";
