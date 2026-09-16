# Neurai WebWallet

Open-source, non-custodial web wallet for Neurai (XNA). Key derivation and transaction signing run in the browser; the wallet connects to a Neurai RPC server for blockchain data and transaction broadcasting.

The current application version is **1.1.0**, defined in [package.json](package.json). The header displays this version and the build date.

## Features

- Create or restore a wallet, with an optional BIP39 passphrase and PIN-protected browser storage.
- Send and receive XNA, manage assets, inspect transaction history, sweep keys and sign messages.
- Select individual UTXOs with **Coin Control** in Send and see their combined amount. On desktop, the UTXO panel opens beside the send form; its state is retained while navigating within the same wallet session.
- Display pending transactions below the header across wallet sections.
- Handle XNA amounts using exact decimal strings and integer satoshis, including amounts beyond JavaScript's safe integer range.
- Configure a custom RPC server and inspect its reported chain, block height, headers, difficulty, verification progress and best block hash in Settings.
- View recovery words in a PIN-protected dialog. Closing it requires a new PIN verification on the next opening.
- DePIN chat on supported legacy testnet wallets, subject to token eligibility and pool availability.

## Networks and recovery

Choose the network in the **Network** selector on the login screen. The available choices depend on the build target.

| Login option | Network identifier | Derivation / use |
| --- | --- | --- |
| Mainnet Legacy | `xna` | BIP44 coin type **1900**; first receiving path `m/44'/1900'/0'/0/0` |
| Mainnet Old webwallet | `xna-legacy` | BIP44 coin type **0**; first receiving path `m/44'/0'/0'/0/0`, for wallets created with the old derivation |
| Testnet Legacy | `xna-legacy-test` | Legacy testnet derivation, coin type **1** |
| Testnet PQ | `xna-pq-test` | Post-quantum testnet derivation |

**Mainnet PQ is disabled in this application.** DePIN chat is disabled for PQ wallets and mainnet in the current implementation.

When restoring an older mainnet wallet, choose **Mainnet Old webwallet** if it used coin type 0. The same recovery words produce different addresses with different derivations or passphrases.

The legacy `?network=xna-test` URL handling remains as a compatibility fallback. Use the login selector to choose a network; a saved selection takes precedence over that fallback.

### PIN and passphrase

The PIN protects the encrypted wallet backup stored in the browser. It is not the BIP39 passphrase and does not replace a recovery backup. Stored wallet backups are separated by network.

In **Settings → Wallet & recovery → View recovery words**, enter the wallet PIN to reveal the words. The Settings card does not disclose their count, and the dialog does not automatically copy them to the clipboard.

If an additional passphrase is active, the dialog reminds you that **the words alone cannot restore that wallet**. The exact passphrase is also required and is not displayed in the recovery dialog. Back it up separately and never use a public example seed for funds.

## Local development

Use **Node.js 24.15.0** (see [.node-version](.node-version)) and npm. This is the Node version used for the current development checks.

```sh
git clone https://github.com/neuraiproject/neurai-webwallet.git
cd neurai-webwallet
npm install
npm start
```

The HTTP development server is available at `http://localhost:1234`. For HTTPS development:

```sh
npm run dev
```

Open `https://localhost:1234`. Camera scanning requires browser permission and a secure context; localhost HTTP can also qualify, so scanning is not inherently limited to `npm run dev`.

Some npm configurations block dependency installation scripts and report `allowScripts` warnings. Review the named packages if installation or native tooling fails; do not enable every dependency script indiscriminately. The project's own `postinstall` script generates `dist/commitHash.js` from the Git revision.

### Build targets

| Target | Development server | Production build |
| --- | --- | --- |
| All enabled networks (default) | `npm start` or `npm run start:all` | `npm run build` or `npm run build:all` |
| Mainnet only | `npm run start:mainnet` | `npm run build:mainnet` |
| Testnet only | `npm run start:testnet` | `npm run build:testnet` |

These target-specific scripts set `WALLET_BUILD` at build time. Their environment-variable syntax assumes a POSIX shell, such as Bash or WSL. Restricting a build to mainnet does not enable Mainnet PQ.

Production output is written to `dist/`. Serve its contents from a static web server over HTTPS. The build target is compiled into the JavaScript; changing it requires rebuilding. The `prestart` and `prebuild` scripts update `src/buildDate.ts`.

## RPC connection

Default endpoints configured by the application:

| Chain | RPC endpoint |
| --- | --- |
| Mainnet | `https://rpc-main.neurai.org/rpc` |
| Testnet | `https://rpc-testnet.neurai.org/rpc` |

In **Settings → RPC connection**, enable a custom server and enter its full URL, plus optional username and password. Save and reload to apply the change. **Restore defaults** removes the custom configuration.

The custom RPC override is shared across networks in this browser, so check its chain when switching wallets. RPC credentials are saved in browser local storage. Use an endpoint intended for browser access, with the necessary CORS and RPC permissions. Browser mixed-content rules can restrict HTTP connections from an HTTPS wallet.

Network details are fetched from the active wallet's RPC using `getblockchaininfo` every 30 seconds while Settings is mounted. Missing, blocked or failed responses are shown as unavailable rather than as a confirmed sync state.

## Validation

```sh
npm test -- --runInBand
npx tsc --noEmit
npm run build
```

Additional commands:

```sh
npm run test:watch
npm run test:coverage
```

The Jest suites in [test/__tests__](test/__tests__) cover exact amounts, network derivation, UTXO selection and Coin Control, recovery PIN verification, Settings, pending transactions, DePIN logic and other wallet utilities. The coverage command currently collects from `src/utils`; it is not a whole-application coverage report.

### Optional regtest integration

[test/regtest/published-large-amounts.cjs](test/regtest/published-large-amounts.cjs) exercises legacy and PQ transactions with large XNA amounts against a real regtest node. It is separate from `npm test`.

It requires an existing, running Docker container containing `/usr/local/bin/neuraid-regtest`, `/usr/local/bin/neurai-cli-regtest` and `/opt/NEURAI_SOURCE_REVISION`. It starts an isolated node data directory, mines test blocks and broadcasts regtest transactions:

```sh
NEURAI_REGTEST_CONTAINER=your-regtest-container node test/regtest/published-large-amounts.cjs
```

Review the script's container requirements before running it; a generic Neurai Docker image may not provide those binaries.

## Related documentation

- [ESP32 storage integration](ESP32_README.md)
- [License](LICENSE)
