// Real consensus validation using public test mnemonics and an isolated regtest.
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const req=createRequire(resolve(__dirname,'../../package.json'));
const Wallet=req('@neuraiproject/neurai-jswallet');
const {parseRpcJson,stringifyRpcJson}=req('@neuraiproject/neurai-rpc');
const {parseTransaction,decimalToSatoshis,satoshisToDecimal}=req('@neuraiproject/neurai-create-transaction');
const container=process.env.NEURAI_REGTEST_CONTAINER || 'neurai-libraries-regtest-20260916';
const datadir='/tmp/webwallet-published-'+Date.now();
const args=['-regtest','-datadir='+datadir,'-rpcuser=regtest','-rpcpassword=regtest','-rpcport=19443'];
function docker(...cmd){return execFileSync('docker',['exec',container,...cmd],{encoding:'utf8',maxBuffer:64*1024*1024}).trim();}
function cli(method,...params){
 const values=params.map(p=>typeof p==='string'?p:stringifyRpcJson(p));
 // stdin avoids OS argv length limits while aggregating hundreds of coinbases.
 const out=execFileSync('docker',['exec','-i',container,'/usr/local/bin/neurai-cli-regtest',...args,'-stdin',method],{input:values.length?values.join('\n')+'\n':'',encoding:'utf8',maxBuffer:64*1024*1024}).trim();
 if(!out)return null;
 try{return parseRpcJson(out);}catch{return out;}
}
const rpc=async(method,params=[])=>cli(method,...params);
const mnemonic='salad hammer want used web finger comic gold trigger accident oblige pluck';
const outcomes=[];
async function sendAndCheck(wallet,options,label){
 const result=await wallet.createTransaction(options);
 const signed=result.debug.signedTransaction;
 const decoded=parseTransaction(signed);
 const input=result.debug.UTXOs.filter(u=>u.assetName==='XNA').reduce((n,u)=>n+BigInt(u.satoshis),0n);
 assert.equal(decoded.outputs.reduce((n,o)=>n+o.valueSats,0n)+decimalToSatoshis(result.debug.fee),input);
 const nodeDecoded=cli('decoderawtransaction',signed);
 for(let i=0;i<decoded.outputs.length;i++)assert.equal(decimalToSatoshis(nodeDecoded.vout[i].value),decoded.outputs[i].valueSats);
 if(!options.sendMax)assert.equal(decoded.outputs[0].valueSats,decimalToSatoshis(options.amount));
 const [admission]=cli('testmempoolaccept',[signed]);
 assert.ok(admission.allowed,JSON.stringify(admission));
 const txid=cli('sendrawtransaction',signed);
 cli('generate',1);
 assert.ok(cli('getrawtransaction',txid,true).confirmations>=1);
 outcomes.push({label,txid,firstOutputRaw:decoded.outputs[0].valueSats.toString(),fee:String(result.debug.fee),confirmed:true});
 console.log(label,'accepted and mined',txid);
}
(async()=>{
 let started=false;
 try{
  // Refuse an existing data directory rather than deleting another run.
  docker('mkdir',datadir);
  docker('/usr/local/bin/neuraid-regtest',...args,'-daemon','-server=1','-listen=0','-assetindex=1','-addressindex=1','-txindex=1');started=true;
  let ready=false;
  for(let i=0;i<60;i++){try{cli('getblockcount');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  assert.ok(ready,'node startup');
  assert.equal(cli('getblockchaininfo').chain,'regtest');
  const legacy=await Wallet.createInstance({mnemonic,network:'xna-test',offlineMode:true});legacy.rpc=rpc;
  const pq=await Wallet.createInstance({mnemonic,network:'xna-pq-test',offlineMode:true});pq.rpc=rpc;
  const legacyAddress=legacy.getAddresses()[0];
  const pqAddress=pq.getAddresses()[0];
  console.log('Mining 2501 regtest blocks for >100 million mature XNA');
  cli('generate',2501);
  const coins=cli('listunspent',100,9999999).filter(u=>decimalToSatoshis(u.amount)===5000000000000n);
  assert.ok(coins.length>=2400,'2400 mature coinbases');
  // Aggregate in standard-size transactions. Node wallet signs its coinbases;
  // only the subsequent large transactions are signed by the JS libraries.
  for(let i=0;i<6;i++){
   const group=coins.slice(i*400,(i+1)*400);
   const raw=cli('createrawtransaction',group.map(u=>({txid:u.txid,vout:u.vout})),{[legacyAddress]:19999990});
   const signed=cli('signrawtransaction',raw);assert.ok(signed.complete);
   cli('sendrawtransaction',signed.hex);cli('generate',1);
  }
  assert.equal(decimalToSatoshis(await legacy.getBalance()),11999994000000000n);
  await sendAndCheck(legacy,{toAddress:pqAddress,amount:'105552176.16498300'},'legacy original error amount');
  await sendAndCheck(pq,{toAddress:legacyAddress,amount:'100000000.00000001'},'PQ large fractional amount');
  await sendAndCheck(legacy,{toAddress:cli('getnewaddress'),sendMax:true},'legacy large sendMax');
  console.log(JSON.stringify({source:docker('cat','/opt/NEURAI_SOURCE_REVISION'),outcomes},null,2));
 }finally{if(started)cli('stop');}
})().catch(error=>{console.error(error);process.exitCode=1;});
