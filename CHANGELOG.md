# Changelog

## Unreleased

### Added: Privacy Pool (testnet)

- **Privacy page.** Deposit XNA into the experimental C3 testnet pool, assign all or part of a private note to another person, and withdraw a note to a transparent Legacy address. Proofs are built on the device, and every transaction is shown for review before it is published.
- **Private wallet from the recovery words.** **Open private wallet** derives the private wallet from the open wallet's words, with an optional ZK passphrase and account number. It needs no extra backup, and an 8-character check confirms that the same wallet was opened.
- **Private receiving addresses.** Payments are received at `tnzk1…` addresses that rotate after use. The panel can copy the current address, create a new one, list used addresses with the amounts received, and set the recovery gap.
- **Assign to an address.** A private assignment accepts a `tnzk1…` address or a JSON recipient descriptor.
- **Encrypted JSON identity.** Wallets opened without their words can create or load a private identity kept in an encrypted JSON file.
- **Faster reopening.** The wallet keeps an encrypted scan checkpoint in the browser, so reopening it only reads new pool activity.
- **Safe publication.** If the node's reply is lost while publishing, the transaction ID is kept and **Check transaction status** tells whether it is confirmed, pending or can be retried.
- **Progress and cancellation.** Every operation shows its phase and elapsed time; a running proof can be cancelled, which locks the private wallet.
- **Benchmark lab.** **Open benchmark** measures the six pool circuits and the cryptographic primitives on the device, without using wallet keys.
- **Proving parameters installer.** `npm run privacy:install` copies and verifies the public proving parameters for a deployment.

The pool runs on the `@neuraiproject/neurai-privacy` package and needs a Testnet Legacy wallet and an RPC node with `-txindex` and `-spentindex`. See [PRIVACY-TESTNET.md](PRIVACY-TESTNET.md).
