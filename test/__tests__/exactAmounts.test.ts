import {addAmounts,displayRaw,decimalToSatoshis} from '../../src/exactAmounts';
import {getAssetBalanceFromMempool,getAssetBalanceIncludingMempool} from '../../src/utils';
import {formatNumberWith8Decimals} from '../../src/formatNumberWith8Decimals';
test('large display balances and their mempool deltas retain the last unit',()=>{
 expect(addAmounts('100000000.00000001',-1)).toBe('99999999.00000001');
 expect(getAssetBalanceFromMempool('XNA',[{assetName:'XNA',satoshis:'10000000000000001'}])).toBe('100000000.00000001');
 expect(decimalToSatoshis(displayRaw(9007199254740991n))).toBe(9007199254740991n);
});
test('asset mempool entries are counted once each with exact raw units',()=>{
 const value=getAssetBalanceIncludingMempool({baseCurrency:'XNA'} as any,[{assetName:'TOKEN',balance:'10000000000000000'}],[{assetName:'TOKEN',satoshis:'1'},{assetName:'TOKEN',satoshis:'1'}]);
 expect(value.TOKEN).toBe('100000000.00000002');
});
test('confirmation formatting retains eight decimals for large text amounts',()=>{
 const formatted=formatNumberWith8Decimals('105552176.16498301');
 expect(formatted).toContain('16498301');
});

import {amountFromInput} from "../../src/exactAmounts";
import {pickForcedUtxosForAmount} from "../../src/utils/utxoUtils";
import {describeOutputs} from "../../src/AssetTxConfirm";
import {deriveWalletHistory} from "../../src/home/useWalletHistory";

test("amount inputs accept the monetary limit and reject excess precision or range", () => {
  expect(decimalToSatoshis(amountFromInput("21000000000"))).toBe(2100000000000000000n);
  expect(() => amountFromInput("21000000000.00000001")).toThrow();
  expect(() => amountFromInput("100000000.000000001")).toThrow();
  expect(() => amountFromInput("1e8")).toThrow();
  expect(() => amountFromInput("0")).toThrow();
});

test("DePIN UTXO selection preserves raw string amounts and refuses rounded numbers", () => {
  const selected = pickForcedUtxosForAmount([
    { satoshis: "10000000000000001" }, { value: "0.00000001" },
  ], "10000000000000002");
  expect(selected.sumSats).toBe(10000000000000002n);
  expect(selected.picked).toHaveLength(2);
  expect(() => pickForcedUtxosForAmount([{satoshis: 10000000000000000}], 1)).toThrow();
});

test("asset confirmation reads exact change, issue and transfer amounts from real RPC output shapes", () => {
  expect(describeOutputs([
    { change: "105552176.16498301" },
    { recipient: { issue: { asset_name: "TOKEN", asset_quantity: "100000000.00000001" } } },
    { recipient: { transfer: { TOKEN: "100000000.00000002" } } },
  ])).toEqual([
    { address: "change", amount: "105552176.16498301" },
    { address: "recipient", assetName: "TOKEN", amount: "100000000.00000001" },
    { address: "recipient", assetName: "TOKEN", amount: "100000000.00000002" },
  ]);
});

test("published history library and home view retain large fractional movements", () => {
  const {activity} = deriveWalletHistory([
    {txid: "large", address: "mine", assetName: "XNA", satoshis: "10000000000000001", height: 1},
  ], "XNA");
  expect(activity[0].value).toBe("100000000.00000001");
  expect(activity[0].outgoing).toBe(false);
});
