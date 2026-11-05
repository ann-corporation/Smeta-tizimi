// M5 LOCAL ONLY. Real BFF handlers + migrated, in-memory PGlite. Password login is an explicit authstub.
import { createServer as httpServer } from 'node:http';
import { randomBytes, randomUUID, webcrypto, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, etag, seed, rpcArgs } from './fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../../..');
const frontend=resolve(repo,'frontend');
export const ORIGIN='http://127.0.0.1:5214';
const DB_ORIGIN='https://m5-db.invalid';
const publicFile='C:/Temp/GAS-M5-local-public.ps1';
const pgliteDir=process.env.PGLITE_DIR || 'C:/Temp/hr-pglite/node_modules/@electric-sql/pglite';
const {PGlite}=await import(pathToFileURL(resolve(pgliteDir,'dist/index.js')).href);
const {createServer}=await import(pathToFileURL(resolve(frontend,'node_modules/vite/dist/node/index.js')).href);
const db=new PGlite();
await seed(db);
const migrationFile=resolve(repo,'supabase/migrations/20261202000000_t2_desktop_auth_v1.sql');
const migration=await readFile(migrationFile,'utf8');
await db.exec(migration);
const pair=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const pk=Buffer.from(await webcrypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
// Private PKCS8 and HMAC secret remain in memory, never written or included in stats.
const env={SUPABASE_URL:DB_ORIGIN,SUPABASE_KEY:randomBytes(32).toString('base64url'),SESSIYA_KALIT:randomBytes(48).toString('base64url'),
  DESKTOP_LEASE_SK:Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64url'),
  DESKTOP_LEASE_KID:`m5-local-${randomUUID()}`,OBYEKT_PAKET_ETAG:'1',GAS_URL:'https://m5-egress-denied.invalid',GAS_TOKEN:'LOCAL-UNUSED'};
const vite=await createServer({root:frontend,configFile:false,envFile:false,cacheDir:'C:/Temp/Smeta-M5-vite-cache',logLevel:'error',
  server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
const modules={};
for(const name of ['qurilma','lease','bff']) modules[name]=await vite.ssrLoadModule(`/functions/api/desktop/${name}.ts`);
const auth=await vite.ssrLoadModule('/functions/_shared/auth.ts');
const authority=await vite.ssrLoadModule('/functions/_shared/role-authority.ts');
const leaseTools=await vite.ssrLoadModule('/functions/_shared/desktop-lease.ts');
// Ensure the fixture packet is accepted by the real columnar decoder at startup.
const packetTools=await vite.ssrLoadModule('/src/ombor/paket.ts');
const packetFixture=(await db.query('select paket from public.m5_packet_fixture')).rows[0].paket;
packetTools.paketDekod(packetFixture);
let offlineMode='online';
const stats={authMode:'authstub',fixtureMode:'canonical-business-fixture',fixture,startedAt:new Date().toISOString(),pid:process.pid,
  migration:'20261202000000_t2_desktop_auth_v1.sql',migrationSha256:createHash('sha256').update(migration).digest('hex'),
  handlers:{},rpc:{},rest:{},httpStatus:{},blockedEgress:0,unimplementedDb:0,handlerErrors:0,offlineRequests:0,
  actualHandlers:['desktop/qurilma','desktop/lease','desktop/bff','api/_middleware (via bff)','api/sessiya (via bff)','api/company (via bff)','api/sb (via bff)','api/obyekt-paket (via bff)'],
  database:'PGlite in-memory; real desktop migration; synthetic actor/business SQL fixtures'};
function count(map,key){map[key]=(map[key]||0)+1;}
// Minimal PostgREST DB adapter, not a handler response mock. Preserve every
// duplicate eq/in predicate (caller filter AND the real /sb tenant restriction).
async function objectView(url){
  const columns=new Set(['id','nom','kompaniya_id']);
  const select=url.searchParams.get('select')||'*';
  const selected=select==='*'?['id','nom','kompaniya_id']:select.split(',');
  const values=[],where=[];
  if(!selected.length||!selected.every(c=>columns.has(c)))throw new Error('M5_VIEW_SELECT_UNSUPPORTED');
  for(const [column,filter]of url.searchParams){
    if(['select','order','limit','offset'].includes(column))continue;
    if(!['id','kompaniya_id'].includes(column))throw new Error('M5_VIEW_FILTER_UNSUPPORTED');
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
    const m=part.match(/^(id|nom|kompaniya_id)\.(asc|desc)$/);
    if(!m)throw new Error('M5_VIEW_ORDER_UNSUPPORTED');
    return `${m[1]} ${m[2]}`;
  });
  const limit=Number(url.searchParams.get('limit')??5000),offset=Number(url.searchParams.get('offset')??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>200000||!Number.isSafeInteger(offset)||offset<0)throw new Error('M5_VIEW_PAGE_UNSUPPORTED');
  const clause=where.length?' where '+where.join(' and '):'';
  const result=await db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    const total=(await tx.query('select count(*)::int total from public.t2_obyekt_jami'+clause,values)).rows[0].total;
    const rows=(await tx.query(`select ${selected.join(',')} from public.t2_obyekt_jami${clause} order by ${ordering.join(',')} limit $${values.length+1} offset $${values.length+2}`,[...values,limit,offset])).rows;
    return {total,rows};
  });
  count(stats.rest,'t2_obyekt_jami');
  return Response.json(result.rows,{headers:{'Content-Range':result.rows.length?`${offset}-${offset+result.rows.length-1}/${result.total}`:`*/${result.total}`}});
}
async function rpc(name,args){
  if(!Object.hasOwn(rpcArgs,name)){stats.unimplementedDb++;return Response.json({ok:false,code:'M5_FIXTURE_RPC_UNIMPLEMENTED'},{status:501});}
  count(stats.rpc,name);
  const keys=rpcArgs[name];
  const values=keys.map(k=>args[k]??null);
  const result=await db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    return tx.query(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) result`,values);
  });
  const value=result.rows[0]?.result;
  return Response.json(value??null,{headers:name==='t2_obyekt_paket_etag_v1'?{ETag:etag}:{}});
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
  if(url.pathname==='/rest/v1/t2_obyekt_jami'&&req.method==='GET')return objectView(url);
  if(url.pathname==='/rest/v1/t2_obyekt' && req.method==='GET'){
    const id=url.searchParams.get('id')?.match(/^eq\.(\d+)$/)?.[1];
    if(!id)return Response.json([]);
    const result=await db.query('select id::int,kompaniya_id::int,nom from public.t2_obyekt where id=$1',[id]);
    return Response.json(result.rows);
  }
  stats.unimplementedDb++;
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
  if(url.pathname==='/_test/revoke'){
    const actor=body.actor??body.foydalanuvchi_id;
    if(![1,2].includes(actor))return Response.json({ok:false},{status:400});
    const rows=await db.query('select device_id from public.t2_desktop_qurilma where foydalanuvchi_id=$1 and bekor is null',[actor]);
    for(const row of rows.rows){const r=await rpc('t2_desktop_qurilma_bekor_v1',{p_actor_id:actor,p_device_id:row.device_id,p_operation_id:randomUUID()});if(!(await r.json()).ok)throw new Error('M5_REVOKE_FAILED');}
    authority.vakolatKeshTozala(actor);
    return Response.json({ok:true,actor,revoked:rows.rows.length});
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
  if(!handler)return Response.json({ok:false,code:'M5_ROUTE_NOT_IMPLEMENTED'},{status:404});
  count(stats.handlers,name);
  return handler({request,env,data:{},params:{},waitUntil(p){p.catch(()=>{stats.handlerErrors++;});},next(){throw new Error('M5_UNEXPECTED_NEXT');}});
}
const server=httpServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:5214'){res.writeHead(400);res.end();return;}
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
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(5214,'127.0.0.1',ok);});
await writeFile(publicFile,[`# SYNTHETIC M5 LOCAL public build settings. Private keys are only in the running server.`,
  `$env:SMETA_DESKTOP_BFF_ORIGIN='${ORIGIN}'`,`$env:VITE_DESKTOP_LEASE_PK='${pk}'`,`$env:VITE_DESKTOP_LEASE_KID='${env.DESKTOP_LEASE_KID}'`,''].join('\r\n'));
console.log(JSON.stringify({ready:true,origin:ORIGIN,pid:process.pid,authMode:'authstub',fixture,publicBuildEnvFile:publicFile,liveAcceptance:false}));
async function stop(){server.closeAllConnections();await new Promise(ok=>server.close(ok));await vite.close();await db.close();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
