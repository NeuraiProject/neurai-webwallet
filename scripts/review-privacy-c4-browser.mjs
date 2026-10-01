// Local, read-only browser proof review. No RPC, wallet, mining or broadcast.
// Run in the Playwright Docker image; pass an installed playwright module path.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2] ?? 'node_modules/playwright/index.mjs')).href);
const root=resolve('.'),dist=resolve(root,'tmp/c4-only-review/bench-dist');
const smokeOnly=process.argv.includes('--wallet-smoke');
const reportPath=resolve(root,smokeOnly?'tmp/c4-only-review/results/wallet-browser.json':'tmp/c4-only-review/results/browser.json');
const deployment=JSON.parse(await readFile('src/privacy-pool/c4-testnet.json','utf8'));
const report={passed:false,checks:[],proofs:[],browserErrors:[]};
const server=createServer(async(req,res)=>{
 try {
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let base=dist,relative=name==='/'?'c4-benchmark.html':name.slice(1);
  if(name.startsWith('/privacy-c4/')){
   relative=name.slice('/privacy-c4/'.length);base=resolve(root,'public/privacy-c4');
   if(!Object.hasOwn(deployment.artifacts.files,relative))throw new Error('Unknown artifact');
  }
  const file=resolve(base,relative);if(!file.startsWith(base+sep))throw new Error('Invalid path');
  const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
  res.setHeader('Content-Length',info.size);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[extname(file)]??'application/octet-stream');
  createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
 browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--js-flags=--max-old-space-size=1800']});
 const page=await browser.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>typeof window.runC4Benchmark==='function');
 async function failure(form,pattern){
  const message=await page.evaluate(async form=>{try{await window.runC4Benchmark(form);return '';}catch(error){return error.message;}},form);
  assert.match(message,pattern);report.checks.push({test:pattern.source,passed:true});
 }
 if(smokeOnly){
  report.checks.push(await page.evaluate(()=>window.runC4WalletSmoke()));
 } else {
 await failure('C3',/Unknown C4 circuit/);
 await page.route('**/privacy-c4/D0/D0.wasm',route=>route.fulfill({status:404,body:'not installed'}));
 await failure('D0',/not installed|Install|HTTP|available|download|404/i);
 await page.unroute('**/privacy-c4/D0/D0.wasm');
 const corrupted=Buffer.from(await readFile('public/privacy-c4/D0/D0.wasm'));corrupted[0]^=1;
 await page.route('**/privacy-c4/D0/D0.wasm',route=>route.fulfill({status:200,body:corrupted,contentType:'application/wasm'}));
 await failure('D0',/integrity mismatch/);
 await page.unroute('**/privacy-c4/D0/D0.wasm');
 for(const form of ['D0','D1','T1','T2','T3','T4','W_partial','W_full']){
  console.log('Proving '+form);
  const value=await page.evaluate(form=>window.runC4Benchmark(form),form);
  assert.equal(value.proofVerified,true);assert.equal(value.form,form);
  assert.equal(value.manifestId,deployment.artifacts.id);
  report.proofs.push(value);await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(form+' verified in '+(value.totalMs/1000).toFixed(2)+' s');
 }
 }
 assert.deepEqual(report.browserErrors,[]);report.passed=true;
} finally {
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
