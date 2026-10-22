import { tekshir } from '../_shared/auth';
import { roleAuthority } from '../_shared/role-authority';
import { SCOPED_APIS, requestPermission, yopiqModul } from '../_shared/permission-policy';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL:string; SUPABASE_KEY:string; SESSIYA_KALIT:string };
const positive = (v:unknown) => Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v) : null;
const fail = (code:string, status=403) => Response.json({ok:false,code,error:code==='AUTH_REQUIRED'?'Tizimga qayta kiring.':'Bu amal uchun ruxsatingiz yo‘q yoki ruxsatlar yangilangan.'},{status});

/** Mandatory tenant feature gate; underlying endpoints retain ownership/version/business validation. */
export const onRequest: PagesFunction<Env> = async ctx => {
  const url = new URL(ctx.request.url);
  let api:string;
  try { api=decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||''); } catch { return fail('PATH_INVALID',400); }
  if (!SCOPED_APIS.has(api)) return ctx.next();
  if (api==='agent-ish' && ctx.request.headers.has('X-Kuzatuv-Kalit')) return ctx.next(); // Existing key auth + action whitelist remains mandatory inside that endpoint.
  const verified = await tekshir(ctx.request.headers.get('Cookie'),ctx.env.SESSIYA_KALIT);
  if (!verified) return fail('AUTH_REQUIRED',401);
  const authority = await roleAuthority(verified,ctx.env);
  if (!authority) return fail('AUTHORITY_UNAVAILABLE',503);
  ctx.data.roleAuthority = authority;
  let b:Record<string,unknown>={};
  const contentType=ctx.request.headers.get('Content-Type')||'';
  if (ctx.request.method==='POST' && !/multipart\/form-data|application\/octet-stream/i.test(contentType)) {
    try { const parsed=await ctx.request.clone().json(); if (parsed && typeof parsed==='object' && !Array.isArray(parsed)) b=parsed as Record<string,unknown>; }
    catch { return fail('BODY_INVALID',400); }
  } else if (ctx.request.method==='POST' && !['hujjat-yukla','smeta-yukla'].includes(api)) {
    return fail('BODY_INVALID',400);
  }
  const permission=requestPermission(api,ctx.request.method,b,url.searchParams);
  if (!permission) return ctx.next();
  if (permission==='command.unregistered') return fail('PERMISSION_DENIED');
  /* L0 2026-10-22: modul holati alohida so'rov bilan OLINMAYDI (Codex 17eecd54 qaytarilgan). T4: u t2_men_v1 javobida
   * (`modullarOffByCompany`), 60 s keshlangan — tekshiruv pastda, ruxsatdan keyin. */
  if (authority.rol==='superadmin') return ctx.next(); // Fresh DB fact, not a cookie role or membership label.
  if (permission.startsWith('control.global')) return fail('PLATFORM_ROLE_REQUIRED');
  if (!authority.permissionsByCompany) return fail('AUTHORITY_SCHEMA_REQUIRED',503);
  const targets=new Set<number>();
  if(api==='company') for(const key of ['profile','azolik_ruxsatlari']) { const id=positive(url.searchParams.get(key)); if(id)targets.add(id); }
  for (const key of ['kompaniya_id','company_id','tenant_id']) {
    const id=positive(b[key] ?? url.searchParams.get(key)); if (id) targets.add(id);
  }
  const filter=String(b.filtr||'');
  const companyFilter=filter.match(/(?:^|&)kompaniya_id=eq\.(\d+)(?=&|$)/);
  if (companyFilter) targets.add(Number(companyFilter[1]));
  // Resolve entity ownership even if a caller also supplies an allowed company_id.
  const entities:Record<string,string>={obyekt_id:'t2_obyekt',obyekt:'t2_obyekt',loyiha_id:'t2_loyiha',qator_id:'t2_qator',akt_id:'t2_akt',job_id:'t2_f2_import_job',document_id:'t2_document_registry',azolik_id:'t2_azolik'};
  for (const [key,table] of Object.entries(entities)) {
    const filterId=filter.match(new RegExp(`(?:^|&)${key}=eq\\.(\\d+)(?=&|$)`))?.[1];
    const id=positive(b[key] ?? url.searchParams.get(key) ?? filterId); if (!id) continue;
    try {
      const r=await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL)+`/rest/v1/${table}?id=eq.${id}&select=kompaniya_id&limit=1`,{headers:{apikey:ctx.env.SUPABASE_KEY,Authorization:'Bearer '+ctx.env.SUPABASE_KEY}});
      if (!r.ok) return fail('SCOPE_UNAVAILABLE',503);
      const rows=await r.json() as {kompaniya_id:number}[]; const company=positive(rows[0]?.kompaniya_id);
      if (!company) return fail('TARGET_SCOPE_INVALID'); targets.add(company);
    } catch { return fail('SCOPE_UNAVAILABLE',503); }
  }
  const candidates=targets.size?[...targets]:(authority.kompaniyalar??[]).map(a=>a.kompaniya_id);
  // Missing scope may never pick a more privileged company. All possible targets must permit it.
  if (!candidates.length || !candidates.every(id=>authority.permissionsByCompany![id]?.includes('company.read')&&authority.permissionsByCompany![id]?.includes(permission))) return fail('PERMISSION_DENIED');
  // T4: modul holati keshlangan vakolat ichida (qo'shimcha so'rov yo'q). Faqat yozish; o'qish va PTO yadrosi ochiq.
  const modul=yopiqModul(permission,candidates,authority.modullarOffByCompany);
  if (modul) return Response.json({ok:false,code:'MODULE_DISABLED',modul,error:'Bu modul ish joyingizda o‘chirilgan. Uni Kompaniya → Modullar bo‘limida yoqish mumkin.'},{status:403});
  // General AI/GAS can aggregate several domains. Explicitly restricted staff cannot use it to bypass a deny.
  if (['agent-ish','agent-control','ai-savol','ai-parse','smeta-ai','smeta-narx-agent'].includes(api)) {
    const readOnly=['savol','kasb_savol','veb_tahlil','veb_ol','rivojlanish_tahlil','qadam_taklif','bilim_yigish','royxat','ol','holat'];
    const mayAct=(api==='agent-control'||api==='agent-ish')&&ctx.request.method!=='GET'&&!readOnly.includes(String(b.amal||b.action||''));
    if(candidates.some(id=>(authority.explicitDenialsByCompany?.[id]??[]).some(p=>p.endsWith('.read')||mayAct))) return fail('SCOPED_AI_REQUIRED');
  }
  if (targets.size===1) {
    const companyRole=authority.kompaniyalar?.find(a=>a.kompaniya_id===[...targets][0])?.rol;
    if (companyRole) ctx.data.roleAuthority={...authority,rol:companyRole};
  }
  return ctx.next();
};
