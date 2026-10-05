# Changelog

## 1.3.0 — 2026-10-01

### Added: Privacy Pool (testnet)

- **Privacy page.** Deposit XNA into the experimental C3 testnet pool, assign all or part of a private note to another person, and withdraw a note to a transparent Legacy address. Proofs are built on the device, and every transaction is shown for review before it is published.
- **Private wallet from the recovery words.** **Open private wallet** derives the private wallet from the open wallet's words, with an optional ZK passphrase and account number. It needs no extra backup, and an 8-character check confirms that the same wallet was opened.
- **Private receiving addresses.** Payments are received at `tnzk1…` addresses that rotate after use. The address sits second in the private wallet card, right under the balance, printed large enough to read and check. The panel can copy it, step **back** to the previous unused address or **forward** to a new one — stepping back stops at the last address that received a note, so one is never handed out twice — list used addresses with the amounts received, and set the recovery gap.
- **Assign to an address.** A private assignment accepts a `tnzk1…` address or a JSON recipient descriptor.
- **Encrypted JSON identity.** Wallets opened without their words can create or load a private identity kept in an encrypted JSON file.
- **Total held by the pool.** The private balance card also shows how much XNA the whole pool holds across all wallets, read from the pool's reserve output in the same scan that recovers the notes.
- **Faster reopening.** The wallet keeps an encrypted scan checkpoint in the browser, so reopening it only reads new pool activity.
- **A deposit says which of its two steps is open.** The pool spends a coin worth exactly the deposit, so one has to be published and confirmed before the proof can be built. The panel reads the wallet's coins and keeps **Build and verify proof** shut until that coin is confirmed and a separate coin can pay the fee, naming whichever is missing. Each round says when its transaction is pending in the mempool and closes its own button, instead of looking ready to run again, and checks for the confirmation every few seconds. When the note's block lands, the notes are read again on their own, the spent coin disappears and the deposit is back at its first step. No other pool operation can start while a published one is unconfirmed, since the node would refuse it anyway. The two rounds are lettered A and B, and **Review and publish** now opens under the round that prepared it instead of in a band below both columns, so a deposit reads straight down: prepare, review, publish, wait, build, review, publish.
- **Safe publication.** If the node's reply is lost while publishing, the transaction ID is kept and **Check transaction status** tells whether it is confirmed, pending or can be retried.
- **Progress and cancellation.** Every operation shows its phase and elapsed time; a running proof can be cancelled, which locks the private wallet.
- **Benchmark lab.** **Open benchmark** measures the six pool circuits and the cryptographic primitives on the device, without using wallet keys.
- **Proving parameters installer.** `npm run privacy:install` copies and verifies the public proving parameters for a deployment.

The pool runs on the `@neuraiproject/neurai-privacy` package and needs a Testnet Legacy wallet and an RPC node with `-txindex` and `-spentindex`. See [PRIVACY-TESTNET.md](PRIVACY-TESTNET.md).

- **The sign-in page names the Privacy Pool.** Its panel of what the wallet does now lists the pool beside self-custody, assets and DePIN, with the icon the menu uses for it.

### Changed: the privacy library comes from npm

- **`@neuraiproject/neurai-privacy` 0.1.2 is installed from the registry**, pinned to that exact version, instead of from a local archive under `tmp/`. The published tarball is byte-identical to the reviewed one (SHA-256 `e1aa49beeb0666a81b29d3689067015f5352670aac6755b7c779ad09eb88e91d`), so a fresh checkout installs the same library without carrying the file.

### Changed: choosing a network on the sign-in page

- **Network and address type are now two questions.** The single drop-down listed every chain and address type together. The card now asks for the network first — **Mainnet**, the official network with real funds, or **Testnet**, where coins have no value — and then for the address type.
- **The address type is a list that stays shut.** Only the chosen type is on screen; pressing it opens the other two over the form, and picking one closes it again. Mainnet offers **Legacy** and marks **ECDSA** and **PQ** as *soon*, since the node does not protect them there yet; testnet offers all three and opens on **ECDSA**. Every entry says what it is and shows an example address for the chosen network, its opening characters in bold — `N`, `nq1r` and `pq1z` on mainnet, `t`, `tnq1r` and `tpq1z` on testnet — cut at the end when it does not fit.
- **The card is in two halves.** A rule separates the network being opened from the wallet being opened on it. **Recover** and **Create new**, and the 12 / 24 word choice, are quieter tabs rather than filled buttons, so **Sign in** is the only thing on the card that looks like an action.
- **The old web wallet's derivation is a recovery option.** Wallets made in the previous web wallet sit on a different derivation of the same Mainnet Legacy addresses, so it is now a checkbox beside the recovery words under **Recover**, instead of a separate entry in the network list. A new wallet can no longer be created on it.
