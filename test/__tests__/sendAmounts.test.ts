jest.mock("@yudiel/react-qr-scanner", () => ({ Scanner: () => null }));
jest.mock("../../src/betterDialog", () => ({
  betterConfirm: jest.fn(), betterAlert: jest.fn(), betterToast: jest.fn(),
}));
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { send } from "../../src/Send";
import { betterAlert, betterConfirm } from "../../src/betterDialog";

const confirm = jest.mocked(betterConfirm);
beforeEach(() => jest.clearAllMocks());

test("send preserves the last raw unit through build and confirmation; cancellation never broadcasts", async () => {
  const createTransaction = jest.fn().mockResolvedValue({ debug: {
    amount: "100000000.00000001", fee: "0.00000001", signedTransaction: "signed",
  } });
  const sendRawTransaction = jest.fn();
  const wallet = { baseCurrency: "XNA", createTransaction, sendRawTransaction } as unknown as Wallet;
  confirm.mockResolvedValue(false);
  await send({ wallet, to: "recipient", asset: "XNA", amount: "100000000.00000001", clearForm: jest.fn() });
  expect(createTransaction).toHaveBeenCalledWith({
    toAddress: "recipient", assetName: "XNA", amount: "100000000.00000001",
  });
  expect(confirm.mock.calls[0][1]).toContain("100000000.00000001");
  expect(confirm.mock.calls[0][1]).toContain("0.00000001");
  expect(sendRawTransaction).not.toHaveBeenCalled();
});

test("sendMax uses the exact amount computed by the published wallet", async () => {
  const wallet = {
    baseCurrency: "XNA",
    createTransaction: jest.fn().mockResolvedValue({ debug: {
      amount: "105552176.16498301", fee: "0.00001234", signedTransaction: "signed",
    } }),
    sendRawTransaction: jest.fn(),
  };
  confirm.mockResolvedValue(false);
  await send({ wallet: wallet as unknown as Wallet, to: "recipient", asset: "XNA", amount: "", sendMax: true, clearForm: jest.fn() });
  expect(wallet.createTransaction).toHaveBeenCalledWith({ toAddress: "recipient", assetName: "XNA", sendMax: true });
  expect(confirm.mock.calls[0][1]).toContain("105552176.16498301");
});

test.each([
  'xna', 'xna-legacy', 'xna-pq', 'xna-pq-strict', 'xna-ecdsa',
  'xna-test', 'xna-legacy-test', 'xna-pq-test', 'xna-pq-strict-test', 'xna-ecdsa-test',
])("confirmation identifies real funds from wallet network %s", async network => {
  const wallet = {
    network, baseCurrency: 'XNA',
    createTransaction: jest.fn().mockResolvedValue({debug:{amount:'1500',fee:'0.00362323',signedTransaction:'signed'}}),
    sendRawTransaction: jest.fn(),
  };
  confirm.mockResolvedValue(false);
  await send({wallet:wallet as unknown as Wallet,to:'recipient',asset:'XNA',amount:'1500',clearForm:jest.fn()});
  const options=confirm.mock.calls[0][2];
  if (network.endsWith('-test')) expect(options).toEqual({confirmLabel: 'Send'});
  else {
    expect(options?.warning?.title).toBe('MAINNET - REAL FUNDS');
    expect(options?.confirmLabel).toBe('Send');
  }
  expect(wallet.sendRawTransaction).not.toHaveBeenCalled();
});

describe("DePIN transfers", () => {
  const depinWallet = (ownerUtxos: unknown[], transferState = "closed") => ({
    network: "xna-ecdsa-test", baseCurrency: "XNA",
    getAssetUTXOs: jest.fn().mockResolvedValue(ownerUtxos),
    rpc: jest.fn().mockResolvedValue({ name: "&CHAT", transfer_state: transferState }),
    transferAsset: jest.fn().mockResolvedValue({ fee: 0.0123, signedTransaction: "escorted" }),
    createTransaction: jest.fn().mockResolvedValue({ debug: { amount: "5", fee: "0.01", signedTransaction: "plain" } }),
    sendRawTransaction: jest.fn(),
  });
  const ownerUtxo = { assetName: "&CHAT!", txid: "a".repeat(64), outputIndex: 2 };

  test("the owner's transfer spends and returns the owner token", async () => {
    const wallet = depinWallet([ownerUtxo]);
    const clearForm = jest.fn();
    confirm.mockResolvedValue(true);
    await send({ wallet: wallet as unknown as Wallet, to: "recipient", asset: "&CHAT", amount: "5", clearForm });
    expect(wallet.getAssetUTXOs).toHaveBeenCalledWith("&CHAT!");
    expect(wallet.transferAsset).toHaveBeenCalledWith({
      assetName: "&CHAT", recipients: [{ address: "recipient", amount: "5" }], broadcast: false,
    });
    expect(wallet.createTransaction).not.toHaveBeenCalled();
    expect(confirm.mock.calls[0][1]).toContain("0.0123");
    expect(confirm.mock.calls[0][1]).toContain("&CHAT!");
    expect(wallet.sendRawTransaction).toHaveBeenCalledWith("escorted");
    expect(clearForm).toHaveBeenCalled();
  });

  test("without the owner token a closed asset is refused before building", async () => {
    const wallet = depinWallet([]);
    await send({ wallet: wallet as unknown as Wallet, to: "recipient", asset: "&CHAT", amount: "5", clearForm: jest.fn() });
    expect(wallet.rpc).toHaveBeenCalledWith("getassetdata", ["&CHAT"]);
    expect(jest.mocked(betterAlert).mock.calls[0][1]).toContain("only the wallet holding &CHAT! can send it");
    expect(wallet.transferAsset).not.toHaveBeenCalled();
    expect(wallet.createTransaction).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("without the owner token an open asset is a plain holder transfer", async () => {
    const wallet = depinWallet([], "open");
    confirm.mockResolvedValue(false);
    await send({ wallet: wallet as unknown as Wallet, to: "recipient", asset: "&CHAT", amount: "5", clearForm: jest.fn() });
    expect(wallet.createTransaction).toHaveBeenCalledWith({ toAddress: "recipient", assetName: "&CHAT", amount: "5" });
    expect(wallet.transferAsset).not.toHaveBeenCalled();
    expect(confirm.mock.calls[0][1]).not.toContain("owner token");
  });

  test("Coin Control cannot drop the owner token from the owner's transfer", async () => {
    const wallet = depinWallet([ownerUtxo]);
    await send({
      wallet: wallet as unknown as Wallet, to: "recipient", asset: "&CHAT", amount: "5", clearForm: jest.fn(),
      selectedUtxos: [{ assetName: "&CHAT" } as never],
    });
    expect(jest.mocked(betterAlert).mock.calls[0][1]).toContain("Coin Control cannot be used for &CHAT");
    expect(wallet.transferAsset).not.toHaveBeenCalled();
  });

  test("the owner token itself is sent as an ordinary asset", async () => {
    const wallet = depinWallet([ownerUtxo]);
    confirm.mockResolvedValue(false);
    await send({ wallet: wallet as unknown as Wallet, to: "recipient", asset: "&CHAT!", amount: "1", clearForm: jest.fn() });
    expect(wallet.getAssetUTXOs).not.toHaveBeenCalled();
    expect(wallet.createTransaction).toHaveBeenCalledWith({ toAddress: "recipient", assetName: "&CHAT!", amount: "1" });
  });
});
