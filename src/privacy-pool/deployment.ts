import type { C4Manifest } from '@neuraiproject/neurai-privacy/browser';
import config from './c4-testnet.json';

// Public TEST instance, pinned at build time. No keys or private wallet data.
export const C4_TESTNET_DEPLOYMENT = {
  ...config,
  manifest: config.manifest as C4Manifest & {address: string},
};
