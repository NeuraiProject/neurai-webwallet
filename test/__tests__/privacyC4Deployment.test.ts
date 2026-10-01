import {C4_TESTNET_DEPLOYMENT as deployment} from '@/privacy-pool/deployment';
import {C4_TESTNET_COMMITMENT, C4_TESTNET_MANIFEST, C4_TESTNET_ARTIFACTS} from '@neuraiproject/neurai-privacy/client';
import fixtures from '@/privacy-benchmark/c4-fixtures.json';

const forms=['D0','D1','T1','T2','T3','T4','W_partial','W_full'];
describe('C4 deployment and benchmark compatibility',()=>{
 it('pins the same reviewed deployment and artifacts as the new library',()=>{
  expect(deployment.pin).toBe(C4_TESTNET_COMMITMENT);
  expect(deployment.manifest).toEqual(C4_TESTNET_MANIFEST);
  expect(deployment.artifacts).toEqual(C4_TESTNET_ARTIFACTS);
  expect(deployment.genesis).toBe(deployment.manifest.genesis);
 });
 it('provides a synthetic witness for every pinned circuit, including batches',()=>{
  expect(fixtures.commitment).toBe(deployment.pin);
  expect(fixtures.artifactsId).toBe(deployment.artifacts.id);
  expect(Object.keys(fixtures.forms)).toEqual(forms);
  for(const form of forms){
   const sample=fixtures.forms[form as keyof typeof fixtures.forms];
   const count=form.startsWith('D')?9:form.startsWith('T')?6+Number(form[1]):8;
   expect(sample.publicSignals).toHaveLength(count);
   expect(sample.publicSignals[0]).toBe(BigInt('0x'+deployment.manifest.context).toString());
   expect(sample.publicSignals[1]).toBe(sample.input.S_old);
   expect(sample.publicSignals[2]).toBe(sample.input.S_new);
  }
 });
});
