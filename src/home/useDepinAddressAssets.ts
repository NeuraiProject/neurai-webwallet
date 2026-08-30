import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

import { normalizeAssetAmountMaybe } from "../utils/formatting";

/**
 * Tokens held at the DePIN chat address.
 *
 * That address is derived at BIP44 account 100, outside the wallet's ordinary
 * address range, so nothing it holds appears in the normal balances. Somebody
 * who sent themselves a DePIN token to use the chat would otherwise open the
 * wallet and see nothing at all.
 *
 * Read-only and clearly separated in the UI: these tokens are not spendable
 * from the main wallet screens, and showing them as if they were would be worse
 * than not showing them.
 */
export function useDepinAddressAssets(wallet: Wallet, address: string | null, blockCount: number) {
  const [assets, setAssets] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!address) {
      setAssets({});
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const balances = (await wallet.rpc("listassetbalancesbyaddress", [address])) as Record<string, unknown> | null;
        if (cancelled) return;
        const out: Record<string, number> = {};
        for (const [name, raw] of Object.entries(balances ?? {})) {
          const amount = normalizeAssetAmountMaybe(raw);
          if (amount > 0) out[name] = amount;
        }
        setAssets(out);
      } catch {
        // A node without the asset index, or an address with no history: the
        // home page simply shows nothing extra rather than an error.
        if (!cancelled) setAssets({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, address, blockCount]);

  return assets;
}
