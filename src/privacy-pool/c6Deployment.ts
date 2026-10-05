import config from './c6-testnet.json';
import type {C6XnaRuntime} from './C6XnaPrivacyPool';
import {createC6PoolWorker} from './workerFactory';
type Config={enabled:boolean;reason?:string;config:C6XnaRuntime['config']};
const reviewed=config as unknown as Config;
export const C6_XNA_UNAVAILABLE_REASON=reviewed.reason??'C6 XNA TEST instance is not installed.';
export const C6_XNA_TESTNET_RUNTIME:C6XnaRuntime|null=reviewed.enabled===true?{config:reviewed.config,createWorker:createC6PoolWorker}:null;

import assets from './c6-assets-testnet.json';
import {createC6AssetPoolWorker} from './workerFactory';
const assetReviewed=assets as unknown as Config;
export const C6_ASSET_TESTNET_RUNTIME:C6XnaRuntime|null=assetReviewed.enabled===true?{config:assetReviewed.config,createWorker:createC6AssetPoolWorker}:null;
