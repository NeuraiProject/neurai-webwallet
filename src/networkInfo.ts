export interface INetworkInfo {
  displayName: string;
  getTransactionURL: (arg: string) => string;
  getThumbnailURL: (arg: string) => string;
}

const neuraiMainnet: INetworkInfo = {
  displayName: "Neurai Mainnet",
  getTransactionURL: (id: string) => {
    return (
      "https://xna.cryptoscope.io/tx/?txid=" +
      id
    );
  },
  getThumbnailURL(assetName: string) {
    const baseURL =
      "https://xna-explorer-mainnet.ting.finance/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
};

const ravencoinTestnet: INetworkInfo = {
  displayName: "Ravencoin Testnet",
  getThumbnailURL: (assetName) => {
    const baseURL = "https://testnet.ting.finance/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
  getTransactionURL: (id: string) => {
    return "https://xna.cryptoscope.io/tx/?txid=" + id;
  },
};

const evrmoreMainnet: INetworkInfo = {
  displayName: "Evrmore Mainnet",
  getThumbnailURL(assetName) {
    const baseURL =
      "https://evr-explorer-mainnet.ting.finance/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
  getTransactionURL: (id: string) => {
    return (
      "https://evr-explorer-mainnet.ting.finance/index.html?route=TRANSACTION&id=" +
      id
    );
  },
};

interface INetworks {
  xna: INetworkInfo;
  "xna-test": INetworkInfo;
  evr: INetworkInfo;
}

const asdf: INetworks = {
  xna: neuraiMainnet,
  "xna-test": ravencoinTestnet,
  evr: evrmoreMainnet,
};

export default asdf;
