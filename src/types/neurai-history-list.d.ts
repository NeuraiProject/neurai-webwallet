/**
 * `@neuraiproject/neurai-history-list` ships no type declarations, so every
 * import of it was an implicit `any`. This states the shape the wallet actually
 * relies on: deltas in, transactions out, each with the assets that moved.
 */
declare module "@neuraiproject/neurai-history-list" {
  export interface IDelta {
    satoshis?: number;
    value?: number;
    txid?: string;
    assetName?: string;
    address?: string;
    height?: number;
    [key: string]: unknown;
  }

  export interface IHistoryAsset {
    assetName: string;
    /** Signed amount in whole units. */
    value: number;
    /** Signed amount in satoshis, as the deltas carried it. */
    satoshis: number;
  }

  export interface IHistoryTransaction {
    transactionId: string;
    blockHeight?: number;
    /**
     * The assets that moved. A currency delta that is only the fee of an asset
     * operation is folded into `fee` and does not appear here.
     */
    assets: IHistoryAsset[];
    /** The library's own read of the direction, more reliable than a sign. */
    isSent?: boolean;
    fee?: number;
  }

  export function getHistory(deltas: IDelta[]): IHistoryTransaction[];
}
