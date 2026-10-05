/// <reference lib="webworker" />
import * as snarkjs from 'snarkjs';
import {startC6PoolWorker} from '@neuraiproject/neurai-privacy/worker';
import {C6_XNA_TESTNET_RUNTIME} from './c6Deployment';
// Pins are part of the application build, never obtained from an RPC reply.
if(!C6_XNA_TESTNET_RUNTIME)throw Error('C6 XNA TEST deployment is not installed');
startC6PoolWorker({...C6_XNA_TESTNET_RUNTIME.config,scope:self,snarkjs,artifactBaseUrl:new URL(C6_XNA_TESTNET_RUNTIME.config.artifactBaseUrl??'/privacy-c6/',self.location.origin).href,buildTransactions:true,durableJournal:true,reservations:[],singleThread:true});
