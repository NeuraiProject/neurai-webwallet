/// <reference lib="webworker" />
import * as snarkjs from 'snarkjs';
import {startC6PoolWorker} from '@neuraiproject/neurai-privacy/worker';
import {C7_XNA_TESTNET_RUNTIME} from './c7Deployment';
// Pins are part of the application build, never obtained from an RPC reply.
if(!C7_XNA_TESTNET_RUNTIME)throw Error('C7 XNA TEST deployment is not installed');
startC6PoolWorker({...C7_XNA_TESTNET_RUNTIME.config,scope:self,snarkjs,artifactBaseUrl:new URL(C7_XNA_TESTNET_RUNTIME.config.artifactBaseUrl??'/privacy-c6/',self.location.origin).href,buildTransactions:true,durableJournal:true,reservations:[],singleThread:true});
