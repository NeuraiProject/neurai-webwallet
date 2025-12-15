export {};

declare global {
  const neuraiDepinMsg: {
    /**
     * Build and serialize a DePIN message for Neurai blockchain
     * @param params - Message parameters
     * @returns Promise with hex, messageHash and other metadata
     */
    buildDepinMessage: (params: {
      token: string;
      senderAddress: string;
      senderPubKey: string;
      privateKey: string;
      timestamp: number;
      message: string;
      recipientPubKeys: string[];
    }) => Promise<{
      hex: string;
      messageHash: string;
      messageHashBytes?: string;
      encryptedSize?: number;
      recipientCount?: number;
    }>;

    /**
     * Decrypt encrypted payload from depinreceivemsg RPC response
     * @param encryptedPayloadHex - Hex string of encrypted payload
     * @param recipientPrivateKey - Private key as WIF or 64-hex
     * @returns Decrypted message string or null if not decryptable
     */
    decryptDepinReceiveEncryptedPayload: (
      encryptedPayloadHex: string,
      recipientPrivateKey: string
    ) => Promise<string | null>;
  };
}
