import type {Amount, RawAmount} from "../exactAmounts";
export interface UTXOResponse {
  assetName?: string;
  outputIndex?: number;
  script?: string;
  txid?: string;
  vout?: number;
  address?: string;
  scriptPubKey?: string;
  amount?: Amount;
  satoshis?: RawAmount;
  value?: Amount;
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
