import type { C4Manifest, C5Manifest } from '@neuraiproject/neurai-privacy/browser';
import config from './c4-testnet.json';

// Public TEST instance, pinned at build time. No keys or private wallet data.
export const C4_TESTNET_DEPLOYMENT = {
  ...config,
  manifest: config.manifest as C4Manifest & {address: string},
};

import c5 from './c5-testnet.json';
import type {C4ArtifactList} from '@neuraiproject/neurai-privacy/client';
type C5Config={enabled:boolean;reason?:string;manifest:C5Manifest&{address:string};artifacts:C4ArtifactList;pin:string;genesis:string};
const c5Config=c5 as unknown as C5Config;
// An unavailable C5 deployment is never replaced with the C4 manifest or keys.
export const C5_UNAVAILABLE_REASON=c5Config.reason??'C5 TEST deployment is not installed.';
export const C5_TESTNET_DEPLOYMENT=c5Config.enabled===true?c5Config:null;
