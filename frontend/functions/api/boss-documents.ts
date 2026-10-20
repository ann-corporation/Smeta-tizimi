import {boundedText} from '../_shared/boss-read';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream,xavfsizXato } from '../_shared/xato';
type Env={SUPABASE_URL:string;SUPABASE_KEY:string;SESSIYA_KALIT:string};
export const onRequestGet:PagesFunction<Env>=async ctx=>{
 try {
  const sess=await tekshir(ctx.request.headers.get('Cookie'),ctx.env.SESSIYA_KALIT);
  if(!sess?.foydalanuvchi_id)return Response.json({ok:false,code:'AUTH_REQUIRED'},{status:401});
  const params=new URL(ctx.request.url).searchParams;
  const positive=(key:string)=>{const raw=params.get(key);if(raw==null)return null;const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:NaN;};
  const company=positive('kompaniya_id'),project=positive('loyiha_id'),object=positive('obyekt_id'),before=positive('before');
  const without=params.get('without_project');
  if(!company||[company,project,object,before].some(n=>n!==null&&!Number.isFinite(n))||(without!==null&&without!=='true')||(without&&project))return Response.json({ok:false,code:'INVALID_INPUT'},{status:400});
  if(!ctx.env.SUPABASE_URL||!ctx.env.SUPABASE_KEY)return Response.json({ok:false,code:'CONFIG'},{status:500});
  const r=await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL)+'/rest/v1/rpc/t2_boss_documents_v1',{
   method:'POST',signal:AbortSignal.timeout(30000),headers:{apikey:ctx.env.SUPABASE_KEY,Authorization:'Bearer '+ctx.env.SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({p_kompaniya_id:company,p_actor_id:sess.foydalanuvchi_id,p_loyiha_id:project,p_obyekt_id:object,p_before_id:before,p_without_project:without==='true',p_limit:50}),
  });
  // At most 50 short metadata rows per named RPC. No R2 bytes or credentials returned.
  const j=JSON.parse(await boundedText(r));
  if(!r.ok||j?.ok!==true){if(j?.code==='PGRST202')return Response.json({ok:false,code:'BOSS_DOCUMENTS_NOT_CONNECTED'},{status:503});return xavfsizUpstream(r.status,j,502);}
  return Response.json(j,{headers:{'Cache-Control':'no-store'}});
 } catch(e){return xavfsizXato('BOSS_DOCUMENTS_FAILED',500,e instanceof Error?e.message:String(e));}
};
