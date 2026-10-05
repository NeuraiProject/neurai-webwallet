// Install only the exact public TEST artifacts pinned in this application.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,stat,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
const config=JSON.parse(await readFile(new URL('../src/privacy-pool/c5-testnet.json',import.meta.url),'utf8'));
const source=process.argv[2],destination=process.argv[3]??'public/privacy-c5';
if(!source)throw new Error('Usage: node scripts/install-privacy-c5.mjs <C5 artifact directory> [destination]');
if(config.enabled!==true)throw new Error('The reviewed public C5 TEST deployment is not configured');
const files=Object.entries(config.artifacts.files);
// Validate the complete set before installing anything.
for(const [name,meta] of files){
 if(!/^(D0|D1|T[1-4]|W_partial|W_full)\/(?:[A-Za-z0-9_.]+)$/.test(name))throw new Error('Unsafe artifact path');
 const path=resolve(source,name);if((await stat(path)).size!==meta.bytes)throw new Error('Size mismatch: '+name);
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==meta.sha256)throw new Error('Hash mismatch: '+name);
}
for(const [name] of files){
 const from=resolve(source,name),to=resolve(destination,name);
 if(from===to)continue;
 await mkdir(dirname(to),{recursive:true});await copyFile(from,to);
}
console.log('Installed and verified '+files.length+' C5 TEST artifacts in '+destination);
