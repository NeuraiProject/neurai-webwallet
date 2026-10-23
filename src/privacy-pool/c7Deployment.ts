import config from './c7-testnet.json';
import type {C6XnaRuntime} from './C6XnaPrivacyPool';
import {createC7PoolWorker} from './workerFactory';
type Config={enabled:boolean;reason?:string;config:C6XnaRuntime['config']};
const reviewed=config as unknown as Config;
// C7 reuses the C6 circuits and proving files (same digests), served from /privacy-c6/.
export const C7_XNA_UNAVAILABLE_REASON=reviewed.reason??'C7 XNA TEST instance is not installed.';
export const C7_XNA_TESTNET_RUNTIME:C6XnaRuntime|null=reviewed.enabled===true?{config:{...reviewed.config,artifactBaseUrl:'/privacy-c6/'},createWorker:createC7PoolWorker}:null;
