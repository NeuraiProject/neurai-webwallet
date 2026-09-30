# Privacy Pool: manual testnet tests

The Privacy page works with the experimental C3 instance on XNA: deposit, note assignment and withdrawal. The benchmark is behind **Open benchmark**. Proving, note encryption and signing of the funding inputs run in the browser, without Python or a remote ZK proving service.

This uses the current **TEST** public keys, synthetic domain and C3 contract. It does not certify security for funds of value. This integration does not include assets, strict PQ/ECDSA sponsors or note merging.

## Required public files

The six circuits use public WASM, Groth16 parameters and verification keys. The pinned list with sizes and SHA-256 is `C3_TESTNET_ARTIFACTS` in `@neuraiproject/neurai-privacy/client`. The browser checks both before computing a proof. Each key is about 35–111 MiB; that is not the RAM needed for proving.

Install them from the C3 benchmark package, keeping its `artifacts/` directory:

```sh
npm run privacy:install -- "$C3_ARTIFACTS_DIR"
```

The default target is `dist/privacy-c3/`. Parcel and any static server of `dist/` must serve `/privacy-c3/artifacts/...`. If `dist` is cleaned, repeat the installation. A second argument sets another target directory. The installer checks all 30 files before use; the large binaries stay out of Git. No code is downloaded from a private proving server.

WebCrypto needs HTTPS or localhost. A phone that opens an IP address over HTTP does not necessarily get a secure context. The web server must serve `.wasm`, `.zkey` and `.json`. Workers are bundled whole: Parcel's shared bundles are disabled after a missing SHA-256 module was reproduced in the optimized app.

## Manual walkthrough

1. Open a **testnet Legacy** wallet with TEST XNA. The network is also checked against the expected genesis over RPC.
2. In Privacy, press **Open private wallet**. The private wallet is derived from the open wallet's words and passphrase, an optional **ZK passphrase** and an account number, following the NeuraiZK/v1 draft described in the neurai-privacy README. There is no file to save: the same words, passphrase, ZK passphrase and account always recover the same wallet. An 8-character check such as `ce62fe35` is shown; it must match when reopened. A mistyped ZK passphrase opens a different, empty wallet. If the wallet was opened without its words, use **Use an encrypted backup file instead**: create an identity with a password of at least 12 characters or load its encrypted JSON, and **save the JSON before depositing**.
3. Press **Refresh notes**; it runs automatically after deriving the wallet. The browser rebuilds the confirmed state and decrypts the notes that belong to the open identity. Keys and the private witness are never sent to the RPC.
4. To deposit, enter the amount of TEST XNA. There is no fixed limit per deposit beyond the XNA money range. The contract needs a coin of the exact amount and a separate coin for the fee. **Prepare deposit coin** builds, for review, a transaction to the wallet itself; wait for its confirmation before building the deposit. If no second coin is left for the fee, fund the wallet with another normal transfer.
5. **Build and verify proof** reads the current state, prepares the note and witness, proves with one thread, verifies the proof, signs the funding locally and calls `testmempoolaccept`. It does not publish yet.
6. Review amount, fee and identifier. **Publish TEST transaction** rechecks inputs and admission before broadcasting. Confirmation is not immediate; an explorer link is shown.
7. To receive, share the `tnzk1…` address from **Receive privately**. After a note arrives and the notes are refreshed, a new address appears; older addresses stay valid. **New address** hands out another one before the current one is used. To assign, select a note and paste the other person's `tnzk1…` address or JSON descriptor. A note is created for them and, if value remains, another for the sender at their change address. The address is public; never share the ZK passphrase, the encrypted JSON or its password.
8. To withdraw, select a note and a testnet Legacy address. The whole note is withdrawn. To withdraw part of it, first split it by assigning to your own address and withdraw the smaller note.
9. In another browser, open the same wallet with its words and press **Open private wallet** with the same ZK passphrase and account. The balance is rebuilt from the chain, trying addresses until 20 unused ones in a row are found; the limit is set in **Recovery settings**. With a file identity, load the JSON and its password. An address can receive, but it cannot recover secrets.

Each address has its own keys, so a full scan tries to decrypt every pool record with every candidate address, about 4 ms per attempt on a desktop computer. A wallet opened from its words keeps an encrypted scan checkpoint in this browser's IndexedDB. Later refreshes, and reopening the wallet, resume from the saved block and only process newer pool operations. The worker encrypts the checkpoint with a key derived from the private wallet; the page only stores the ciphertext. Clearing the site data removes it, and the next scan starts again from the pool birth. A file identity scans from the pool birth each time it is opened.

The fee comes from the transparent wallet and is visible. Deposits and withdrawals also reveal amounts; these trials do not remove those hints or network metadata. Several wallets share the same state UTXO: if another operation spends it, refresh and rebuild the proof. The interface does not spend again automatically.

## Progress, cancellation and uncertain publication

Every operation shows its phase and elapsed time. During proving there is no invented percentage: the indicator stays animated and the timer advances. The interface stays responsive because the work runs in a worker. Cancelling terminates it and locks the identity; open the private wallet again, or load the JSON again for a file identity. If the worker crashes, the panel locks the same way and the next operation starts a new worker.

Once publication has started, cancelling a computation can no longer undo the broadcast. If the RPC takes too long, the txid is kept and a different operation is blocked. **Check transaction status** queries the transaction; it only allows retrying the same bytes if the node still sees its inputs available and accepts that same transaction.

## Benchmark

Choose D0, D1, T1, T2, W_partial or W_full and press **Run C3 benchmark**. It uses public synthetic data, one thread and the same pinned C3 parameters. The exported JSON includes timings, proof and public inputs so it can be checked against C++. Advanced mode keeps the manual selection of four compatible TEST files.

The benchmark does not move coins. Its proving times exclude history recovery, coin selection, signing, RPC, block inclusion and real RAM use. The initial primitives test is still available. Do not run two heavy proofs at the same time on a phone.

## RPC and integration tests

A trusted testnet RPC can be set in Settings. It must allow block, transaction and UTXO reads, `getspentinfo`, `validateaddress`, `decoderawtransaction`, `testmempoolaccept`, `sendrawtransaction` and the methods the wallet already uses for funding. The node must run with `-txindex` and `-spentindex`, besides the indexes the wallet already needs. Do not expose an unlocked node wallet to the browser or enable key export.

**Refresh notes** follows the pool state UTXO from its birth with `getspentinfo`: a few calls per pool operation, without walking empty blocks. Each step checks that the transaction is confirmed on the active chain and spends the previous state; at the end those blocks are checked again to detect a reorganization. If the node lacks `-spentindex`, recovery stops with an explicit error. A new block during a refresh no longer forces a restart.

The real browser trial funds temporary addresses generated in the browser itself; the node wallet keeps its keys. The pages in `test/browser/` are separate entries for review in Docker and are not linked from `public/index.html`. Do not include them in an application deployment.

## The neurai-privacy library

All pool logic comes from the `@neuraiproject/neurai-privacy` package: identities, nzk addresses, scanning, proving, transaction building, RPC checks and publication. The webwallet adds the interface, the transparent signing of funding inputs and the proving worker entry `src/privacy-pool/Pool.worker.ts`, which only starts the library worker with snarkjs.

The package is pinned to an exact version. To update it, change the version in `package.json`, run `yarn install`, and repeat the tests and the browser review. Stop Parcel and delete `.parcel-cache` before `npm start`; a stale cache can serve an old module map and leave the page blank.
