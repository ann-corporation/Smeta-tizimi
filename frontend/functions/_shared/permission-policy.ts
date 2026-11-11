import { writeCommandPermission } from './write-command-policy';

/** Named business permission classification. Neither row order nor caller-supplied permission is trusted. */
export function dataPermission(name: string, write: boolean, body: Record<string, unknown> = {}): string {
  const n = name.replace(/^t2_/, '');
  /* TENDER (2026-11-03): mavjud xarid capability lari. Yetkazuvchi tomoni — supply.offer, tasdiq/g'olib/raund — procurement.approve,
     qolgani — procurement.write; o'qish — procurement.read (RPC ichida supply.offer/fulfil ham qabul qilinadi). write-command-policy.ts bilan bir xil. */
  if (/^tender_/.test(n)) {
    if (!write) return 'procurement.read';
    if (['tender_taklif_v2','tender_taklif_qaytar_v2','tender_savol_ber_v1','tender_taklif_fayl_bogla_v1'].includes(n)) return 'supply.offer';
    if (['tender_raund_v1','tender_golib_v2'].includes(n)) return 'procurement.approve';
    return 'procurement.write';
  }
  /* BUYURTMA (20261108410000): yetkazuvchi bosqichlari (qabul/rad/bajarilmoqda/tayyor/topshirildi) - supply.fulfil; xaridor bekori - procurement.write;
     olib ketish joyi - supply.fulfil; yaratish/qabul - procurement.write; o'qish - procurement.read. write-command-policy.ts bilan bir xil. */
  if (/^buyurtma_/.test(n)) {
    if (!write) return 'procurement.read';
    if (n === 'buyurtma_royxat_v1' || n === 'buyurtma_tafsilot_v1') return 'procurement.read';
    if (n === 'buyurtma_olish_yoz_v1') return 'supply.fulfil';
    if (n === 'buyurtma_otish_v1') return ['qabul_qilindi','rad','bajarilmoqda','tayyor','topshirildi'].includes(String(body.holat || '')) ? 'supply.fulfil' : 'procurement.write';
    return 'procurement.write';
  }
  /* USTA «Bugun» (20261214300000): qoralama fakt va material zayavkasi — self.work.write; qaror (tasdiq/rad) — fakt.write. write-command-policy.ts bilan bir xil. */
  if (/^usta_/.test(n)) return n === 'usta_fakt_qaror_v1' ? 'fakt.write' : 'self.work.write';
  if (['erp_amal','sozlama_saqla','kirish_amal','taklif_yubor','taklif_qabul'].includes(n)) return 'control.company.write';
  if (n==='token_sarfla_v1'||n==='token_qaytar_v1'||n==='token_yakunla_v1') return 'company.read';
  /* M-29 bajarish (ombordan chiqim) — bajarish domeni; RPC ham fakt.write talab qiladi (ADR-3, 2026-10-21). */
  if (/^m29_/.test(n)) return write ? 'fakt.write' : 'fakt.read';
  /* Uy sotish (20261124000000): inventar/shaxmatka/panel/bitim kartasi — sales.read (karta PII ni RPC yashiradi); mijoz PII bor ro'yxatlar — sales.write (RPC ham shuni tekshiradi). */
  if (/^sotuv_/.test(n)) return write ? 'sales.write' : (/^sotuv_(shaxmatka|panel|bitim)_/.test(n) ? 'sales.read' : 'sales.write');
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
  if (/tolov|xarajat|faktura|bux|debitor|financial|boss|rahbar_panel/.test(n)) return write ? 'financial.write' : 'financial.read';
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
export const SCOPED_APIS = new Set(['object-financials','contract-scope','sb','sb-yoz','company','sessiya','smeta-studio','smeta-yukla','smeta-ai','smeta-narx-agent','f2-moslash',
  'hujjat-nazorat','hujjat-ol','hujjat-royxat','hujjat-yukla','boss-dashboard','boss-documents','system-control','tomon','hujjat-aylanish','agent-ish','ai-savol','ai-parse','gas','boshqaruv','agent-control',
  /* Obyekt paketi (ADR OBYEKT_PAKET §1.4): smeta + holat + F2 ro'yxati + nakrutka — faqat o'qish. */
  'obyekt-paket','normativ-qidir']);

export function requestPermission(api: string, method: string, b: Record<string, unknown>, q: URLSearchParams): string | null {
  if (!SCOPED_APIS.has(api) || api === 'sessiya') return null;
  if (api === 'normativ-qidir' && method === 'GET') return 'company.read';
  if (api === 'object-financials') return 'object.read';
  if (api === 'obyekt-paket') return 'smeta.read'; // shlyuz qo'shimcha f2.read + narx.read ni ham talab qiladi

  if (api === 'contract-scope') return method === 'GET' ? 'smeta.read' : 'smeta.write';
  if (api === 'company') {
    if (method === 'GET') return q.has('profile')?'company.read':q.has('azolik_ruxsatlari')?'company.member.manage':null;
    if (b.action === 'profile_update') return 'company.profile.update';
    if (String(b.action).startsWith('member_') || String(b.action).startsWith('azolik_ruxsat')) return 'company.member.manage';
    return null; // Company requests / platform approval have their own director/platform guard.
  }
  /* Tizim xaritasi — platforma darajasi: kompaniya capability si bilan BERILMAYDI va to'silmaydi. Yagona ruxsat — bazada
   * (superadmin YOKI t2_tizim_xaritasi_ruxsat qatori), actor sessiyadan (sb.ts `tizim_actor`). */
  if (api === 'sb' && (b.soro === 'tizim_xaritasi_v1' || b.soro === 'tizim_xaritasi_ruxsat_tekshir_v1')) return null;
  if (api === 'sb') return b.soro === 'modul_holat_v1' ? 'company.read' : dataPermission(String(b.jadval || b.soro || ''),false,b);
  // Yozish — faqat aniq reyestr orqali (fail-closed): reyestrda yo'q amal hech kimga ruxsat etilmaydi.
  if (api === 'sb-yoz') return writeCommandPermission(String(b.amal || 'qator_tahrir'),b);
  if (api === 'boshqaruv') return method === 'GET' ? 'control.global.read' : 'control.global.write';
  if (api === 'agent-control') return method === 'GET' ? 'document.read' : 'document.write';
  if (api === 'system-control') return (b.kompaniya_id || q.get('kompaniya_id')) ? (method === 'GET' ? 'control.company.read' : 'control.company.write') : (method === 'GET' ? 'control.global.read' : 'control.global.write');
  if (api === 'smeta-studio') return b.amal === 'saqla' ? 'smeta.write' : 'smeta.read';
  if (api === 'smeta-yukla') return 'smeta.write';
  if (api === 'f2-moslash') return 'f2.import';
  if (api === 'smeta-narx-agent') return 'narx.read';
  if (api === 'smeta-ai') return 'smeta.read';
  if (api === 'boss-dashboard') return 'financial.read';
  if (api === 'boss-documents') return 'document.read';
  if (api === 'gas') return 'control.global.read'; // T1 emergency adapter is not a tenant permission bypass.
  if (api === 'hujjat-yukla') return 'document.write';
  /* Hujjat aylanishi: qaror/qabul/o'qildi belgisi qatnashchi tomonda ham bo'ladi (inspektor, texnadzor) — rol bazada tekshiriladi. */
  if (api === 'hujjat-aylanish') return method === 'GET' || ['zanjir_qaror', 'xat_qabul', 'bildirishnoma_oqildi'].includes(String(b.amal)) ? 'document.read' : 'document.write';
  if (api.startsWith('hujjat')) return method === 'GET' || b.amal === 'royxat' ? 'document.read' : 'document.write';
  return 'document.read';
}

/** T4 (egasi 2026-10-21/22): o'chirilgan modul faqat YOZISHNI to'xtatadi. O'qish va PTO yadrosi (obyekt, smeta, Fakt,
 *  F2, Nakop, M-29) hech qachon modulga bog'lanmaydi — kompaniya o'z ma'lumotini doim ko'radi. */
export const YOZISH_MODULI: Readonly<Record<string, string>> = {
  'narx.write': 'module.narx', 'project.write': 'module.loyiha', 'financial.write': 'module.erp',
};
/** Nishon kompaniyalardan birida modul o'chirilgan bo'lsa — modul kodi; aks holda null. Holat noma'lum → null (fail-open). */
export function yopiqModul(permission: string, companyIds: readonly number[], off: Record<number, string[]> | undefined): string | null {
  const modul = YOZISH_MODULI[permission];
  if (!modul || !off) return null;
  return companyIds.some((id) => off[id]?.includes(modul)) ? modul : null;
}

export function cachedAuthority(ctx: { data?: unknown }) {
  const data = ctx.data as Record<string, unknown> | undefined;
  return data?.roleAuthority as import('./auth').Sess | undefined;
}
