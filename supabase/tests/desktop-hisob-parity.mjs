/** Lokal PGlite: haqiqiy repo SQL functionlari ↔ hisob-yadro. Tarmoqqa/prodga ulanmaydi. */
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=await import(pathToFileURL(join(root,'frontend/node_modules/vite/dist/node/index.js')).href);
const runtime=process.env.PGLITE_DIR;
if(!runtime)throw new Error('PGLITE_DIR local runtime path required');
const {PGlite}=await import(pathToFileURL(join(resolve(runtime),'dist/index.js')).href);
const output=await mkdtemp(join(tmpdir(),'smeta-d3-parity-'));
await build({root:join(root,'frontend'),configFile:false,logLevel:'error',build:{outDir:output,emptyOutDir:false,
  lib:{entry:'src/lib/hisob-yadro/daraxt-yigish.ts',formats:['es'],fileName:()=>'yadro.mjs'}}});
const {DaraxtHisob}=await import(pathToFileURL(join(output,'yadro.mjs')).href);
const db=new PGlite();
await db.exec(`create table t2_qator(id bigint primary key,obyekt_id bigint default 1,ota_id bigint,tur text,hajm numeric,narx numeric,summa numeric,norma numeric,versiya integer default 1,versiya_holat text default 'faol',nom text,birlik text,kat text,narx_usul text,yangilandi timestamptz);
create function t2_manba_belgila(text) returns void language sql as 'select';`);
const sql=await readFile(join(root,'supabase/migrations/20261021100000_t2_smeta_norma_cascade_v1.sql'),'utf8');
const tahrir=sql.match(/create or replace function public\.t2_qator_tahrir\([\s\S]*?end \$\$;/i)?.[0];
assert(tahrir,'actual SQL tahrir function not found');
await db.exec(tahrir);
await db.exec(await readFile(join(root,'supabase/migrations/20261115100000_t2_rollup_faqat_ozgarganini_v1.sql'),'utf8'));
const q=(id,ota_id,tur,hajm,narx,summa,norma=null)=>({id,ota_id,tur,hajm,narx,summa,norma,versiya:1});
const rows=[q(1,null,'rz',null,null,'100'),q(2,1,'rz',null,null,'50'),q(3,1,'bl','10',null,'30'),
 q(4,3,'rs','2','0.3','0.6','0.2'),q(5,3,'rs','3',null,null,null),q(6,3,'mat','1','2','2','0.1'),
 q(7,2,'mat','5','4','20'),q(8,2,'rs','2','6','12'),q(9,2,'ob','1','3','3'),
 q(10,2,'bl','2','3','6'),q(11,1,'bl','3','5','15'),q(12,11,'mat','1','2','2'),q(13,null,'mat','1','8','8')];
for(const r of rows)await db.query('insert into t2_qator(id,ota_id,tur,hajm,narx,summa,norma) values($1,$2,$3,$4,$5,$6,$7)',[r.id,r.ota_id,r.tur,r.hajm,r.narx,r.summa,r.norma]);
const core=new DaraxtHisob([...rows].reverse()); // map identity, array pozitsiyasi emas
const ids=rows.map(r=>r.id);
const normal=x=>x==null?null:String(x).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace(/^-0$/,'0');
let checks=0;
async function compare(){
  const ref=(await db.query('select id,hajm::text,narx::text,summa::text,norma::text from t2_qator order by id')).rows;
  const actual=core.ol(ids);
  for(let i=0;i<ref.length;i++)for(const k of ['hajm','narx','summa','norma'])assert.equal(normal(actual[i][k]),normal(ref[i][k]),`row${ref[i].id}.${k}`);
  const summary=(await db.query("select sum(summa)::text jami,count(*) filter(where tur in('rs','mat','ob') and narx is null)::int narxsiz from t2_qator where versiya_holat='faol'")).rows[0];
  // Jami faqat RZ; narxsiz count barcha barglardan.
  const jami=(await db.query("select sum(summa)::text jami from t2_qator where tur='rz' and versiya_holat='faol'")).rows[0].jami;
  assert.equal(normal(core.xulosa().jami),normal(jami));assert.equal(core.xulosa().narxsiz_qator,summary.narxsiz);checks++;
}
try{
  await compare();
  const values=[null,'0','-1.25','0.123456789123456789','2','3.001'];
  let seed=7145;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<240;i++){
    const id=ids[rand()%ids.length],maydon=i%2?'hajm':'narx',qiymat=values[rand()%values.length];
    const r=(await db.query("select t2_qator_tahrir($1,$2,$3,1,'sinov','fixture') r",[id,maydon,qiymat])).rows[0].r;
    assert.equal(r.ok,true);core.tahrir({qator_id:id,maydon,qiymat,kutilgan_versiya:1});await compare();
  }
  console.log(JSON.stringify({checks,mutations:240,status:'PASS',scope:'disposable actual SQL function parity; active rows; version trigger not simulated'}));
}finally{await db.close()}
