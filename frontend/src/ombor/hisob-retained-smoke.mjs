/** Haqiqiy production Worker bundle, alohida thread, retained26k packet. */
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(!isMainThread){
  globalThis.postMessage=x=>parentPort.postMessage(x);await import(workerData.bundle);
  parentPort.on('message',data=>globalThis.onmessage({data}));parentPort.postMessage('READY');
}else{
  const {build}=await import('vite');const outDir=await mkdtemp(join(tmpdir(),'smeta-d3-retained-'));
  await build({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:false,logLevel:'error',build:{outDir,emptyOutDir:false,
    lib:{entry:'src/ombor/hisob-sessiya.worker.ts',formats:['es'],fileName:()=>'worker.mjs'},minify:true}});
  const n=26000,f=x=>Array(n).fill(x),src=n=>Array.from({length:26000},(_,i)=>i<2?null:n);
  const p={format:'t2-paket/1',obyekt_id:1,obyekt_nom:'SINOV',kompaniya_id:1,soni:n,
    lugat:{nom:['SINOV'],kod:[],birlik:[],tur:['rz','bl','rs'],kat:['МАТ']},
    q:{id:Array.from({length:n},(_,i)=>i+1),ota_id:Array.from({length:n},(_,i)=>i===0?null:i===1?1:2),daraja:f(2),tartib:f(1),tur:Array.from({length:n},(_,i)=>i<2?i:2),kat:f(0),kod:f(null),nom:f(0),birlik:f(null),hajm:src(2),narx:src(0.3),summa:src(0.6),norma:src(0.2),narx_usul:f(null),versiya:f(1),qoshimcha:f(0),zamena:f(0),xom_qator:{}},
    h:{fakt_hajm:f(0),fakt_summa:f(0),f2_hajm:f(1),f2_summa:f(0.31),f2_summa_nomalum:f(0),direct_fakt_hajm:f(0),fakt_manbasi:f(0),almashtirilgan_hajm:{},almashtirilgan_summa:{}},f2:[],meta:{}};
  p.q.hajm[1]=10;p.q.summa[0]=p.q.summa[1]=15598.8;
  const w=new Worker(new URL(import.meta.url),{workerData:{bundle:pathToFileURL(join(outDir,'worker.mjs')).href}});
  const receive=()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>done(new Error('WORKER_TIMEOUT')),15000);
    const message=x=>done(null,x),error=e=>done(e);
    function done(e,x){clearTimeout(timeout);w.off('message',message);w.off('error',error);e?reject(e):resolve(x)}
    w.once('message',message);w.once('error',error);
  });
  let revision=0,id=0;const times=[];
  async function send(message){const reply=receive(),start=performance.now();w.postMessage({id:++id,epoch:1,revision,...message});
    const r=await reply;assert.equal(r.ok,true,JSON.stringify(r));revision=r.revision;
    times.push({amal:message.amal,computeMs:r.vaqtMs,totalRoundtripMs:performance.now()-start,replyBytes:Buffer.byteLength(JSON.stringify(r)),changed:r.ozgargan});return r;}
  try{
    assert.equal(await receive(),'READY');await send({amal:'och',paket:p});
    for(const price of ['0.4','0.3','0.5'])await send({amal:'tahrir',tahrir:{qator_id:n,maydon:'narx',qiymat:price,kutilgan_versiya:1}});
    const cascade=await send({amal:'tahrir',tahrir:{qator_id:2,maydon:'hajm',qiymat:'2.5',kutilgan_versiya:1}});
    assert.equal(cascade.xulosa.jami,'3899.8');assert.equal(cascade.invalidatsiya,true);
    const rows=await send({amal:'oqi',ids:[n]});assert.equal(rows.qatorlar[0].summa,'0.25');assert.equal(rows.qatorlar[0].f2_summa,0.31);
    console.log(JSON.stringify({rows:n,times,sourceFrozen:true},null,2));
  }finally{await w.terminate()}
}
