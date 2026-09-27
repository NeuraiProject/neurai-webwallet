/**
 * Asset issue quantities, as the Asset screen passes them.
 *
 * The screen keeps quantities as exact decimal text. The node's
 * `createrawtransaction` only accepts `asset_quantity` as a JSON number and
 * answered text with "missing asset data for key: asset_quantity"; since
 * neurai-assets 1.8.1 the text is sent as a number with the same digits. This
 * pins that contract, so an install that resolves an older neurai-assets
 * fails here instead of in front of the user.
 */

// The published CommonJS entry exposes `createInstance` on the module object.
const NeuraiWallet: typeof import("@neuraiproject/neurai-jswallet") = require("@neuraiproject/neurai-jswallet");
import { stringifyRpcJson } from "@neuraiproject/neurai-rpc";
import { amountFromInput } from "@/exactAmounts";

const MNEMONIC = "salad hammer want used web finger comic gold trigger accident oblige pluck";
const ADDRESS = "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3";
const P2PKH_SCRIPT = "76a9144ab18a6ba19a04c871eb96e9171c2669260e87fd88ac";

async function outputsSentFor(issue: (wallet: import("@neuraiproject/neurai-jswallet").Wallet) => Promise<unknown>) {
  const wallet = await NeuraiWallet.createInstance({ mnemonic: MNEMONIC, network: "xna-test", offlineMode: true });
  let captured: unknown;
  wallet.rpc = (async (method: string, params: unknown[] = []) => {
    switch (method) {
      case "getblockchaininfo":
        return { chain: "test", asset_marker: "xna" };
      case "getassetdata":
        throw new Error("Asset not found");
      case "getaddressutxos":
        return (params[0] as { assetName?: string })?.assetName
          ? []
          : [{ txid: "cc".repeat(32), outputIndex: 0, address: ADDRESS, assetName: "XNA", script: P2PKH_SCRIPT, satoshis: 500000 * 1e8, height: 100 }];
      case "getaddressmempool":
        return [];
      case "estimatesmartfee":
        return { feerate: 0.015 };
      case "createrawtransaction":
        // Stop the build here: what matters is what reached the node.
        captured = params[1];
        throw new Error("createrawtransaction captured");
      default:
        throw new Error(`Unexpected RPC method in stub: ${method}`);
    }
  }) as typeof wallet.rpc;
  await expect(issue(wallet)).rejects.toThrow("createrawtransaction captured");
  return stringifyRpcJson(captured);
}

test("a DePIN issue quantity typed as text reaches createrawtransaction as a JSON number", async () => {
  const sent = await outputsSentFor((wallet) =>
    wallet.issueDepin({ assetName: "&SENSOR", quantity: amountFromInput("1000", true), reissuable: true, broadcast: false }));

  expect(sent).toContain('"asset_quantity":1000,');
});

test("a root issue quantity keeps every digit, beyond what a JavaScript number carries", async () => {
  const sent = await outputsSentFor((wallet) =>
    wallet.issueRoot({ assetName: "ROOTX", quantity: amountFromInput("9876543210.12345678", true), units: 8, reissuable: true, broadcast: false }));

  expect(sent).toContain('"asset_quantity":9876543210.12345678,');
});
