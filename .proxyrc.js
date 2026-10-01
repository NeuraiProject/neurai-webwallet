const {createReadStream}=require('node:fs');
const {stat}=require('node:fs/promises');
const {join}=require('node:path');
const c4=require('./src/privacy-pool/c4-testnet.json');
module.exports=function(app){
 app.use('/privacy-c4',async(req,res)=>{
  let name;try{name=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'');}catch{res.statusCode=400;res.end();return;}
  if(!Object.prototype.hasOwnProperty.call(c4.artifacts.files,name)||!['GET','HEAD'].includes(req.method)){res.statusCode=404;res.end();return;}
  const path=join(__dirname,'public/privacy-c4',name);
  try{
   const info=await stat(path);res.setHeader('Content-Length',info.size);
   res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream');
   if(req.method==='HEAD'){res.end();return;}
   const stream=createReadStream(path);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.statusCode=404;res.end('Install C4 TEST parameters with npm run privacy:install');}
 });
};
