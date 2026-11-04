/** node src/ombor/hisob-thread-smoke.mjs — sintetik haqiqiy thread smoke.
 * Vite production bundle ishlatiladi; Node parentPort faqat WebWorker port adapteri.
 * Brauzer UI yoki tahrir→rollup acceptance o‘rnini bosmaydi.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
if (!isMainThread) {
  globalThis.postMessage = x => parentPort.postMessage(x);
  await import(workerData.bundle);
  parentPort.on('message', data => globalThis.onmessage({ data }));
  parentPort.postMessage('READY');
} else {
  const { build } = await import('vite');
  const outDir = await mkdtemp(join(tmpdir(), 'smeta-d3-worker-'));
  await build({ configFile:false, root:fileURLToPath(new URL('../../', import.meta.url)), logLevel:'error',
    build:{outDir, emptyOutDir:false, lib:{entry:'src/ombor/hisob.worker.ts',formats:['es'],fileName:()=>'hisob.mjs'},minify:true} });
  const n=26_000, f=x=>Array(n).fill(x);
  const p={format:'t2-paket/1',obyekt_id:1,obyekt_nom:'SINOV',kompaniya_id:1,soni:n,
    lugat:{nom:['SINOV'],kod:['TEST'],birlik:['M3'],tur:['mat'],kat:['МАТ']},
    q:{id:Array.from({length:n},(_,i)=>i+1),ota_id:f(null),daraja:f(0),tartib:f(1),tur:f(0),kat:f(0),kod:f(0),nom:f(0),birlik:f(0),hajm:f(10),narx:f(7),summa:f(70),norma:f(null),narx_usul:f(null),versiya:f(1),qoshimcha:f(0),zamena:f(0),xom_qator:{}},
    h:{fakt_hajm:f(8),fakt_summa:f(56),f2_hajm:f(3),f2_summa:f(20.03),f2_summa_nomalum:f(0),direct_fakt_hajm:f(8),fakt_manbasi:f(0),almashtirilgan_hajm:{},almashtirilgan_summa:{}},f2:[],meta:{}};
  const w=new Worker(new URL(import.meta.url),{workerData:{bundle:pathToFileURL(join(outDir,'hisob.mjs')).href}});
  const receive=()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>finish(new Error('WORKER_TIMEOUT')),15_000);
    const message=x=>finish(null,x), error=e=>finish(e);
    function finish(e,x){clearTimeout(timeout);w.off('message',message);w.off('error',error);e?reject(e):resolve(x)}
    w.once('message',message); w.once('error',error);
  });
  const times=[];
  try {
    assert.equal(await receive(),'READY');
    for(let i=0;i<4;i++){
      const reply=receive(), start=performance.now();
      w.postMessage({id:i,epoch:1,revision:1,paket:p});
      const r=await reply;
      assert.equal(r.ok,true); assert.equal(r.holatlar.length,n);
      assert.equal(r.holatlar[n-1].f2_summa,20.03);
      times.push({computeMs:r.vaqtMs,totalRoundtripMs:performance.now()-start});
    }
    console.log(JSON.stringify({rows:n,sourceFrozen:true,times},null,2));
  } finally {await w.terminate()}
}
