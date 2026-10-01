# Privacy Pool: manual testnet tests

The Privacy page works with the experimental C4 instance on XNA: deposit, note assignment and withdrawal. The benchmark is behind **Open benchmark**. Proving, note encryption and signing of the funding inputs run in the browser, without Python or a remote ZK proving service.

This uses public **TEST** proving parameters and an issuance-derived instance domain. It does not certify security for funds of value. C4 supports Legacy, strict PQ and strict ECDSA funding/sponsors/withdrawals, and up to four created notes per assignment **including change**. This instance is XNA only; assets, note merging and a production ceremony are not implemented here.

C4 is the only supported pool profile. There is no previous-pool selector or fallback worker. Older notes are not migrated by changing the library. Mainnet operations remain disabled.

The public C4 instance is pinned in `src/privacy-pool/c4-testnet.json`:

- UNIQUE: `C4TESTX260930A#POOL`.
- Pool address: `tnc1p5cn7433mpqt6h6wswkzxjr2tgxpjtmgqmuy0tuvw9tq2kk8lttjqxvdz4w`.
- Birth transaction: `6985d9a0e71cfec44b4effd86f72b08d79191bfdb14fd5238d187390f021aac2` (height 11540).

Use **Deposit** to create a private note. Sending an ordinary transfer directly to the contract address does not create a recoverable private note.

## Required public files

The eight C4 circuits (D0, D1, T1–T4, W_partial, W_full) use pinned public WASM, Groth16 proving parameters and verification keys. `src/privacy-pool/c4-testnet.json` fixes their exact sizes and SHA-256 hashes as well as the contract commitment and genesis. These values are bundled; they are not accepted from RPC. The worker verifies downloads before using them and runs one proving thread. T4 needs a parameter file of about 193 MiB, so the worker allows up to 256 MiB per artifact. File size is not peak RAM. All 24 public files together are about 691 MiB.

This working tree deliberately uses the compiled local C4 library package, without publishing it to npm:

```sh
npm install
npm run privacy:install -- "$C4_ARTIFACTS_DIR"
npm run start:testnet
```

`package.json` depends on `@neuraiproject/neurai-privacy` **0.1.2** from npm, pinned to that exact version. It is the same build that was reviewed locally: the published archive has SHA-256 `e1aa49beeb0666a81b29d3689067015f5352670aac6755b7c779ad09eb88e91d`, and `yarn.lock` records its integrity, so any checkout installs the reviewed revision without having to carry the archive.

`C4_ARTIFACTS_DIR` contains `D0/D0.wasm`, `D0/final.zkey`, `D0/vk.json`, and equivalent subdirectories for the other seven forms. The installer validates **all 24 files** before copying. Its default destination is `public/privacy-c4`, ignored in Git. `.proxyrc.js` serves only the pinned files from `/privacy-c4/` during Parcel development. The files have already been installed in this workspace.

For static deployment, copy the verified files **after** building:

```sh
npm run build:testnet
npm run privacy:install -- public/privacy-c4 dist/privacy-c4
```

Deploy `dist/` over HTTPS including `privacy-c4/`. Repeat the copy if `dist/` is cleaned. Both pool operations and the benchmark use these same 24 pinned C4 artifacts; no separate legacy parameter directory is needed.

WebCrypto needs HTTPS or localhost. A phone that opens an IP address over HTTP does not necessarily get a secure context. The web server must serve `.wasm`, `.zkey` and `.json`. Workers are bundled whole: Parcel's shared bundles are disabled after a missing SHA-256 module was reproduced in the optimized app.

## Manual walkthrough

1. Open a **testnet Legacy, PQ or ECDSA** wallet with TEST XNA. Deposit controls stay disabled until the private wallet is opened in step 2: the normal wallet balance alone does not unlock them. The network is also checked against the expected genesis over RPC.
2. In Privacy, press **Open private wallet**. The private wallet is derived from the open wallet's words and passphrase, an optional **ZK passphrase**, the selected transparent family (Legacy, ECDSA or PQ), and an account number, following NeuraiZK/v2. The same recovery inputs and pool reproduce the same keys. Keep a record of pools, accounts and any extended address ranges used. Each family has separate keys and cached scans; the 8-character check must match when reopened. The previous v1 derivation is no longer used automatically; old TEST notes require their previous keys. A mistyped ZK passphrase opens a different, empty wallet. If the wallet was opened without its words, use **Use an encrypted backup file instead**: create an identity with a password of at least 12 characters or load its encrypted JSON, and **save the JSON before depositing**.
3. Press **Refresh notes**; it runs automatically after deriving the wallet. The browser rebuilds the confirmed state and decrypts the notes that belong to the open identity. Keys and the private witness are never sent to the RPC.
4. To deposit, enter the amount of TEST XNA. There is no fixed limit per deposit beyond the XNA money range. The contract needs a coin of the exact amount and a separate coin for the fee. **Prepare deposit coin** builds, for review, a transaction to the wallet itself; wait for its confirmation before building the deposit. If no second coin is left for the fee, fund the wallet with another normal transfer.
5. **Build and verify proof** reads the current state, prepares the note and witness, proves with one thread, verifies the proof, signs the funding locally and calls `testmempoolaccept`. It does not publish yet.
6. Review amount, fee and identifier. **Publish TEST transaction** rechecks inputs and admission before broadcasting. Confirmation is not immediate; an explorer link is shown.
7. To receive, share the `tnzk1…` address from **Receive privately**. After a note arrives and the notes are refreshed, a new address appears; older addresses stay valid. **New address** hands out another one before the current one is used. To assign, select one note, enter each recipient's `tnzk1…` address or JSON descriptor and amount, and use **Add recipient** for more rows. The sum must not exceed the selected note. Any remainder becomes a change note. The total number of recipient notes plus that change note must be at most four; three recipients plus change is valid, four recipients plus change is not. The address is public; never share the ZK passphrase, the encrypted JSON or its password.
8. To withdraw, select a note and a testnet Legacy, PQ or ECDSA address. The whole note is withdrawn. To withdraw part of it, first split it by assigning to your own address and withdraw the smaller note.
9. In another browser, open the same wallet with its words and press **Open private wallet** with the same ZK passphrase and account. The balance is rebuilt from the chain, trying addresses until 20 unused ones in a row are found; the limit is set in **Recovery settings**. With a file identity, load the JSON and its password. An address can receive, but it cannot recover secrets.

Each address has its own keys, so a full scan tries to decrypt every pool record with every candidate address, about 4 ms per attempt on a desktop computer. A wallet opened from its words keeps an encrypted scan checkpoint in this browser's IndexedDB. Later refreshes, and reopening the wallet, resume from the saved block and only process newer pool operations. The worker encrypts the checkpoint with a key derived from the private wallet; the page only stores the ciphertext. Clearing the site data removes it, and the next scan starts again from the pool birth. A file identity scans from the pool birth each time it is opened.

The fee comes from the transparent wallet and is visible. Deposits and withdrawals also reveal amounts; these trials do not remove those hints or network metadata. Several wallets share the same state UTXO: if another operation spends it, refresh and rebuild the proof. The interface does not spend again automatically.

## Progress, cancellation and uncertain publication

Every operation shows its phase and elapsed time. During proving there is no invented percentage: the indicator stays animated and the timer advances. The interface stays responsive because the work runs in a worker. Cancelling terminates it and locks the identity; open the private wallet again, or load the JSON again for a file identity. If the worker crashes, the panel locks the same way and the next operation starts a new worker.

Once publication has started, cancelling a computation can no longer undo the broadcast. If the RPC takes too long, the txid is kept and a different operation is blocked. **Check transaction status** queries the transaction; it only allows retrying the same bytes if the node still sees its inputs available and accepts that same transaction.

## Benchmark

The benchmark offers all eight C4 forms: D0, D1, T1, T2, T3, T4, W_partial and W_full. It uses one thread, the deployment's pinned parameters, and bundled public synthetic witnesses from `src/privacy-benchmark/c4-fixtures.json`. No wallet notes, RPC data or funds are used. The worker checks the fixture commitment/artifact ID, generates a real proof, checks every public input and verifies against the pinned VK. JSON exports include proof, public inputs and timings; they do not represent confirmed transactions. Manual arbitrary-circuit selection has been removed.

To intentionally regenerate the synthetic witnesses after reviewing a compatible deployment change, run `node scripts/generate-privacy-c4-benchmark.mjs --write` in the test Docker. Then run the eight-form browser proof test before accepting the new fixture. Regeneration never reads wallet backups or calls RPC. Parameter size is not peak RAM, and this benchmark excludes scanning, transaction signing, broadcasting and mining.

The benchmark does not move coins. Its proving times exclude history recovery, coin selection, signing, RPC, block inclusion and real RAM use. The initial primitives test is still available. Do not run two heavy proofs at the same time on a phone.

## RPC and integration tests

A trusted testnet RPC can be set in Settings. It must allow block, transaction and UTXO reads, `getspentinfo`, `validateaddress`, `decoderawtransaction`, `testmempoolaccept`, `sendrawtransaction` and the methods the wallet already uses for funding. The node must run with `-txindex` and `-spentindex`, besides the indexes the wallet already needs. Do not expose an unlocked node wallet to the browser or enable key export.

**Refresh notes** follows the pool state UTXO from its birth with `getspentinfo`: a few calls per pool operation, without walking empty blocks. Each step checks that the transaction is confirmed on the active chain and spends the previous state; at the end those blocks are checked again to detect a reorganization. If the node lacks `-spentindex`, recovery stops with an explicit error. A new block during a refresh no longer forces a restart.

The real browser trial funds temporary addresses generated in the browser itself; the node wallet keeps its keys. The pages in `test/browser/` are separate entries for review in Docker and are not linked from `public/index.html`. Do not include them in an application deployment.

## The neurai-privacy library

All pool logic comes from the `@neuraiproject/neurai-privacy` package: identities, nzk addresses, scanning, proving, transaction building, RPC checks and publication. The webwallet adds the interface, the transparent signing of funding inputs and the proving worker entry `src/privacy-pool/Pool.worker.ts`, which only starts the library worker with snarkjs.

The C4 package is pinned to the local TEST archive above. Before publishing/updating it, repeat the package tests and browser review; update the package source and lockfile deliberately. Stop Parcel and delete `.parcel-cache` before `npm start`; a stale cache can serve an old module map and leave the page blank.
