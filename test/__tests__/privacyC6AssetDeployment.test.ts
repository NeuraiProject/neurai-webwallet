import source from '@/privacy-pool/c6-assets-testnet.json';
import xna from '@/privacy-pool/c6-testnet.json';
import {createHash} from 'node:crypto';
import {c6AssetMetadata,validateC6SponsorDeployment} from '@neuraiproject/neurai-privacy/client';
import {poseidonBytes} from '@neuraiproject/neurai-privacy';
const H=(b:Uint8Array|string)=>createHash('sha256').update(b).digest();
it('pins an independent public asset instance with exact units and zero private fee',()=>{
 const c=source.config,meta=c6AssetMetadata(c.manifest as any),d=validateC6SponsorDeployment(c.deployment as any);
 expect(source.enabled).toBe(true);expect(d.kind).toBe('asset');expect(d.genesis).toBe(xna.config.deployment.genesis);expect(d.commitment).not.toBe(xna.config.deployment.commitment);
 expect(meta.name).toBe('C6ASSET261004A');expect(meta.units).toBe(2);expect(meta.unit).toBe(1000000n);expect(c.manifest.sponsor_index).toBe(2);expect(c.artifactBaseUrl).toBe('/privacy-c6-assets/'+meta.name+'/');
 const unit=Buffer.alloc(8);unit.writeBigUInt64LE(meta.unit);expect(Buffer.from(poseidonBytes(Buffer.concat([Buffer.from('NeuraiPoolCtx\x01'),Buffer.from(c.domain,'hex'),Buffer.from(c.assetId,'hex'),unit,Buffer.alloc(32)]))).toString('hex')).toBe(c.manifest.context);
 for(const op of ['D','T1','T2','T3','W','J2'] as const){expect(c.manifest.fees[op]).toEqual(['0']);expect(H(Buffer.from(c.manifest.vks[op],'hex')).toString('hex')).toBe(c.manifest.vk_sha256[op]);expect(c.manifest.vk_sha256[op]).not.toBe(xna.config.manifest.vk_sha256[op]);}
 expect(Object.keys(c.artifacts.files)).toHaveLength(18);
});
