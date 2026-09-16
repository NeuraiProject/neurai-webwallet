jest.mock("@yudiel/react-qr-scanner", () => ({ Scanner: () => null }));
jest.mock("../../src/betterDialog", () => ({
  betterConfirm: jest.fn(), betterAlert: jest.fn(), betterToast: jest.fn(),
}));
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { send } from "../../src/Send";
import { betterConfirm } from "../../src/betterDialog";

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
