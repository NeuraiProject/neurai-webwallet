import Signer from '@neuraiproject/neurai-sign-transaction';
import {networkFor} from '@/networkOptions';
import {poolWalletNetwork,signPoolTransaction} from '@/privacy-pool/walletNetwork';
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn(()=> 'signed')}}));

describe('Privacy wallet identifiers at the jswallet/signer boundary',()=>{
 afterEach(()=>jest.clearAllMocks());
 it.each([['legacy','xna-legacy-test'],['ecdsa','xna-test'],['pq','xna-pq-test']] as const)(
  'accepts the actual %s picker identifier and translates it for signing',(family,signer)=>{
   const walletNetwork=networkFor('testnet',family);
   expect(poolWalletNetwork(walletNetwork)).toEqual({family,signer});
   const coins:any[]=[],keys={};expect(signPoolTransaction(walletNetwork,'raw',coins,keys)).toBe('signed');
   expect(Signer.sign).toHaveBeenCalledWith(signer,'raw',coins,keys);
  });
 it('preserves the old Legacy testnet URL alias',()=>{
  expect(poolWalletNetwork('xna-test')).toEqual({family:'legacy',signer:'xna-legacy-test'});
 });
 it.each(['xna','xna-legacy','xna-ecdsa','xna-pq-strict','xna-pq-test','xna-authscript-test','unknown-test'])(
  'rejects mainnet, contract and unknown wallet identifier %s',(network)=>{
   expect(poolWalletNetwork(network)).toBeNull();
   expect(()=>signPoolTransaction(network,'raw',[],{})).toThrow('Unsupported wallet network');
   expect(Signer.sign).not.toHaveBeenCalled();
  });
});
