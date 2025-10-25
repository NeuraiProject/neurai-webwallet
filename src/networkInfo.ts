export interface INetworkInfo {
  displayName: string;
  getTransactionURL: (arg: string) => string;
  getThumbnailURL: (arg: string) => string;
}

const neuraiMainnet: INetworkInfo = {
  displayName: "Neurai Mainnet",
  getTransactionURL: (id: string) => {
    // Update with actual Neurai explorer URL when available
    return "https://neuraiexplorer.com/tx/" + id;
  },
  getThumbnailURL(assetName: string) {
    // Update with actual Neurai thumbnail service URL when available
    const baseURL = "https://rebel-explorer.neurai.org/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
};

const neuraiTestnet: INetworkInfo = {
  displayName: "Neurai Testnet",
  getThumbnailURL: (assetName) => {
    // Update with actual Neurai testnet thumbnail service URL when available
    const baseURL = "https://rebel-explorer.neurai.org/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
  getTransactionURL: (id: string) => {
    // Update with actual Neurai testnet explorer URL when available
    return "https://testnet.neuraiexplorer.com/tx/" + id;
  },
};

export interface INetworks {
  xna: INetworkInfo;
  "xna-test": INetworkInfo;
}

const networks: INetworks = {
  xna: neuraiMainnet,
  "xna-test": neuraiTestnet,
};

export default networks;
