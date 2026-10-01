# Isolated C4 browser review

These entries are TEST harnesses, not production wallet entry points. They use
real Chromium workers, snarkjs 0.7.6, the compiled local neurai-privacy package,
and local Legacy/PQ/ECDSA signatures. The validating regtest node confirms the
signed transactions. No user secrets or proving jobs go to the RPC bridge.

The node repository contains:

- `scripts/review-pool-c4-browser-server.py`: creates a fresh single-XNA C4 TEST
  instance and writes the public deployment configuration before bundling.
- `scripts/review-pool-c4-browser.mjs`: worker/prover integration and sampled
  browser PSS memory. Tests corrupted parameters and worker termination.
- `scripts/review-pool-c4-webwallet-ui.mjs`: actual PrivacyPool controls,
  progress, cancellation, derived-wallet recovery and withdrawal.

Use Docker on x86-64. The regtest runtime must have `--network none`; the bridge
binds loopback inside that same container. It mines disposable regtest blocks
for funding and confirmation. Install build dependencies in a separate step.
Use explicit CPU/RAM limits. The successful runtime used 6 CPU and 10 GiB;
this limit is not a mobile hardware recommendation.

Generate `test/browser/generated/c4-deployment.json` with the server's `--config`
argument. The file contains a TEST manifest, artifact sizes/hashes and an
independently supplied commitment pin. It is compiled into the test worker,
never fetched from RPC as a trust decision. The generated directory is ignored.
Pass the checked circuit/key directories to the server; do not regenerate keys
or relabel a different circuit's VK to satisfy a test.

Install the tested local package in the Docker workspace without publishing:

```sh
npm install --no-save --package-lock=false ./tmp/c4-tested/neuraiproject-neurai-privacy-0.1.1.tgz
npm exec -- parcel build test/browser/c4-review.html --dist-dir c4-dist --no-source-maps
npm exec -- parcel build test/browser/c4-ui.html --dist-dir c4-ui-dist --no-source-maps
cp -a c4-ui-dist/. c4-dist/
```

Set the server's `--site` to `c4-dist`. Run the two node-repository drivers
sequentially against that bridge. The worker test leaves the pool empty; the UI
review then deposits 10 XNA, assigns 4/3/3, recovers the receiving wallets and
withdraws all three notes. Keep reports from unsuccessful harness attempts.

C4 workers explicitly allow artifacts up to 256 MiB: the T4 TEST zkey is larger
than the older default limit of 150 MiB. Size and SHA-256 remain pinned. A limit
is not a promise that a device has sufficient working memory.

`PrivacyPool` accepts an application-owned `deployment` prop with its manifest,
worker factory and optional explorer URL. The default public instance is now the separately pinned C4 TEST deployment in
`src/privacy-pool/c4-testnet.json`; C4 is the only supported pool. No RPC-provided manifest is enabled automatically. The review disables public
explorer links because its transactions exist only in isolated regtest.

Latest evidence in the node repository:
`doc/review-results/nip045/c4-browser-final/summary.md`.
The narrow browser viewport test is not a measurement on a physical Android
phone. Shared multiasset custody remains separate work. `c4-public.html` and the
public browser bridge test the default production worker against public testnet
with disposable TEST coins; they are not application entry points.

## Wallet network boundary regression

The UI harness uses jswallet identifiers: Alice `xna-ecdsa-test`, Bob
`xna-pq-strict-test`. Key generation uses neurai-key identifiers (`xna-test`
and `xna-pq-test` respectively). They are different namespaces. Production
`walletNetwork.ts` gates by the actual wallet family and translates to the
signer identifier. Do not use key-library names as fake wallet.network values:
that previously let a UI integration error escape the browser tests. The
network tests use `networkFor()` from the real picker, reject generic v1
`xna-pq-test` wallets, without a previous-pool fallback.
