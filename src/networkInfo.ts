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
    const baseURL = "https://rebel-explorer-testnet.neurai.org/thumbnail?assetName=";
    return baseURL + encodeURIComponent(assetName);
  },
  getTransactionURL: (id: string) => {
    return "https://rebel-explorer-testnet.neurai.org/tx/" + id;
  },
};

export interface INetworks {
  xna: INetworkInfo;
  "xna-test": INetworkInfo;
  "xna-legacy": INetworkInfo;
  "xna-legacy-test": INetworkInfo;
  "xna-pq": INetworkInfo;
  "xna-pq-test": INetworkInfo;
}

const networks: INetworks = {
  xna: neuraiMainnet,
  "xna-test": neuraiTestnet,
  "xna-legacy": neuraiMainnet,
  "xna-legacy-test": neuraiTestnet,
  "xna-pq": neuraiMainnet,
  "xna-pq-test": neuraiTestnet,
};

export default networks;
