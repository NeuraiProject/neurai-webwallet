/// <reference lib="webworker" />
import * as snarkjs from 'snarkjs';
import {startC7PoolWorker,type SnarkjsLike} from '@neuraiproject/neurai-privacy/worker';
import {C7_XNA_TESTNET_RUNTIME} from './c7Deployment';
// Pins are part of the application build, never obtained from an RPC reply.
if(!C7_XNA_TESTNET_RUNTIME)throw Error('C7 XNA TEST deployment is not installed');
startC7PoolWorker({...C7_XNA_TESTNET_RUNTIME.config,scope:self,snarkjs:snarkjs as unknown as SnarkjsLike,artifactBaseUrl:new URL(C7_XNA_TESTNET_RUNTIME.config.artifactBaseUrl??'/privacy-c7/',self.location.origin).href,buildTransactions:true,durableJournal:true,reservations:[],singleThread:true});
