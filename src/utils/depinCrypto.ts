/**
 * DePIN Crypto Utilities
 * 
 * Implements ECIES encryption and Bitcoin-style binary serialization
 * for CDepinMessage structure used by depinsubmitmsg RPC command.
 * 
 * Based on Neurai/src/depinecies.cpp and Neurai/src/depinmsgpool.h
 */

import * as secp256k1 from 'secp256k1';
import CryptoJS from 'crypto-js';

// Use global Buffer which is available in both Node.js and browser (via polyfills)

// Helper: Write varint (Bitcoin compact size)
export function writeVarInt(value: number): Buffer {
  if (value < 0xfd) {
    return Buffer.from([value]);
  } else if (value <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(value, 1);
    return buf;
  } else if (value <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(value, 1);
    return buf;
  } else {
    const buf = Buffer.alloc(9);
    buf[0] = 0xff;
    buf.writeBigUInt64LE(BigInt(value), 1);
    return buf;
  }
}

// Helper: Serialize string (varint length + data)
export function serializeString(str: string): Buffer {
  const data = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(data.length), data]);
}

// Helper: Serialize vector<unsigned char> (varint length + data)
export function serializeVector(data: Buffer): Buffer {
  return Buffer.concat([writeVarInt(data.length), data]);
}

// Helper: Serialize int64 (little-endian)
export function serializeInt64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value), 0);
  return buf;
}

// Helper: Serialize uint160 (20 bytes, little-endian)
export function serializeUint160(hash160: Buffer): Buffer {
  // Hash160 is already 20 bytes in little-endian
  return hash160;
}

// Helper: Serialize CPubKey (compressed, 33 bytes)
export function serializePubKey(pubkey: Buffer): Buffer {
  // Compressed pubkey starts with 02 or 03 and is 33 bytes
  // Serialized as: size (1 byte for 33) + pubkey data
  if (pubkey.length === 33) {
    return Buffer.concat([Buffer.from([33]), pubkey]);
  } else if (pubkey.length === 65) {
    // Compress uncompressed pubkey
    const compressed = compressPubKey(pubkey);
    return Buffer.concat([Buffer.from([33]), compressed]);
  }
  throw new Error('Invalid public key length');
}

// Helper: Compress public key
function compressPubKey(uncompressed: Buffer): Buffer {
  if (uncompressed.length === 33) return uncompressed;
  if (uncompressed.length !== 65) throw new Error('Invalid uncompressed pubkey');
  
  const x = uncompressed.slice(1, 33);
  const y = uncompressed.slice(33, 65);
  const prefix = y[31] % 2 === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}

// KDF using SHA256
function kdf(sharedSecret: Buffer, keyLength: number): Buffer {
  const hash = CryptoJS.SHA256(CryptoJS.lib.WordArray.create(sharedSecret as any));
  const hashBytes = wordArrayToBuffer(hash);
  return hashBytes.slice(0, keyLength) as Buffer;
}

// HMAC-SHA256
function hmacSha256(key: Buffer, data: Buffer): Buffer {
  const keyWA = CryptoJS.lib.WordArray.create(key as any);
  const dataWA = CryptoJS.lib.WordArray.create(data as any);
  const hmac = CryptoJS.HmacSHA256(dataWA, keyWA);
  return wordArrayToBuffer(hmac);
}

// Convert CryptoJS WordArray to Buffer
function wordArrayToBuffer(wordArray: CryptoJS.lib.WordArray): Buffer {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const result = Buffer.alloc(sigBytes);
  
  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  
  return result;
}

// Generate random bytes
function randomBytes(size: number): Buffer {
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  return Buffer.from(array);
}

// SHA256 hash
function sha256(data: Buffer): Buffer {
  const wa = CryptoJS.lib.WordArray.create(data as any);
  const hash = CryptoJS.SHA256(wa);
  return wordArrayToBuffer(hash);
}

function ripemd160(data: Buffer): Buffer {
  const wa = CryptoJS.lib.WordArray.create(data as any);
  // crypto-js exposes RIPEMD160 in the default build
  const hash = (CryptoJS as any).RIPEMD160(wa) as CryptoJS.lib.WordArray;
  return wordArrayToBuffer(hash);
}

function hash160(data: Buffer): Buffer {
  return ripemd160(sha256(data));
}

// KDF_SHA256(sharedSecret, outLen): SHA256(sharedSecret || counter_be32) repeated
function kdfSha256Counter(sharedSecret: Buffer, outputLen: number): Buffer {
  let out = Buffer.alloc(0);
  let counter = 1;
  while (out.length < outputLen) {
    const counterBytes = Buffer.from([
      (counter >>> 24) & 0xff,
      (counter >>> 16) & 0xff,
      (counter >>> 8) & 0xff,
      counter & 0xff,
    ]);
    const block = sha256(Buffer.concat([sharedSecret, counterBytes]));
    out = Buffer.concat([out, block]);
    counter++;
  }
  return out.slice(0, outputLen);
}

function sha256d(data: Buffer): Buffer {
  return sha256(sha256(data));
}

// AES-256-CBC encryption
function aes256CbcEncrypt(plaintext: Buffer, key: Buffer, iv: Buffer): Buffer {
  const plaintextWA = CryptoJS.lib.WordArray.create(plaintext as any);
  const keyWA = CryptoJS.lib.WordArray.create(key as any);
  const ivWA = CryptoJS.lib.WordArray.create(iv as any);
  
  const encrypted = CryptoJS.AES.encrypt(plaintextWA, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return wordArrayToBuffer(encrypted.ciphertext);
}

// AES-256-CBC decryption
function aes256CbcDecrypt(ciphertext: Buffer, key: Buffer, iv: Buffer): Buffer {
  const ciphertextWA = CryptoJS.lib.WordArray.create(ciphertext as any);
  const keyWA = CryptoJS.lib.WordArray.create(key as any);
  const ivWA = CryptoJS.lib.WordArray.create(iv as any);

  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWA });
  const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return wordArrayToBuffer(decrypted);
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeHex(hex: string): string {
  return (hex ?? '').trim().toLowerCase().replace(/^0x/, '');
}

function base58DecodeToBuffer(str: string): Buffer {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const char of str) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error('Invalid base58 character');
    num = num * BigInt(58) + BigInt(idx);
  }

  let hex = num.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  let buf = Buffer.from(hex, 'hex');

  // Preserve leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) leadingZeros++;
  if (leadingZeros > 0) {
    buf = Buffer.concat([Buffer.alloc(leadingZeros, 0), buf]);
  }

  return buf;
}

function base58CheckDecode(str: string): Buffer {
  const raw = base58DecodeToBuffer(str);
  if (raw.length < 4) throw new Error('Invalid base58check payload');
  const payload = raw.slice(0, -4);
  const checksum = raw.slice(-4);
  const expected = sha256d(payload).slice(0, 4);
  if (!buffersEqual(checksum, expected)) throw new Error('Invalid base58check checksum');
  return payload;
}

function normalizePrivateKeyTo32Bytes(privateKey: string): Buffer {
  const pk = (privateKey ?? '').trim();
  if (!pk) throw new Error('Missing private key');

  const maybeHex = normalizeHex(pk);
  if (/^[0-9a-f]{64}$/.test(maybeHex)) {
    return Buffer.from(maybeHex, 'hex');
  }

  // WIF (Base58Check): [version(1) || key(32) || (optional 0x01 compressed)]
  const payload = base58CheckDecode(pk);
  if (payload.length !== 33 && payload.length !== 34) {
    throw new Error('Invalid WIF payload length');
  }
  const key = payload.slice(1, 33);
  if (key.length !== 32) throw new Error('Invalid WIF key length');
  return key;
}

function readVarInt(buf: Buffer, offset: number): { value: number; offset: number } {
  if (offset >= buf.length) throw new Error('readVarInt: out of range');
  const first = buf[offset];
  if (first < 0xfd) return { value: first, offset: offset + 1 };
  if (first === 0xfd) {
    if (offset + 3 > buf.length) throw new Error('readVarInt: truncated (0xfd)');
    return { value: buf.readUInt16LE(offset + 1), offset: offset + 3 };
  }
  if (first === 0xfe) {
    if (offset + 5 > buf.length) throw new Error('readVarInt: truncated (0xfe)');
    return { value: buf.readUInt32LE(offset + 1), offset: offset + 5 };
  }
  if (offset + 9 > buf.length) throw new Error('readVarInt: truncated (0xff)');
  const v = Number(buf.readBigUInt64LE(offset + 1));
  return { value: v, offset: offset + 9 };
}

function readVector(buf: Buffer, offset: number): { data: Buffer; offset: number } {
  const { value: len, offset: afterLen } = readVarInt(buf, offset);
  const end = afterLen + len;
  if (end > buf.length) throw new Error('readVector: truncated');
  return { data: buf.slice(afterLen, end), offset: end };
}

function deserializeECIESMessage(serialized: Buffer): CECIESEncryptedMessage {
  let offset = 0;

  // Neurai CECIESEncryptedMessage encodes ephemeral pubkey as a vector
  // (CompactSize length + raw pubkey bytes).
  const pubKeyRead = readVector(serialized, offset);
  const ephemeralPubKey = pubKeyRead.data;
  offset = pubKeyRead.offset;
  if (ephemeralPubKey.length !== 33 && ephemeralPubKey.length !== 65) {
    throw new Error('ECIES: invalid pubkey length');
  }

  // encryptedPayload vector
  const payloadRead = readVector(serialized, offset);
  const encryptedPayload = payloadRead.data;
  offset = payloadRead.offset;

  // recipientKeys map
  const { value: count, offset: afterCount } = readVarInt(serialized, offset);
  offset = afterCount;
  const recipientKeys = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (offset + 20 > serialized.length) throw new Error('ECIES: truncated hash160');
    const hash160Hex = serialized.slice(offset, offset + 20).toString('hex');
    offset += 20;
    const vec = readVector(serialized, offset);
    offset = vec.offset;
    recipientKeys.set(hash160Hex, vec.data);
  }

  return { ephemeralPubKey, encryptedPayload, recipientKeys };
}

// ECDH compute shared secret using secp256k1 v4 API
function ecdhComputeSecret(privateKey: Uint8Array, publicKey: Uint8Array): Buffer {
  // secp256k1 v4 uses ecdh function
  const output = new Uint8Array(32);
  secp256k1.ecdh(publicKey, privateKey, { data: undefined, hashfn: undefined }, output);
  return Buffer.from(output);
}

// Verify private key
function privateKeyVerify(privateKey: Uint8Array): boolean {
  return secp256k1.privateKeyVerify(privateKey);
}

// Create public key from private key
function publicKeyCreate(privateKey: Uint8Array, compressed: boolean = true): Buffer {
  return Buffer.from(secp256k1.publicKeyCreate(privateKey, compressed));
}

// Verify public key
function publicKeyVerify(publicKey: Uint8Array): boolean {
  return secp256k1.publicKeyVerify(publicKey);
}

// Sign message and return DER-encoded signature
function ecdsaSign(messageHash: Uint8Array, privateKey: Uint8Array): Buffer {
  const sigObj = secp256k1.ecdsaSign(messageHash, privateKey);
  return Buffer.from(secp256k1.signatureExport(sigObj.signature));
}

/**
 * CECIESEncryptedMessage structure:
 * - ephemeralPubKey: CPubKey (33 bytes compressed)
 * - encryptedPayload: vector<unsigned char> [IV (16) || ciphertext || HMAC (32)]
 * - recipientKeys: map<uint160, vector<unsigned char>>
 */
export interface CECIESEncryptedMessage {
  ephemeralPubKey: Buffer;        // 33 bytes compressed
  encryptedPayload: Buffer;       // IV + ciphertext + HMAC
  recipientKeys: Map<string, Buffer>; // hash160 (hex) -> [IV || encrypted_aes_key || HMAC]
}

/**
 * Encrypt message for multiple recipients using ECIES hybrid encryption
 * 
 * @param plaintext Message to encrypt
 * @param recipientPubKeys Map of address -> public key (33 bytes compressed)
 * @returns CECIESEncryptedMessage structure
 */
export function eciesEncryptMessage(
  plaintext: string,
  recipientPubKeys: Map<string, Buffer>
): CECIESEncryptedMessage {
  if (!plaintext) throw new Error('Plaintext is empty');
  if (recipientPubKeys.size === 0) throw new Error('No recipients provided');

  console.log('  [ECIES] Starting encryption...');
  console.log('    Plaintext length:', plaintext.length);
  console.log('    Number of recipients:', recipientPubKeys.size);

  // Step 1: Generate ephemeral key pair
  console.log('  [ECIES] Step 1: Generate ephemeral key pair');
  let ephemeralPrivKey: Buffer;
  let attempts = 0;
  do {
    ephemeralPrivKey = randomBytes(32);
    attempts++;
  } while (!privateKeyVerify(ephemeralPrivKey));
  console.log('    Generated after', attempts, 'attempt(s)');
  
  const ephemeralPubKey = publicKeyCreate(ephemeralPrivKey, true);
  console.log('    Ephemeral pubkey:', ephemeralPubKey.toString('hex'));

  // Step 2: Derive AES key from ephemeral private key
  console.log('  [ECIES] Step 2: Derive AES key');
  const aesKey = kdf(ephemeralPrivKey, 32);
  console.log('    AES key derived, length:', aesKey.length);

  // Step 3: Generate random IV
  console.log('  [ECIES] Step 3: Generate IV');
  const iv = randomBytes(16);
  console.log('    IV:', iv.toString('hex'));

  // Step 4: Encrypt plaintext with AES-256-CBC
  console.log('  [ECIES] Step 4: AES encrypt plaintext');
  const plaintextBuf = Buffer.from(plaintext, 'utf8');
  const ciphertext = aes256CbcEncrypt(plaintextBuf, aesKey, iv);
  console.log('    Ciphertext length:', ciphertext.length);

  // Step 5: Compute HMAC of ciphertext
  console.log('  [ECIES] Step 5: Compute HMAC');
  const hmac = hmacSha256(aesKey, ciphertext);
  console.log('    HMAC:', hmac.toString('hex'));

  // Step 6: Package encrypted payload: [IV || ciphertext || HMAC]
  console.log('  [ECIES] Step 6: Package encrypted payload');
  const encryptedPayload = Buffer.concat([iv, ciphertext, hmac]);
  console.log('    Payload size:', encryptedPayload.length, '(IV:16 + cipher:' + ciphertext.length + ' + HMAC:32)');

  // Step 7: For each recipient, encrypt the AES key using ECDH
  console.log('  [ECIES] Step 7: Encrypt AES key for each recipient');
  const recipientKeys = new Map<string, Buffer>();
  
  for (const [address, recipientPubKey] of recipientPubKeys) {
    try {
      console.log('    Processing recipient:', address);
      console.log('      Pubkey:', recipientPubKey.toString('hex').substring(0, 20) + '...');
      
      if (!publicKeyVerify(recipientPubKey)) {
        console.warn(`      ❌ Invalid public key, skipping`);
        continue;
      }

      // Compute shared secret: ECDH(ephemeral_privkey, recipient_pubkey)
      const sharedSecret = ecdhComputeSecret(ephemeralPrivKey, recipientPubKey);
      console.log('      Shared secret computed');

      // Derive encryption key from shared secret
      const encKey = kdf(sharedSecret, 32);

      // Generate random IV for this recipient's key encryption
      const recipientIV = randomBytes(16);

      // Encrypt the AES key
      const encryptedAESKey = aes256CbcEncrypt(aesKey, encKey, recipientIV);

      // Compute HMAC of encrypted AES key
      const recipientHMAC = hmacSha256(encKey, encryptedAESKey);

      // Package for this recipient: [IV || encrypted_aes_key || HMAC]
      const recipientPackage = Buffer.concat([recipientIV, encryptedAESKey, recipientHMAC]);
      console.log('      Package size:', recipientPackage.length);

      // Get address hash160
      const hash160Hex = addressToHash160(address);
      console.log('      Hash160:', hash160Hex);
      
      recipientKeys.set(hash160Hex, recipientPackage);
      console.log('      ✓ Encrypted successfully');
    } catch (err: any) {
      console.warn(`      ❌ Failed to encrypt:`, err.message);
    }
  }

  if (recipientKeys.size === 0) {
    throw new Error('Failed to encrypt for any recipient');
  }

  console.log('  [ECIES] Encryption complete. Recipients encrypted:', recipientKeys.size);

  return {
    ephemeralPubKey,
    encryptedPayload,
    recipientKeys
  };
}

/**
 * Serialize CECIESEncryptedMessage to binary format
 */
export function serializeECIESMessage(msg: CECIESEncryptedMessage): Buffer {
  const parts: Buffer[] = [];

  // 1. Serialize CPubKey (size + data)
  parts.push(serializePubKey(msg.ephemeralPubKey));

  // 2. Serialize encryptedPayload (varint length + data)
  parts.push(serializeVector(msg.encryptedPayload));

  // 3. Serialize recipientKeys map
  // Format: varint(count) + for each: [uint160 + varint(len) + data]
  parts.push(writeVarInt(msg.recipientKeys.size));
  
  for (const [hash160Hex, data] of msg.recipientKeys) {
    // uint160 (20 bytes)
    const hash160 = Buffer.from(hash160Hex, 'hex');
    parts.push(hash160);
    // vector<unsigned char>
    parts.push(serializeVector(data));
  }

  return Buffer.concat(parts);
}

/**
 * CDepinMessage structure:
 * - token: string
 * - senderAddress: string
 * - timestamp: int64
 * - signature: vector<unsigned char>
 * - encryptedPayload: vector<unsigned char> (serialized CECIESEncryptedMessage)
 */
export interface CDepinMessage {
  token: string;
  senderAddress: string;
  timestamp: number;
  signature: Buffer;
  encryptedPayload: Buffer;
}

/**
 * Serialize CDepinMessage to binary format for depinsubmitmsg
 */
export function serializeDepinMessage(msg: CDepinMessage): Buffer {
  const parts: Buffer[] = [];

  // 1. token (string)
  parts.push(serializeString(msg.token));

  // 2. senderAddress (string)
  parts.push(serializeString(msg.senderAddress));

  // 3. timestamp (int64, little-endian)
  parts.push(serializeInt64(msg.timestamp));

  // 4. signature (vector<unsigned char>)
  parts.push(serializeVector(msg.signature));

  // 5. encryptedPayload (vector<unsigned char>)
  parts.push(serializeVector(msg.encryptedPayload));

  return Buffer.concat(parts);
}

/**
 * Sign a DePIN message
 * Hash format: SHA256(token || senderAddress || timestamp || encryptedPayload)
 */
export function signDepinMessage(msg: CDepinMessage, privateKey: Buffer): Buffer {
  // Create hash of message data
  const hashData = Buffer.concat([
    serializeString(msg.token),
    serializeString(msg.senderAddress),
    serializeInt64(msg.timestamp),
    serializeVector(msg.encryptedPayload)
  ]);
  
  const messageHash = sha256(hashData);

  // Sign with secp256k1
  return ecdsaSign(messageHash, privateKey);
}

/**
 * Convert Neurai address to hash160 (hex string)
 */
export function addressToHash160(address: string): string {
  // Base58Check decode
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  let num = BigInt(0);
  for (const char of address) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error('Invalid address character');
    num = num * BigInt(58) + BigInt(idx);
  }
  
  // Convert to bytes (25 bytes: 1 version + 20 hash + 4 checksum)
  let hex = num.toString(16);
  while (hex.length < 50) hex = '0' + hex;
  
  // Extract hash160 (bytes 1-20, skip version byte, exclude checksum)
  const hash160 = hex.slice(2, 42);
  
  return hash160;
}

/**
 * Convert hex public key to Buffer
 */
export function hexToPublicKey(hexPubKey: string): Buffer {
  const buf = Buffer.from(hexPubKey, 'hex');
  if (buf.length !== 33 && buf.length !== 65) {
    throw new Error('Invalid public key length');
  }
  return buf;
}

/**
 * Build and serialize a complete DePIN message ready for depinsubmitmsg
 * 
 * @param token Token name (e.g., "TESTDEPIN112025")
 * @param senderAddress Sender's Neurai address
 * @param message Plain text message to send
 * @param senderPrivateKey Sender's private key (32 bytes)
 * @param recipientPubKeys Map of address -> public key for all token holders
 * @returns Hex-encoded serialized message
 */
export function buildDepinMessage(
  token: string,
  senderAddress: string,
  message: string,
  senderPrivateKey: Buffer,
  recipientPubKeys: Map<string, Buffer>
): string {
  console.log('='.repeat(60));
  console.log('📦 BUILD DEPIN MESSAGE - START');
  console.log('='.repeat(60));
  console.log('Input parameters:');
  console.log('  Token:', token);
  console.log('  Sender address:', senderAddress);
  console.log('  Message:', message);
  console.log('  Message length:', message.length);
  console.log('  Private key length:', senderPrivateKey.length, 'bytes');
  console.log('  Private key (first 8 chars):', senderPrivateKey.toString('hex').substring(0, 8) + '...');
  console.log('  Number of recipients:', recipientPubKeys.size);
  
  // Log all recipients
  console.log('Recipients with pubkeys:');
  for (const [addr, pubkey] of recipientPubKeys) {
    console.log(`    ${addr}: ${pubkey.toString('hex').substring(0, 20)}...`);
  }

  try {
    // 1. Encrypt message for all recipients
    console.log('\n--- STEP 1: ECIES Encryption ---');
    const eciesMsg = eciesEncryptMessage(message, recipientPubKeys);
    console.log('  ✓ ECIES encryption completed');
    console.log('    Ephemeral pubkey:', eciesMsg.ephemeralPubKey.toString('hex'));
    console.log('    Encrypted payload size:', eciesMsg.encryptedPayload.length, 'bytes');
    console.log('    Recipients encrypted:', eciesMsg.recipientKeys.size);

    // 2. Serialize ECIES message
    console.log('\n--- STEP 2: Serialize ECIES Message ---');
    const serializedECIES = serializeECIESMessage(eciesMsg);
    console.log('  ✓ ECIES serialization completed');
    console.log('    Serialized ECIES size:', serializedECIES.length, 'bytes');
    console.log('    Serialized ECIES (first 100 hex):', serializedECIES.toString('hex').substring(0, 100) + '...');

    // 3. Create CDepinMessage
    console.log('\n--- STEP 3: Create CDepinMessage ---');
    const timestamp = Math.floor(Date.now() / 1000);
    const depinMsg: CDepinMessage = {
      token,
      senderAddress,
      timestamp,
      signature: Buffer.alloc(0), // Will be filled after signing
      encryptedPayload: serializedECIES
    };
    console.log('  ✓ CDepinMessage created');
    console.log('    Token:', depinMsg.token);
    console.log('    Sender:', depinMsg.senderAddress);
    console.log('    Timestamp:', depinMsg.timestamp);
    console.log('    Encrypted payload size:', depinMsg.encryptedPayload.length);

    // 4. Sign the message
    console.log('\n--- STEP 4: Sign Message ---');
    depinMsg.signature = signDepinMessage(depinMsg, senderPrivateKey);
    console.log('  ✓ Message signed');
    console.log('    Signature size:', depinMsg.signature.length, 'bytes');
    console.log('    Signature (hex):', depinMsg.signature.toString('hex'));

    // 5. Serialize complete message
    console.log('\n--- STEP 5: Serialize Complete Message ---');
    const serialized = serializeDepinMessage(depinMsg);
    console.log('  ✓ Message serialized');
    console.log('    Total serialized size:', serialized.length, 'bytes');

    // 6. Convert to hex
    console.log('\n--- STEP 6: Convert to Hex ---');
    const hexMessage = serialized.toString('hex');
    console.log('  ✓ Converted to hex');
    console.log('    Hex length:', hexMessage.length, 'characters');
    console.log('    First 200 chars:', hexMessage.substring(0, 200) + '...');

    console.log('\n' + '='.repeat(60));
    console.log('📦 BUILD DEPIN MESSAGE - COMPLETE');
    console.log('='.repeat(60));

    return hexMessage;
  } catch (err: any) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ BUILD DEPIN MESSAGE - ERROR');
    console.error('='.repeat(60));
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}

/**
 * Decrypt `encrypted_payload_hex` returned by `depinreceivemsg`.
 *
 * - Uses `recipientAddress` to pick the correct per-recipient key from the ECIES map.
 * - Uses the selected address private key (WIF or 64-hex) to decrypt.
 * - Returns null when the payload isn't decryptable for this address.
 */
export function decryptDepinReceiveEncryptedPayload(
  encryptedPayloadHex: string,
  recipientAddress: string,
  recipientPrivateKey: string
): string | null {
  const hex = normalizeHex(encryptedPayloadHex);
  if (!hex) return null;

  const serialized = Buffer.from(hex, 'hex');
  const ecies = deserializeECIESMessage(serialized);

  // recipientKeys is keyed by CKeyID = Hash160(compressed_pubkey), not address hash160.
  const privKey32 = normalizePrivateKeyTo32Bytes(recipientPrivateKey);
  if (!privateKeyVerify(privKey32)) throw new Error('Invalid recipient private key');

  const recipientPubKey = publicKeyCreate(privKey32, true);
  const keyIdBE = hash160(recipientPubKey).toString('hex');
  const keyIdLE = Buffer.from(keyIdBE, 'hex').reverse().toString('hex');

  const recipientPackage = ecies.recipientKeys.get(keyIdBE) ?? ecies.recipientKeys.get(keyIdLE);
  if (!recipientPackage) return null;

  const ephemeralPubKey = ecies.ephemeralPubKey;
  if (!publicKeyVerify(ephemeralPubKey)) throw new Error('Invalid ephemeral public key');

  // recipientPackage = [IV(16) || encrypted_aes_key || HMAC(32)]
  if (recipientPackage.length < 16 + 16 + 32) {
    throw new Error('Recipient key package too short');
  }
  const recipientIV = recipientPackage.slice(0, 16);
  const recipientHMAC = recipientPackage.slice(recipientPackage.length - 32);
  const encryptedAESKey = recipientPackage.slice(16, recipientPackage.length - 32);

  // sharedSecret and KDF must match Neurai Core:
  // sharedSecret := SHA256(compressed(shared_point))
  // encKey := KDF_SHA256(sharedSecret, 32)
  const sharedSecret = ecdhComputeSecret(privKey32, ephemeralPubKey);
  const encKey = kdfSha256Counter(sharedSecret, 32);

  const expectedRecipientHMAC = hmacSha256(encKey, encryptedAESKey);
  if (!buffersEqual(expectedRecipientHMAC, recipientHMAC)) {
    return null;
  }

  const aesKeyRaw = aes256CbcDecrypt(encryptedAESKey, encKey, recipientIV);
  if (aesKeyRaw.length < 32) return null;
  const aesKey = aesKeyRaw.slice(0, 32);

  // encryptedPayload = [IV(16) || ciphertext || HMAC(32)]
  const payload = ecies.encryptedPayload;
  if (payload.length < 16 + 32) return null;
  const iv = payload.slice(0, 16);
  const payloadHmac = payload.slice(payload.length - 32);
  const ciphertext = payload.slice(16, payload.length - 32);

  const expectedPayloadHmac = hmacSha256(aesKey, ciphertext);
  if (!buffersEqual(expectedPayloadHmac, payloadHmac)) {
    return null;
  }

  const plaintextBuf = aes256CbcDecrypt(ciphertext, aesKey, iv);
  return plaintextBuf.toString('utf8');
}
