import React from "react";
import { getHistory } from "@neuraiproject/neurai-history-list";
import { AssetName } from "../AssetName";
import { LabeledContent } from "./LabeledContent";
import { ToAddress } from "./ToAddress";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { CopyButton } from "../components/CopyButton";
import { useTransaction } from "../useTransaction";

import networkInfo from "../networkInfo";
import "./History.css";

type RawHistoryItem = {
  satoshis?: number;
  value?: number;
  [key: string]: unknown;
};

type HistoryAsset = {
  assetName: string;
  value: number;
};

type HistoryListItem = {
  transactionId: string;
  blockHeight?: number;
  assets: HistoryAsset[];
};

interface IProps {
  blockCount: number | null;
  wallet: Wallet;
}
export function History({ blockCount, wallet }: IProps) {
  const [history, setHistory] = React.useState<RawHistoryItem[]>([]);

  React.useEffect(() => {
    wallet.getHistory().then(setHistory);
  }, [blockCount, wallet]);

  const normalizedHistory = React.useMemo(
    () =>
      history.map((h) => ({
        ...h,
        value: typeof h.satoshis === "number" ? h.satoshis / 1e8 : h.value,
      })),
    [history]
  );

  const items = getHistory(normalizedHistory) as HistoryListItem[];
  items.sort((item1, item2) => (item2.blockHeight ?? 0) - (item1.blockHeight ?? 0));

  const listItems = items.map((item, index) => {
    if (index > 20) {
      return null;
    }

    const networkKey = wallet.network as keyof typeof networkInfo;
    const network = networkInfo[networkKey] ?? networkInfo.xna;
    const transactionURL = network?.getTransactionURL?.(item.transactionId);

    return (
      <article key={item.transactionId} className="rebel-history__item">
        <h3>
          <BlockTime
            transactionId={item.transactionId}
            wallet={wallet}
          ></BlockTime>
        </h3>

        <LabeledContent label="Amount">
          {item.assets[0].value.toLocaleString()}{" "}
          <AssetName name={item.assets[0].assetName} />
        </LabeledContent>
        <Spacer size="xs" />
        <LabeledContent label="Fee">
          <Fee wallet={wallet} transactionId={item.transactionId} />
        </LabeledContent>

        <details className="rebel-history__details">
          <summary className="rebel-history__summary">More info</summary>

          <div className="rebel-history__more">
            <Spacer size="lg" />
            <ToAddress wallet={wallet} transactionId={item.transactionId} />
            <Spacer size="lg" />
            <fieldset>
              <label>
                Transaction id
                <input type="text" disabled={true} value={item.transactionId} />
              </label>

              <CopyButton value={item.transactionId} title="Copy" />
            </fieldset>
            <Spacer size="lg" />
            {transactionURL && (
              <p>
                <a href={transactionURL} target="_blank" rel="noreferrer">
                  View in block explorer
                </a>
              </p>
            )}
          </div>
        </details>
      </article>
    );
  });
  return <article className="rebel-history">{listItems}</article>;
}

export interface ITransaction {
  vin: Array<{ address?: string; value?: number }>;
  vout: Array<{ value?: number }>;
  time: number;
}

function BlockTime({
  transactionId,
  wallet,
}: {
  transactionId: string;
  wallet: Wallet;
}) {
  const transaction = useTransaction(wallet, transactionId);

  if (!transaction) {
    return null;
  }
  const time = new Date(transaction.time * 1000);
  if (time) {
    return time.toLocaleString();
  }
  return null;
}

function Fee({
  wallet,
  transactionId,
}: {
  wallet: Wallet;
  transactionId: string;
}) {
  const transaction = useTransaction(wallet, transactionId);

  if (!transaction) {
    return null;
  }

  const myAddresses = wallet.getAddresses();

  //We send if any of the outputs are from our wallet
  const sent = transaction.vin.some((input) => {
    if (input.address) {
      return myAddresses.includes(input.address);
    }
    return false;
  });

  if (!sent) {
    return null;
  }
  let totalInput = 0;
  let totalOutput = 0;

  transaction.vin.forEach((o) => {
    totalInput += o.value ?? 0;
  });

  transaction.vout.forEach((o) => {
    totalOutput += o.value ?? 0;
  });

  const fee = totalInput - totalOutput;

  return truncateToFourDecimals(fee);
}

function truncateToFourDecimals(num) {
  return Math.floor(num * 10000) / 10000;
}

function Spacer({ size }: { size: "xs" | "sm" | "lg" }) {
  return <div className={`rebel-history__spacer--${size}`} />;
}
