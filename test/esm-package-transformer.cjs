// Jest runs CommonJS here. Compile ESM package entries, including real paths
// reached through the local SDK symlink, independently of package type/module.
const ts=require('typescript');
module.exports={
 process(source,fileName){
  const result=ts.transpileModule(source,{fileName,compilerOptions:{allowJs:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}});
  return {code:result.outputText};
 }
};
