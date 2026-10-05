import {createHash} from 'node:crypto';
import source from '@/privacy-pool/c6-testnet.json';
import {poseidonBytes} from '@neuraiproject/neurai-privacy';
import {validateC6SponsorDeployment} from '@neuraiproject/neurai-privacy/client';
const config=source.config;
const H=(b:Uint8Array|string)=>createHash('sha256').update(b).digest();
const tagged=(s:string,b:Uint8Array)=>H(Buffer.concat([H(s),H(s),b]));
const compact=(n:number)=>n<253?Buffer.from([n]):Buffer.from([253,n&255,n>>8]);
describe('application-pinned public C6 XNA TEST deployment',()=>{
 it('pins reset testnet and derives its context from the earlier UNIQUE issuance',()=>{
  expect(source.enabled).toBe(true);expect(source.testOnly).toBe(true);
  expect(config.network).toBe('testnet');expect(config.deployment.kind).toBe('xna');
  expect(config.deployment.genesis).toBe('0000008b384aeffecdab182575dc4e86c9f07f90318c65088532660ed9a8a021');
  const domain=H(Buffer.concat([Buffer.from('NeuraiPoolC6/J2/TEST/domain\x01'),Buffer.from(config.deployment.genesis,'hex').reverse(),Buffer.from('91fc1294d418c9aa08781231e7517b64d07eea6dbb556143332f6ea42e4ee5db','hex').reverse(),Buffer.from([3,0,0,0])]));
  expect(domain.toString('hex')).toBe(config.domain);expect(H('C6/XNA/TEST').toString('hex')).toBe(config.assetId);
  const context=poseidonBytes(Buffer.concat([Buffer.from('NeuraiPoolCtx\x01'),domain,H('C6/XNA/TEST'),Buffer.from([1,0,0,0,0,0,0,0]),Buffer.alloc(32)]));
  expect(Buffer.from(context).toString('hex')).toBe(config.manifest.context);
  expect(config.expectedGenesis).toBe(Buffer.from(config.deployment.genesis,'hex').reverse().toString('hex'));
  expect(config.manifest.network).toBe(config.expectedGenesis);
 });
 it('reconstructs all nine MAST leaves and matches the confirmed empty birth opening',()=>{
  const d=validateC6SponsorDeployment(config.deployment);const map=new Map(d.leaves.map(l=>[l.form,l]));
  const tree=(names:string[]):Buffer=>{
   if(names.length===1){const b=Buffer.from(map.get(names[0])!.script,'hex');return tagged('NeuraiAuthLeaf',Buffer.concat([Buffer.from([1]),compact(b.length),b]));}
   let at=1;while(at*2<names.length)at*=2;const a=tree(names.slice(0,at)),b=tree(names.slice(at));
   return tagged('NeuraiAuthBranch',Buffer.concat(Buffer.compare(a,b)<0?[a,b]:[b,a]));
  };
  expect(d.leaves).toHaveLength(9);
  const C=tagged('NeuraiAuthScript',Buffer.concat([Buffer.from([4,0]),tree([...map.keys()].sort())])).toString('hex');
  expect(C).toBe(config.expectedCommitment);expect(C).toBe(config.manifest.commitment);
  expect(d.anchor.height).toBe(22121);expect(d.anchor.outpoint).toBe('ba82867c84b1d723b90455dd2514eb87901d7bf944b47e60214cf4ad1b0176e7:0');
 });
 it('contains six VKs and exactly eighteen bounded public artifacts, with no remote manifests',()=>{
  const ops=['D','T1','T2','T3','W','J2'];expect(Object.keys(config.artifacts.forms).sort()).toEqual([...ops].sort());
  const referenced:string[]=[];
  for(const op of ops){const key=op as keyof typeof config.artifacts.forms;const form=config.artifacts.forms[key];referenced.push(form.wasm,form.zkey,form.vk);
   expect(H(Buffer.from(config.manifest.vks[key],'hex')).toString('hex')).toBe(config.manifest.vk_sha256[key]);
   expect(config.manifest.fees[key]).toEqual(['10000000','20000000','50000000']);
  }
  expect(new Set(referenced).size).toBe(18);expect(Object.keys(config.artifacts.files).sort()).toEqual(referenced.sort());
  for(const [name,meta] of Object.entries(config.artifacts.files)){expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);expect(meta.bytes).toBeGreaterThan(0);expect(meta.bytes).toBeLessThan(256*1048576);expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);}
  expect(config.artifactBaseUrl).toBe('/privacy-c6/');
 });
});
