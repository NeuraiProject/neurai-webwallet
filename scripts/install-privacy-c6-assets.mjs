// Install the complete set of application-pinned public TEST parameters.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,stat,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const data=JSON.parse(await readFile(new URL('../src/privacy-pool/c6-assets-testnet.json',import.meta.url),'utf8'));
const source=process.argv[2],destination=process.argv[3]??'public/privacy-c6-assets/'+data.config.manifest.asset;
if(!source)throw Error('Usage: npm run privacy:install:c6 -- <artifact directory> [destination]');
if(data.enabled!==true||data.config?.network!=='testnet'||data.config?.deployment?.kind!=='asset')throw Error('A reviewed public C6 ordinary-asset TEST deployment must be pinned first');
const {artifacts}=data.config;
for(const op of ['D','T1','T2','T3','W','J2'])if(!artifacts?.forms?.[op])throw Error('Missing operation '+op);
const files=Object.entries(artifacts.files);
for(const [name,meta] of files){
 if(!/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(name)||name.split('/').some(v=>v==='.'||v==='..')||!Number.isSafeInteger(meta.bytes)||meta.bytes<=0||meta.bytes>256*1048576||!/^[0-9a-f]{64}$/.test(meta.sha256))throw Error('Invalid artifact pin');
 const path=resolve(source,name);if((await stat(path)).size!==meta.bytes)throw Error('Size mismatch: '+name);
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==meta.sha256)throw Error('Hash mismatch: '+name);
}
// All files are checked before copying; no generated keys or guessed fallbacks.
for(const [name] of files){const from=resolve(source,name),to=resolve(destination,name);if(from===to)continue;await mkdir(dirname(to),{recursive:true});await copyFile(from,to);}
console.log('Verified and installed '+files.length+' C6 TEST artifacts in '+destination);
