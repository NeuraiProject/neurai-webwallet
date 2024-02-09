# Neurai Webwallet

Web wallet for Neurai!

Permissionless, open source, non-custodial (your keys never leave your browser).

## How to build

### Clone the repo

`git clone https://github.com/NeuraiProject/neurai-webwallet.git`

### Node & NPM
- Node: > 18
- NPM: > 8

### Install dependencies

`npm install`

### Start local dev server

`npm start`<br/>
Starts a local development server using HTTP, does not support QR code scanning.<br/>
http://localhost:1234

`npm run dev` <br/>
Starts a local development server using HTTPS, supports QR code scanning.<br/>
https://localhost:1234

### Build for production

`npm run build`

Now the ./dist folder contains the web "site", you can FTP the files to your web server.

### Experimental features

To use TESTNET instead of MAINNET for Neurai, append `?network=xna-test` to the URL.

Note: asset thumbnails only work on mainnet.
