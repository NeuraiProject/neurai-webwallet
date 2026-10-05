// Serve only application-pinned public proving parameters during development.
const {createReadStream}=require('node:fs');
const {stat}=require('node:fs/promises');
const {join}=require('node:path');
const c4=require('./src/privacy-pool/c4-testnet.json');
const c5=require('./src/privacy-pool/c5-testnet.json');
const asset=require('./src/privacy-pool/c6-assets-testnet.json');
const c6=require('./src/privacy-pool/c6-testnet.json');
module.exports=function(app){
 for(const [profile,files] of [['c4',c4.artifacts.files],['c5',c5.artifacts.files],['c6',c6.enabled===true?c6.config.artifacts.files:{}],...(asset.enabled===true?[["c6-assets/"+asset.config.manifest.asset,asset.config.artifacts.files]]:[])]){
  app.use('/privacy-'+profile,async(req,res)=>{
   let name;try{name=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'');}catch{res.statusCode=400;res.end();return;}
   if(!Object.prototype.hasOwnProperty.call(files,name)||!['GET','HEAD'].includes(req.method)){res.statusCode=404;res.end();return;}
   const path=join(__dirname,'public/privacy-'+profile,name);
   try{
    const info=await stat(path);
    if(info.size!==files[name].bytes){res.statusCode=503;res.end('Pinned proving artifact size mismatch');return;}
    res.setHeader('Content-Length',info.size);res.setHeader('Cache-Control','no-cache');
    res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream');
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(path);stream.on('error',()=>res.destroy());stream.pipe(res);
   }catch{res.statusCode=404;res.end('Install pinned TEST parameters with the matching privacy:install command');}
  });
 }
};
