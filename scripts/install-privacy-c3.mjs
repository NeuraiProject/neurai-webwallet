import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
// The pinned artifact list with sizes and SHA-256 comes from the library.
import {C3_TESTNET_ARTIFACTS as manifest} from '@neuraiproject/neurai-privacy/client';
const source=process.argv[2],destination=process.argv[3]??'dist/privacy-c3';
if(!source)throw new Error('Usage: node scripts/install-privacy-c3.mjs <C3 benchmark directory> [destination]');
for(const [name,meta] of Object.entries(manifest.files)){
 if(name.includes('..')||name.startsWith('/'))throw new Error('Unsafe artifact path');
 const path=resolve(source,name);if((await stat(path)).size!==meta.bytes)throw new Error('Size mismatch: '+name);
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==meta.sha256)throw new Error('Hash mismatch: '+name);
 const target=join(destination,name);await mkdir(dirname(target),{recursive:true});await copyFile(path,target);
}
console.log('Installed and verified '+Object.keys(manifest.files).length+' public TEST artifacts.');
