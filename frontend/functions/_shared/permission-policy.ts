/** Named business permission classification. Neither row order nor caller-supplied permission is trusted. */
export function dataPermission(name: string, write: boolean, body: Record<string, unknown> = {}): string {
  const n = name.replace(/^t2_/, '');
  if (['erp_amal','sozlama_saqla','kirish_amal','taklif_yubor','taklif_qabul'].includes(n)) return 'control.company.write';
  if (n==='token_sarfla_v1'||n==='token_qaytar_v1') return 'company.read';
  if (/platforma_|token_toldir|obuna_belgila|tizim_amal/.test(n)) return write ? 'control.global.write' : 'control.global.read';
  if (write) {
    if (n === 'akt_tasdiqlash') return 'f2.approve';
    if (n === 'akt_lifecycle_transition_v1') {
      const target=String(body.to_status||body.holat||'');
      return target==='cancelled'?'f2.cancel':target==='superseded'?'f2.correct':['draft','submitted'].includes(target)?'f2.prepare':'f2.approve';
    }
    if (n === 'akt_bekor') return 'f2.cancel';
    if (/correction|tuzatish/.test(n) && /f2|akt/.test(n)) return 'f2.correct';
    if (/f2_import|f2_manba|f2_source|f2_rebind|akt_qator_bog/.test(n)) return 'f2.import';
    if (n === 'akt_yarat') return body.tur === 'fakt' ? 'fakt.write' : 'f2.prepare';
    if (/f2|(^|_)akt_/.test(n)) return 'f2.prepare';
  } else if (/f2|(^|_)akt(?:_|$)|viborka|nakop/.test(n)) return 'f2.read';
  if (/tolov|xarajat|faktura|bux|debitor|financial|boss/.test(n)) return write ? 'financial.write' : 'financial.read';
  if (/fakt/.test(n)) return write ? 'fakt.write' : 'fakt.read';
  if (/narx|price|nakrutka|alias/.test(n)) return write ? 'narx.write' : 'narx.read';
  if (/qator|smeta|daraxt|ish_turi|resurs_kategoriya|qoshimcha_ish|zamena_ish|resurs_bola|ish_resurs/.test(n)) return write ? 'smeta.write' : 'smeta.read';
  if (/azolik/.test(n)) return write?'company.member.manage':'company.read';
  if (/kompaniya_yangila|kompaniya_logo/.test(n)) return 'company.profile.update';
  if (/platforma_|token_toldir|obuna_belgila|tizim_amal/.test(n)) return write ? 'control.global.write' : 'control.global.read';
  if (/loyiha/.test(n)) return write ? 'project.write' : 'project.read';
  if (/obyekt/.test(n)) return write ? 'object.write' : 'object.read';
  return write ? 'document.write' : 'document.read';
}

/** Public/auth/webhook/catalog endpoints retain their own guards. All tenant business APIs are covered here. */
export const SCOPED_APIS = new Set(['sb','sb-yoz','company','sessiya','smeta-studio','smeta-yukla','smeta-ai','smeta-narx-agent','f2-moslash',
  'hujjat-nazorat','hujjat-ol','hujjat-royxat','hujjat-yukla','boss-dashboard','system-control','tomon','agent-ish','ai-savol','ai-parse','gas','boshqaruv','agent-control']);

export function requestPermission(api: string, method: string, b: Record<string, unknown>, q: URLSearchParams): string | null {
  if (!SCOPED_APIS.has(api) || api === 'sessiya') return null;
  if (api === 'company') {
    if (method === 'GET') return q.has('profile')?'company.read':q.has('azolik_ruxsatlari')?'company.member.manage':null;
    if (b.action === 'profile_update') return 'company.profile.update';
    if (String(b.action).startsWith('member_') || String(b.action).startsWith('azolik_ruxsat')) return 'company.member.manage';
    return null; // Company requests / platform approval have their own director/platform guard.
  }
  if (api === 'sb') return dataPermission(String(b.jadval || b.soro || ''),false,b);
  if (api === 'sb-yoz') return dataPermission(String(b.amal || 'qator_tahrir'),true,b);
  if (api === 'boshqaruv') return method === 'GET' ? 'control.global.read' : 'control.global.write';
  if (api === 'agent-control') return method === 'GET' ? 'document.read' : 'document.write';
  if (api === 'system-control') return (b.kompaniya_id || q.get('kompaniya_id')) ? (method === 'GET' ? 'control.company.read' : 'control.company.write') : (method === 'GET' ? 'control.global.read' : 'control.global.write');
  if (api === 'smeta-studio') return b.amal === 'saqla' ? 'smeta.write' : 'smeta.read';
  if (api === 'smeta-yukla') return 'smeta.write';
  if (api === 'f2-moslash') return 'f2.import';
  if (api === 'smeta-narx-agent') return 'narx.read';
  if (api === 'smeta-ai') return 'smeta.read';
  if (api === 'boss-dashboard') return 'financial.read';
  if (api === 'gas') return 'control.global.read'; // T1 emergency adapter is not a tenant permission bypass.
  if (api === 'hujjat-yukla') return 'document.write';
  if (api.startsWith('hujjat')) return method === 'GET' || b.amal === 'royxat' ? 'document.read' : 'document.write';
  return 'document.read';
}

export function cachedAuthority(ctx: { data?: unknown }) {
  const data = ctx.data as Record<string, unknown> | undefined;
  return data?.roleAuthority as import('./auth').Sess | undefined;
}
