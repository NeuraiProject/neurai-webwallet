/**
 * NIP-040 asset marker regression.
 *
 * The chain switched the 3-byte asset payload marker from `rvn` to `xna`.
 * Testnet activated it (the node reports `getblockchaininfo.asset_marker`),
 * mainnet has not. Building with the wrong one is not a warning: the node
 * rejects the transaction outright.
 *
 * jswallet >= 0.15 resolves the marker per build by asking the node, so the
 * app needs no code for it — which is exactly why this needs a test. The
 * failure modes are silent and both are regressions of configuration, not of
 * logic: pinning `assetMarker` in the wallet options would freeze the marker,
 * and downgrading jswallet would drop the lookup altogether. Either way asset
 * operations stop working on one chain and nothing in the app would say so.
 *
 * The cryptography and the wire format belong to jswallet's own suite. What is
 * pinned here is the app's contract with it: ask the node, use the answer.
 */

// Required through CJS on purpose: the test runs under ts-jest in CommonJS,
// and jswallet publishes a `require` condition for exactly this case.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NeuraiWallet = require('@neuraiproject/neurai-jswallet');

const MNEMONIC = 'salad hammer want used web finger comic gold trigger accident oblige pluck';

/**
 * First address of MNEMONIC on xna-test, with its scripts. To regenerate:
 * derive the address with `createInstance({ mnemonic, network: 'xna-test',
 * offlineMode: true })`, then build a payment and a standard asset transfer to
 * it with `@neuraiproject/neurai-create-transaction` and take the first
 * output's scriptPubKey of each.
 */
const ADDRESS = 'tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3';
const P2PKH_SCRIPT = '76a9144ab18a6ba19a04c871eb96e9171c2669260e87fd88ac';
/** A pre-NIP-040 asset UTXO: note the input itself carries the legacy `rvn`. */
const ASSET_SCRIPT =
  '76a9144ab18a6ba19a04c871eb96e9171c2669260e87fd88acc01672766e74095445535441535345540065cd1d0000000075';

const MARKER_RVN = '72766e';
const MARKER_XNA = '786e61';


type StubRpc = ((method: string, params?: unknown[]) => Promise<unknown>) & {
  calls: Record<string, number>;
};

/**
 * Deterministic node stub. Throws on any method it does not know, so an
 * unexpected lookup fails loudly instead of silently returning undefined.
 */
function makeStubRpc(blockchainInfo: Record<string, unknown>): StubRpc {
  const calls: Record<string, number> = {};
  const rpc = (async (method: string, params: unknown[] = []) => {
    calls[method] = (calls[method] ?? 0) + 1;
    switch (method) {
      case 'getblockchaininfo':
        return blockchainInfo;
      case 'getaddressmempool':
        return [];
      case 'estimatesmartfee':
        return { feerate: 0.05 };
      case 'getaddressutxos': {
        const query = (params[0] ?? {}) as { assetName?: string };
        const base = {
          address: ADDRESS,
          height: 100,
          outputIndex: 0,
        };
        if (query.assetName) {
          return [
            {
              ...base,
              assetName: 'TESTASSET',
              txid: 'dd'.repeat(32),
              outputIndex: 1,
              script: ASSET_SCRIPT,
              satoshis: 500000000,
              value: 5,
            },
          ];
        }
        return [
          {
            ...base,
            assetName: 'XNA',
            txid: 'cc'.repeat(32),
            script: P2PKH_SCRIPT,
            satoshis: 1000000000,
            value: 10,
          },
        ];
      }
      default:
        throw new Error(`Unexpected RPC method in stub: ${method}`);
    }
  }) as StubRpc;
  rpc.calls = calls;
  return rpc;
}

/**
 * First address of an unrelated mnemonic ("legal winner thank year wave sausage
 * worth useful legal winner thank yellow") on xna-test. It has to be external:
 * one of the wallet's own addresses collides with the change address.
 */
const RECIPIENT = 'tJEy5RHfmXnGhoj4PhkdDC9YDsdQ6JtmXy';

async function walletWithStub(blockchainInfo: Record<string, unknown>, options: Record<string, unknown> = {}) {
  const wallet = await NeuraiWallet.createInstance({
    mnemonic: MNEMONIC,
    network: 'xna-test',
    offlineMode: true,
    ...options,
  });
  const rpc = makeStubRpc(blockchainInfo);
  wallet.rpc = rpc;
  return { wallet, rpc };
}

async function assetSendRaw(blockchainInfo: Record<string, unknown>) {
  const { wallet, rpc } = await walletWithStub(blockchainInfo);
  const res = await wallet.createTransaction({
    toAddress: RECIPIENT,
    amount: 1,
    assetName: 'TESTASSET',
  });
  return { raw: res.debug.rawUnsignedTransaction as string, rpc, wallet };
}

describe('NIP-040 asset marker', () => {
  it('derives the fixture address from the fixture mnemonic', async () => {
    // Guards the fixtures above: if derivation changed, the scripts below would
    // belong to some other address and the rest of this file would be nonsense.
    const { wallet } = await walletWithStub({ asset_marker: 'xna' });
    expect(wallet.getAddresses()[0]).toBe(ADDRESS);
  });

  it("stamps the node's `xna` on an asset send, spending a legacy `rvn` input", async () => {
    const { raw, rpc } = await assetSendRaw({ asset_marker: 'xna' });

    expect(raw).toContain(MARKER_XNA);
    // The input it spends is a legacy `rvn` output, and it must not leak into
    // what is built: the marker comes from the chain's current rule, not from
    // whatever the coins happened to be wrapped in.
    expect(raw).not.toContain(MARKER_RVN);
    expect(rpc.calls.getblockchaininfo).toBe(1);
  });

  it('keeps legacy `rvn` when the node does not report the field', async () => {
    // Mainnet today: an older node with no `asset_marker`. Resolving to `xna`
    // here would break every asset operation on that chain.
    const { raw } = await assetSendRaw({ chain: 'main' });

    expect(raw).toContain(MARKER_RVN);
    expect(raw).not.toContain(MARKER_XNA);
  });

  it('asks the node on every build: there is no cached marker', async () => {
    const { wallet, rpc } = await walletWithStub({ asset_marker: 'xna' });
    const send = () =>
      wallet.createTransaction({ toAddress: RECIPIENT, amount: 1, assetName: 'TESTASSET' });

    await send();
    await send();

    // A cache would survive the activation crossover and start signing invalid
    // transactions the moment the chain switched.
    expect(rpc.calls.getblockchaininfo).toBe(2);
  });

  it('the app must not pin a marker: resolution stays automatic', async () => {
    // The app builds its wallet from mnemonic + network + rpc_url and nothing
    // else. Adding `assetMarker` would silently defeat everything above, so the
    // absence of that option is the contract being pinned here.
    const { wallet } = await walletWithStub({ asset_marker: 'xna' });
    expect(wallet.assetMarker).toBeUndefined();
  });

  it('an explicit override is honoured, and that is why the app sets none', async () => {
    // Shows the override works — so a failure of the test above would mean a
    // real behaviour change, not a missing feature.
    const { wallet, rpc } = await walletWithStub({ asset_marker: 'xna' }, { assetMarker: 'rvn' });
    const res = await wallet.createTransaction({
      toAddress: RECIPIENT,
      amount: 1,
      assetName: 'TESTASSET',
    });

    expect(res.debug.rawUnsignedTransaction).toContain(MARKER_RVN);
    expect(rpc.calls.getblockchaininfo).toBeUndefined();
  });
});
