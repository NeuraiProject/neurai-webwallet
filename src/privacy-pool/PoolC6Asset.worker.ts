/// <reference lib="webworker" />
import * as snarkjs from 'snarkjs';
import {startC6PoolWorker} from '@neuraiproject/neurai-privacy/worker';
import {C6_ASSET_TESTNET_RUNTIME} from './c6Deployment';
if(!C6_ASSET_TESTNET_RUNTIME)throw Error('C6 ordinary-asset TEST deployment is not installed');
startC6PoolWorker({...C6_ASSET_TESTNET_RUNTIME.config,scope:self,snarkjs,artifactBaseUrl:new URL(C6_ASSET_TESTNET_RUNTIME.config.artifactBaseUrl!,self.location.origin).href,buildTransactions:true,durableJournal:true,reservations:[],singleThread:true});
