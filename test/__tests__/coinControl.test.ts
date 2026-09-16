const Wallet: typeof import('@neuraiproject/neurai-jswallet').Wallet = require('@neuraiproject/neurai-jswallet');
import { createCoinControlledTransaction, loadCoinUtxos, selectedTotal, utxoId, type CoinUtxo } from '@/coinControlWallet';
import { parseTransaction } from '@neuraiproject/neurai-create-transaction';
import { decimalToSatoshis } from '@/exactAmounts';
const address = 'tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3';
const recipient = 'tJEy5RHfmXnGhoj4PhkdDC9YDsdQ6JtmXy';
function coin(id: string, raw: string): CoinUtxo {
  return { txid: id.repeat(64), outputIndex: 0, address, assetName: 'XNA',
    script: '76a9144ab18a6ba19a04c871eb96e9171c2669260e87fd88ac', satoshis: raw, value: 0, height: 100 };
}
async function setup(coins = [coin('a','100000000'), coin('b','200000000'), coin('c','10000000000000000')]) {
  const wallet = await Wallet.createInstance({ mnemonic: 'salad hammer want used web finger comic gold trigger accident oblige pluck', network: 'xna-test', offlineMode: true });
  wallet.getUTXOs = jest.fn(async () => coins);
  wallet.getAssetUTXOs = jest.fn(async () => []);
  wallet.getMempool = jest.fn(async () => []);
  wallet.getUTXOsInMempool = jest.fn(async () => []);
  wallet.rpc = jest.fn(async (method: string) => {
    if (method === 'estimatesmartfee') return {feerate: 0.05};
    if (method === 'getblockchaininfo') return {chain:'regtest',asset_marker:'rvn'};
    throw Error('Unexpected RPC '+method);
  }) as typeof wallet.rpc;
  return {wallet, coins};
}

test('selected totals keep each raw unit above the safe integer limit', () => {
  expect(selectedTotal([coin('a','10000000000000001'),coin('b','1')], 'XNA')).toBe('100000000.00000002');
});

test('real builder spends every selected input and no other input', async () => {
  const {wallet,coins} = await setup();
  const result = await createCoinControlledTransaction(wallet, {toAddress:recipient,amount:'0.5'}, coins.slice(0,2));
  expect(parseTransaction(result.debug.signedTransaction!).inputs.map(i=>`${i.txid}:${i.vout}`).sort()).toEqual(coins.slice(0,2).map(utxoId).sort());
  expect(await wallet.getUTXOs()).toHaveLength(3);
});

test('insufficient selected funds cannot fall back to an unselected rich UTXO', async () => {
  const {wallet,coins} = await setup();
  await expect(createCoinControlledTransaction(wallet, {toAddress:recipient,amount:'5'}, [coins[0]])).rejects.toThrow();
});

test('sendMax drains only the selected amount minus the fee', async () => {
  const {wallet,coins} = await setup();
  const result = await createCoinControlledTransaction(wallet, {toAddress:recipient,sendMax:true}, coins.slice(0,2));
  const tx = parseTransaction(result.debug.signedTransaction!);
  expect(tx.inputs).toHaveLength(2);
  expect(tx.outputs).toHaveLength(1);
  expect(tx.outputs[0].valueSats + decimalToSatoshis(result.debug.fee)).toBe(300000000n);
});

test('a UTXO spent since selection is rejected before building', async () => {
  const {wallet,coins} = await setup();
  wallet.getMempool = jest.fn(async () => [{prevtxid:coins[0].txid,prevout:0}]) as typeof wallet.getMempool;
  await expect(createCoinControlledTransaction(wallet, {toAddress:recipient,amount:'0.5'}, [coins[0]])).rejects.toThrow('no longer available');
});

test('available list deduplicates outpoints and excludes spent and foreign outputs', async () => {
  const {wallet,coins} = await setup();
  wallet.getUTXOsInMempool = jest.fn(async () => [coins[1],{...coin('d','1'),address:'foreign'}]);
  wallet.getMempool = jest.fn(async () => [{prevtxid:coins[0].txid,prevout:0}]) as typeof wallet.getMempool;
  expect((await loadCoinUtxos(wallet)).map(utxoId)).toEqual(coins.slice(1).map(utxoId));
});

test('asset transfer uses only selected asset outputs and selected XNA for fees', async () => {
  const {wallet,coins} = await setup();
  const token = {...coin('d','500000000'), assetName:'TESTASSET', value:5,
    script:'76a9144ab18a6ba19a04c871eb96e9171c2669260e87fd88acc01672766e74095445535441535345540065cd1d0000000075'};
  wallet.getAssetUTXOs = jest.fn(async () => [token]);
  await expect(createCoinControlledTransaction(wallet,{toAddress:recipient,assetName:'TESTASSET',amount:'1'},[token])).rejects.toThrow();
  const result = await createCoinControlledTransaction(wallet,{toAddress:recipient,assetName:'TESTASSET',amount:'1'},[token,coins[0]]);
  expect(parseTransaction(result.debug.signedTransaction!).inputs.map(i=>`${i.txid}:${i.vout}`).sort()).toEqual([utxoId(token),utxoId(coins[0])].sort());
});
