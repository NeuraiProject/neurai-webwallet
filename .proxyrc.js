// Serve only application-pinned public proving parameters during development.
const {createReadStream}=require('node:fs');
const {stat}=require('node:fs/promises');
const {join}=require('node:path');
const c7=require('./src/privacy-pool/c7-testnet.json');
module.exports=function(app){
 for(const [profile,files] of [['c7',c7.enabled===true?c7.config.artifacts.files:{}]]){
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
   }catch{res.statusCode=404;res.end('Install the pinned TEST parameters with npm run privacy:install:c7');}
  });
 }
};
