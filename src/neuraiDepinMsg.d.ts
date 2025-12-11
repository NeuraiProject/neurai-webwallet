export {};

declare global {
  const neuraiDepinMsg: {
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
  };
}
