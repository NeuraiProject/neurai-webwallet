import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const source=fs.readFileSync(path.join(process.cwd(),'.proxyrc.js'),'utf8');
function server(enabled=true){
 const routes=new Map<string,Function>();const stat=jest.fn(async()=>({size:3}));
 const stream={on:jest.fn().mockReturnThis(),pipe:jest.fn()};const createReadStream=jest.fn(()=>stream);
 const files={'D.wasm':{bytes:3},'T1.zkey':{bytes:3},'J2.vk.json':{bytes:3}};
 const module={exports:null as any};
 vm.runInNewContext(source,{module,__dirname:'/app',require:(name:string)=>{
  if(name==='node:fs')return {createReadStream};if(name==='node:fs/promises')return {stat};if(name==='node:path')return path;
  if(name.endsWith('c6-assets-testnet.json'))return {enabled,config:{manifest:{asset:'ASSET_TEST'},artifacts:{files}}};
  if(name.endsWith('c6-testnet.json'))return {enabled,config:{artifacts:{files}}};return {artifacts:{files}};
 }});
 module.exports({use:(name:string,handler:Function)=>routes.set(name,handler)});
 const res={statusCode:200,setHeader:jest.fn(),end:jest.fn(),destroy:jest.fn()};
 return {routes,stat,createReadStream,stream,res};
}
describe('pinned proving artifact development hosting',()=>{
 it.each(['c4','c5','c6','c6-assets/ASSET_TEST'])('serves the pinned %s artifact with its exact size and MIME',async profile=>{
  const s=server();await s.routes.get('/privacy-'+profile)!({url:'/D.wasm?version=pin',method:'GET'},s.res);
  expect(s.stat).toHaveBeenCalledWith('/app/public/privacy-'+profile+'/D.wasm');expect(s.res.setHeader).toHaveBeenCalledWith('Content-Type','application/wasm');expect(s.res.setHeader).toHaveBeenCalledWith('Content-Length',3);expect(s.stream.pipe).toHaveBeenCalledWith(s.res);
 });
 it.each(['/../wallet.dat','/%2e%2e/wallet.dat','/private.json','/D.wasm/extra','/__proto__'])('rejects unpinned path %s without file access',async url=>{
  const s=server();await s.routes.get('/privacy-c6')!({url,method:'GET'},s.res);expect(s.res.statusCode).toBe(404);expect(s.stat).not.toHaveBeenCalled();
 });
 it('rejects malformed URI, writing methods and disabled C6',async()=>{
  for(const req of [{url:'/%',method:'GET'},{url:'/D.wasm',method:'POST'}]){const s=server();await s.routes.get('/privacy-c6')!(req,s.res);expect(s.res.statusCode).toBe(req.method==='POST'?404:400);expect(s.stat).not.toHaveBeenCalled();}
  const s=server(false);await s.routes.get('/privacy-c6')!({url:'/D.wasm',method:'GET'},s.res);expect(s.res.statusCode).toBe(404);expect(s.stat).not.toHaveBeenCalled();
 });
 it('supports HEAD and the public JSON/key MIME without streaming HEAD',async()=>{
  const s=server();await s.routes.get('/privacy-c6')!({url:'/J2.vk.json',method:'HEAD'},s.res);expect(s.res.setHeader).toHaveBeenCalledWith('Content-Type','application/json');expect(s.createReadStream).not.toHaveBeenCalled();expect(s.res.end).toHaveBeenCalled();
  await s.routes.get('/privacy-c6')!({url:'/T1.zkey',method:'GET'},s.res);expect(s.res.setHeader).toHaveBeenCalledWith('Content-Type','application/octet-stream');
 });
 it('does not serve a stale-size or missing artifact',async()=>{
  const s=server();s.stat.mockResolvedValueOnce({size:4});await s.routes.get('/privacy-c6')!({url:'/D.wasm',method:'GET'},s.res);expect(s.res.statusCode).toBe(503);expect(s.createReadStream).not.toHaveBeenCalled();
  const missing=server();missing.stat.mockRejectedValueOnce(Error('Missing'));await missing.routes.get('/privacy-c6')!({url:'/D.wasm',method:'GET'},missing.res);expect(missing.res.statusCode).toBe(404);
 });
});
