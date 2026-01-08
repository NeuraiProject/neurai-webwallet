export interface UTXOResponse {
  txid?: string;
  vout?: number;
  address?: string;
  scriptPubKey?: string;
  amount?: number;
  satoshis?: number;
  value?: number;
  height?: number;
  confirmations?: number;
  [key: string]: unknown;
}

export interface PubkeyResponse {
  pubkey?: string;
  revealed?: number | boolean;
  result?:
    | {
        pubkey?: string;
        revealed?: number | boolean;
      }
    | string;
  [key: string]: unknown;
}
