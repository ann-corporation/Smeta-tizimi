// M5 LOCAL ONLY. Real BFF handlers + migrated, in-memory PGlite. Password login is an explicit authstub.
import { createServer as httpServer } from 'node:http';
import { randomBytes, randomUUID, webcrypto, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, seed, seedExport, seedExportBilling, seedFakt, rpcArgs } from './fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../../..');
const frontend=resolve(repo,'frontend');
export const PORT=Number(process.env.SMETA_M5_PORT||5216);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw new Error('M5_PORT_INVALID');
export const ORIGIN=`http://127.0.0.1:${PORT}`;
const DB_ORIGIN='https://m5-db.invalid';
const publicFile=process.env.SMETA_M5_PUBLIC_ENV_FILE || `C:/Temp/GAS-M5-${PORT}-public.ps1`;
const pgliteDir=process.env.PGLITE_DIR || 'C:/Temp/hr-pglite/node_modules/@electric-sql/pglite';
const {PGlite}=await import(pathToFileURL(resolve(pgliteDir,'dist/index.js')).href);
const {createServer}=await import(pathToFileURL(resolve(frontend,'node_modules/vite/dist/node/index.js')).href);
const db=new PGlite();
await seed(db);
const migrationFiles=['20261202000000_t2_desktop_auth_v1.sql','20261203001200_t2_desktop_boshqaruv_v1.sql'];
const migrations=[];
for(const name of migrationFiles){const sql=await readFile(resolve(repo,'supabase/migrations',name),'utf8');await db.exec(sql);migrations.push({name,sha256:createHash('sha256').update(sql).digest('hex')});}
const pair=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const pk=Buffer.from(await webcrypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
// Private PKCS8 and HMAC secret remain in memory, never written or included in stats.
const env={SUPABASE_URL:DB_ORIGIN,SUPABASE_KEY:randomBytes(32).toString('base64url'),SESSIYA_KALIT:randomBytes(48).toString('base64url'),
  DESKTOP_LEASE_SK:Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64url'),
  DESKTOP_LEASE_KID:`m5-local-${randomUUID()}`,OBYEKT_PAKET_ETAG:'1',GAS_URL:'https://m5-egress-denied.invalid',GAS_TOKEN:'LOCAL-UNUSED'};
const vite=await createServer({root:frontend,configFile:false,envFile:false,cacheDir:`C:/Temp/Smeta-M5-vite-cache-${PORT}`,logLevel:'error',
  server:{middlewareMode:true,ws:false,hmr:false,watch:null},appType:'custom'});
const modules={};
for(const name of ['qurilma','lease','bff']) modules[name]=await vite.ssrLoadModule(`/functions/api/desktop/${name}.ts`);
const auth=await vite.ssrLoadModule('/functions/_shared/auth.ts');
// Ensure the fixture packet is accepted by the real columnar decoder at startup.
const packetTools=await vite.ssrLoadModule('/src/ombor/paket.ts');
const packetFixture=(await db.query('select paket from public.m5_packet_fixture')).rows[0].paket;
const decodedFixture=packetTools.paketDekod(packetFixture);
// Load only the pure calculation functions. The rest of these migrations need the full business schema.
const defaultsSql=await readFile(resolve(repo,'supabase/migrations/20261014090000_t2_nakrutka_v1.sql'),'utf8');
const cascadeSql=await readFile(resolve(repo,'supabase/migrations/20261116000000_t2_hisob_yadro_sql_moslash_v1.sql'),'utf8');
for(const [sql,names] of [[defaultsSql,['t2_nakrutka_default_v1']],
  [cascadeSql,['_t2_r2_v1','_t2_nakrutka_kaskad_v1','t2_nakrutka_hisobla_v1','t2_nakrutka_koef_jadval_v1']]]){
  for(const name of names){
    const start=sql.indexOf(`create or replace function public.${name}(`);
    const definition=start<0?null:sql.slice(start).match(/^.*?as (\$\w*\$)[\s\S]*?\1;/is)?.[0];
    if(!definition)throw new Error(`M5_MARKUP_FUNCTION_MISSING: ${name}`);
    await db.exec(definition);
  }
}
await seedExport(db,packetTools.paketdanQatorlar(decodedFixture));
await seedExportBilling(db,name=>readFile(resolve(repo,'supabase/migrations',name),'utf8'));
await seedFakt(db,async(file,name)=>{
  const sql=await readFile(resolve(repo,'supabase/migrations',file),'utf8');
  const start=sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  const definition=start<0?null:sql.slice(start).match(/^.*?as (\$\w*\$)[\s\S]*?\1;/is)?.[0];
  if(!definition)throw new Error(`M5_FAKT_FUNCTION_MISSING: ${name}`);
  await db.exec(definition);
});
let offlineMode='online';
const stats={authMode:'authstub',fixtureMode:'canonical-business-fixture',fixture,startedAt:new Date().toISOString(),pid:process.pid,port:PORT,
  migrations,handlers:{},rpc:{},rest:{},adapterErrors:{},unimplementedDbNames:{},unimplementedRoutes:{},httpStatus:{},blockedEgress:0,unimplementedDb:0,handlerErrors:0,offlineRequests:0,
  actualHandlers:['desktop/qurilma','desktop/lease','desktop/bff','api/_middleware (via bff)','api/sessiya (via bff)','api/company (via bff)','api/sb (via bff)','api/obyekt-paket (via bff)'],
  database:'PGlite in-memory; real desktop migration; synthetic actor/business SQL fixtures'};
function count(map,key){map[key]=(map[key]||0)+1;}
function unimplemented(map,name){if(/^[a-z][a-z0-9_]*$/.test(name))count(map,name);stats.unimplementedDb++;}
// Minimal PostgREST DB adapter, not a handler response mock. Preserve every
// duplicate eq/in predicate (caller filter AND the real /sb tenant restriction).
const sqlReadModels={
  t2_obyekt:{columns:['id','nom','kompaniya_id','loyiha_id','asosiy_shartnoma_id'], ids:['id','kompaniya_id'], order:['id','nom','kompaniya_id']},
  t2_obyekt_jami:{columns:['id','nom','kompaniya_id','loyiha_id','asosiy_shartnoma_id'], ids:['id','kompaniya_id'], order:['id','nom','kompaniya_id']},
  t2_qator:{columns:['id','obyekt_id','kompaniya_id','ota_id','daraja','tartib','tur','kod','nom','birlik','hajm','narx','summa','kat','norma','versiya','change_type','replaces_line_id','versiya_holat','almashtirgan_versiya_id'],
    ids:['id','obyekt_id','kompaniya_id'], order:['id','tartib']},
  t2_smeta_versiya:{columns:['id','kompaniya_id','obyekt_id','nom','manba_sana'], ids:['id','obyekt_id','kompaniya_id'], order:['id','manba_sana']},
  t2_nakrutka_podval_royxat:{columns:['id','kompaniya_id','obyekt_id','obyekt','shartnoma_id','shartnoma','nom','qatorlar','versiya','kim','yaratildi','yangilandi'],
    ids:['id','kompaniya_id','obyekt_id','shartnoma_id'], order:['id','yangilandi']},
};
async function sqlRead(url,table){
  const model=sqlReadModels[table];
  const columns=new Set(model.columns);
  const select=url.searchParams.get('select')||'*';
  const selected=select==='*'?[...columns]:select.split(',');
  const values=[],where=[];
  if(!selected.length||!selected.every(c=>columns.has(c)))throw new Error('M5_VIEW_SELECT_UNSUPPORTED');
  for(const [column,filter]of url.searchParams){
    if(['select','order','limit','offset'].includes(column))continue;
    if(table==='t2_qator'&&column==='change_type'&&filter==='not.is.null') { where.push('change_type is not null'); continue; }
    if(table==='t2_qator'&&column==='versiya_holat'&&/^eq\.(faol|almashtirilgan)$/.test(filter)) {
      values.push(filter.slice(3)); where.push(`versiya_holat = $${values.length}`); continue;
    }
    if(!model.ids.includes(column))throw new Error('M5_VIEW_FILTER_UNSUPPORTED');
    const eq=filter.match(/^eq\.([1-9][0-9]*)$/);
    const inside=filter.match(/^in\.\(([1-9][0-9]*(?:,[1-9][0-9]*)*)\)$/);
    if(!eq&&!inside)throw new Error('M5_VIEW_FILTER_UNSUPPORTED');
    const ids=(eq?[eq[1]]:inside[1].split(',')).map(Number);
    if(ids.length>100||!ids.every(Number.isSafeInteger))throw new Error('M5_VIEW_FILTER_UNSUPPORTED');
    const placeholders=ids.map(id=>{values.push(id);return '$'+values.length;});
    where.push(`${column} in (${placeholders.join(',')})`);
  }
  const order=url.searchParams.get('order')||'id.asc';
  const ordering=order.split(',').map(part=>{
    const m=part.match(/^([a-z_]+)\.(asc|desc)$/);
    if(!m||!model.order.includes(m[1]))throw new Error('M5_VIEW_ORDER_UNSUPPORTED');
    return `${m[1]} ${m[2]}`;
  });
  const limit=Number(url.searchParams.get('limit')??5000),offset=Number(url.searchParams.get('offset')??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>200000||!Number.isSafeInteger(offset)||offset<0)throw new Error('M5_VIEW_PAGE_UNSUPPORTED');
  const clause=where.length?' where '+where.join(' and '):'';
  const result=await db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    const total=(await tx.query(`select count(*)::int total from public.${table}${clause}`,values)).rows[0].total;
    const data=await tx.query(`select to_jsonb(r) as row from (select ${selected.join(',')} from public.${table}${clause}
      order by ${ordering.join(',')} limit $${values.length+1} offset $${values.length+2}) r`,[...values,limit,offset]);
    const rows=data.rows.map(x=>x.row);
    return {total,rows};
  });
  count(stats.rest,table);
  return Response.json(result.rows,{headers:{'Content-Range':result.rows.length?`${offset}-${offset+result.rows.length-1}/${result.total}`:`*/${result.total}`}});
}
async function packetView(url,table){
  const raw=packetTools.paketdanQatorlar(decodedFixture).map(r=>({...r,kompaniya_id:fixture.company}));
  const current=table==='t2_qator_holat'?packetTools.paketDekod((await db.query('select paket from public.m5_packet_fixture where obyekt_id=$1',[fixture.object])).rows[0].paket):decodedFixture;
  const state=packetTools.paketdanHolatlar(current).map(r=>({...r,obyekt_id:fixture.object,kompaniya_id:fixture.company}));
  const acts=decodedFixture.f2.map(a=>({id:a.akt_id,obyekt_id:fixture.object,kompaniya_id:fixture.company,obyekt:'M5 SYNTHETIC OBJECT',tur:'f2',raqam:a.raqam,oy:a.oy,holat:a.holat,lifecycle_status:a.lifecycle_status,fayl_id:null,izoh:null,yaratildi:'2026-11-05T00:00:00Z',hujjat_jami:a.hujjat_jami,yozilgan_jami:null,qator_soni:1,narxsiz_qator:null,manfiy_qator:null,farq:null,reestr_holat:'noaniq',versiya:a.versiya,manba_bor:false,manba:null,import_job_id:null,hujjat_id:null}));
  const projects=[{id:301,kompaniya_id:fixture.company,nom:'M5 SYNTHETIC PROJECT',izoh:null,hudud:null,byudjet:null,holat:'faol',versiya:1,yaratildi:'2026-11-05T00:00:00Z',obyektlar:[{obyekt_id:fixture.object,obyekt_nom:'M5 SYNTHETIC OBJECT'}],obyekt_soni:1,qatnashchilar:[]}];
  let rows=table==='t2_daraxt'?raw:table==='t2_qator_holat'?state:table==='t2_akt_reestr'?acts:projects;
  const keys=new Set(Object.keys(rows[0]||{}));
  for(const [col,filter]of url.searchParams){
    if(['select','order','limit','offset'].includes(col))continue;
    const m=filter.match(/^(eq|gt|gte|lte)\.([1-9][0-9]*)$/),inside=filter.match(/^in\.\(([1-9][0-9]*(?:,[1-9][0-9]*)*)\)$/),textEq=filter.match(/^eq\.([a-z0-9_-]+)$/);
    if((!m&&!inside&&!textEq)||!keys.has(col)||!['obyekt_id','kompaniya_id','id','qator_id','tur'].includes(col))throw new Error('M5_PACKET_FILTER_UNSUPPORTED');
    if(inside){const ids=inside[1].split(',').map(Number);rows=rows.filter(row=>ids.includes(row[col]));}
    else if(textEq&&!m)rows=rows.filter(row=>row[col]===textEq[1]);
    else {const value=Number(m[2]);rows=rows.filter(row=>m[1]==='eq'?row[col]===value:m[1]==='gt'?row[col]>value:m[1]==='gte'?row[col]>=value:row[col]<=value);}
  }
  const select=url.searchParams.get('select')||'*',selected=select==='*'?[...keys]:select.split(',');
  if(!selected.every(c=>keys.has(c)))throw new Error('M5_PACKET_SELECT_UNSUPPORTED');
  const order=url.searchParams.get('order')||(table==='t2_qator_holat'?'qator_id.asc':table==='t2_akt_reestr'?'oy.desc':table==='t2_loyiha_royxat'?'yaratildi.desc':'id.asc');
  const orderCols=order.split(',').map(s=>s.match(/^(id|qator_id|tartib|oy|yaratildi)\.(asc|desc)$/));
  if(orderCols.some(m=>!m||!keys.has(m[1])))throw new Error('M5_PACKET_ORDER_UNSUPPORTED');
  rows.sort((a,b)=>{for(const m of orderCols){const av=a[m[1]],bv=b[m[1]],d=typeof av==='string'?String(av).localeCompare(String(bv)):((av??Infinity)-(bv??Infinity));if(d)return m[2]==='desc'?-d:d;}return 0;});
  const limit=Number(url.searchParams.get('limit')||200000),offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>200000||!Number.isSafeInteger(offset)||offset<0)throw new Error('M5_PACKET_PAGE_UNSUPPORTED');
  const total=rows.length;rows=rows.slice(offset,offset+limit).map(row=>Object.fromEntries(selected.map(c=>[c,row[c]])));
  count(stats.rest,table);
  return Response.json(rows,{headers:{'Content-Range':rows.length?`${offset}-${offset+rows.length-1}/${total}`:`*/${total}`} });
}
async function rpc(name,args){
  if(!Object.hasOwn(rpcArgs,name)){unimplemented(stats.unimplementedDbNames,name);return Response.json({ok:false,code:'M5_FIXTURE_RPC_UNIMPLEMENTED'},{status:501});}
  count(stats.rpc,name);
  const keys=rpcArgs[name];
  const values=keys.map(k=>args[k]??null);
  const result=await db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    const tag=name==='t2_obyekt_paket_etag_v1'?', public.t2_obyekt_paket_muhr_v1($1,$2) etag':'';
    return tx.query(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) result${tag}`,values);
  });
  const value=result.rows[0]?.result;
  const etag=result.rows[0]?.etag;
  return Response.json(value??null,{headers:etag?{ETag:etag}:{}});
}
// No outbound network fallback, including accidental GAS or production URLs.
globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init); const url=new URL(req.url);
  if(url.origin!==DB_ORIGIN){stats.blockedEgress++;throw new Error('M5_EGRESS_DENIED');}
  const match=url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  if(match){
    const args=req.method==='GET'?Object.fromEntries(url.searchParams):await req.json();
    return rpc(match[1],args);
  }
  const table=url.pathname.split('/').pop();
  if(Object.hasOwn(sqlReadModels,table)&&req.method==='GET')return sqlRead(url,table);
  if(['t2_daraxt','t2_qator_holat','t2_akt_reestr','t2_loyiha_royxat'].includes(url.pathname.split('/').pop())&&req.method==='GET'){
    try{return await packetView(url,url.pathname.split('/').pop());}
    catch(error){const code=error instanceof Error&&/^M5_[A-Z_]+$/.test(error.message)?error.message:'M5_PACKET_ADAPTER_ERROR';count(stats.adapterErrors,code);throw error;}
  }
  unimplemented(stats.unimplementedDbNames,url.pathname.split('/').pop()||'unknown_table');
  return Response.json({ok:false,code:'M5_FIXTURE_TABLE_UNIMPLEMENTED'},{status:501});
};
async function snapshot(){
  const r=await db.query('select count(*)::int devices,count(*) filter(where bekor is not null)::int revoked from public.t2_desktop_qurilma');
  return {...stats,offlineMode,...r.rows[0],publicBuildEnvFile:publicFile,localOnly:true,liveAcceptance:false};
}
async function control(request,url){
  if(url.pathname==='/_test/stats' && request.method==='GET')return Response.json(await snapshot());
  if(request.method!=='POST'||request.headers.get('X-M5-Control')!=='local-synthetic')return Response.json({ok:false,code:'M5_CONTROL_REQUIRED'},{status:403});
  const body=await request.json();
  if(url.pathname==='/_test/offline'){
    const mode=body.mode ?? (body.offline===true?'503':body.offline===false?'online':null);
    if(!['online','503','abort'].includes(mode))return Response.json({ok:false},{status:400});
    offlineMode=mode;return Response.json({ok:true,offlineMode});
  }
  return Response.json({ok:false},{status:404});
}
async function dispatch(request){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/_test/'))return control(request,url);
  if(request.method==='POST'&&url.pathname==='/api/kirish'){
    count(stats.handlers,'kirish-authstub');
    const b=await request.json();
    if(request.headers.get('Origin')!==ORIGIN||b.login!=='m5-synthetic'||b.parol!=='M5-synthetic-only!')return Response.json({ok:false,authstub:true},{status:401});
    const token=await auth.imzola({rol:'pto',email:'m5-synthetic',foydalanuvchi_id:1,kompaniyalar:[{kompaniya_id:1,rol:'pto'}]},env.SESSIYA_KALIT);
    return Response.json({ok:true,rol:'pto',authstub:true},{headers:{'Set-Cookie':`sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`,'X-M5-Auth-Mode':'authstub'}});
  }
  const name=url.pathname.match(/^\/api\/desktop\/(qurilma|lease|bff)$/)?.[1];
  const handler=name&&modules[name][request.method==='POST'?'onRequestPost':request.method==='DELETE'?'onRequestDelete':''];
  if(!handler){const route=url.pathname.replace(/^\/api\//,'').replace(/[^a-z0-9_]/g,'_');if(/^[a-z][a-z0-9_]*$/.test(route))count(stats.unimplementedRoutes,route);return Response.json({ok:false,code:'M5_ROUTE_NOT_IMPLEMENTED'},{status:404});}
  count(stats.handlers,name);
  return handler({request,env,data:{},params:{},waitUntil(p){p.catch(()=>{stats.handlerErrors++;});},next(){throw new Error('M5_UNEXPECTED_NEXT');}});
}
const server=httpServer(async(req,res)=>{
  try{
    if(req.headers.host!==`127.0.0.1:${PORT}`){res.writeHead(400);res.end();return;}
    const url=new URL(req.url,ORIGIN);
    if(url.origin!==ORIGIN){res.writeHead(400);res.end();return;}
    if(req.headers.origin && ![ORIGIN,'http://tauri.localhost'].includes(req.headers.origin)){res.writeHead(403);res.end();return;}
    if(!url.pathname.startsWith('/_test/')&&offlineMode!=='online'){
      stats.offlineRequests++;
      if(offlineMode==='abort'){req.socket.destroy();return;}
      count(stats.httpStatus,503);res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"M5_SIMULATED_OFFLINE"}');return;
    }
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await dispatch(request);
    count(stats.httpStatus,response.status);
    res.statusCode=response.status;
    for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{stats.handlerErrors++;if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"M5_LOCAL_HANDLER_ERROR"}');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(PORT,'127.0.0.1',ok);});
await writeFile(publicFile,[`# SYNTHETIC M5 LOCAL public build settings. Private keys are only in the running server.`,
  `$env:SMETA_DESKTOP_BFF_ORIGIN='${ORIGIN}'`,`$env:VITE_DESKTOP_LEASE_PK='${pk}'`,`$env:VITE_DESKTOP_LEASE_KID='${env.DESKTOP_LEASE_KID}'`,''].join('\r\n'));
console.log(JSON.stringify({ready:true,origin:ORIGIN,port:PORT,pid:process.pid,authMode:'authstub',fixture,publicBuildEnvFile:publicFile,liveAcceptance:false}));
async function stop(){server.closeAllConnections();await new Promise(ok=>server.close(ok));await vite.close();await db.close();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
