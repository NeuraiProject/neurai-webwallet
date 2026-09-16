import { decryptPinV2, getStoredMnemonicRaw, splitMnemonicAndPassphrase } from '../utils';

/** Authorize each export against the encrypted secret for the active wallet. */
export async function verifyRecoveryPin(
  pin: string,
  network: string,
  mnemonic: string,
  passphrase: string,
): Promise<string> {
  const stored = getStoredMnemonicRaw(network);
  if (!stored?.value.startsWith('pin-v2:')) {
    throw new Error('PIN verification is unavailable. Sign out and unlock this wallet with its PIN before viewing recovery words.');
  }
  let plaintext: string;
  try {
    plaintext = await decryptPinV2(stored.value, pin);
  } catch {
    throw new Error('Unable to verify the PIN for this wallet.');
  }
  if (!plaintext) throw new Error('Incorrect PIN. Try again.');
  const secret = splitMnemonicAndPassphrase(plaintext);
  if (secret.mnemonic !== mnemonic.trim() || secret.passphrase !== passphrase) {
    throw new Error('The protected backup does not match this wallet. Nothing was revealed.');
  }
  return secret.mnemonic;
}
