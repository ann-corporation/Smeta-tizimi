/**
 * `t2_qator.change_type` / `replaces_line_id` — LRV ekrani va eksportida qo'shimcha/zamena belgilari uchun (faqat o'qish).
 * `t2_daraxt` view'ida bu ustunlar yo'q; shu obyektning faqat o'zgarish qatorlari o'qiladi (asl smeta qatorlari emas).
 * Xato bo'lsa null — daraxt va eksport ishlashda davom etadi (belgilarsiz).
 */
import { sbOqi, type T2Qator } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';
import { ozgarishTuri, type OzgarishMalumot } from '../lib/lrv-ozgarish';
import { vaqtliOqish } from './vaqtli-fetch';
import type { SummaPaket } from '../lib/summa-paket';

/* ══════════════════════════════════════════════════════════════════
 * SMETA (ASL) CONST + ASOSLANGAN O'ZGARISHLAR (egasi 2026-11-06, migratsiya 20261203001300).
 * Hisob faqat bazada (`t2_smeta_ozgarish_qatlam_v1` ← `_t2_smeta_qatlam_qator_v1`); bu yerda faqat o'qish va tur.
 * ══════════════════════════════════════════════════════════════════ */
export type OzgarishKesimQismi = { kat: string | null; summa: number };
export type OzgarishAsos = {
  change_id?: number; tur?: string; sabab?: string; holat?: string; izoh?: string; hujjat_id?: number; hujjat_nom?: string;
  kim?: string; qachon?: string; tasdiqlandi?: string; sana?: string; zamena_qator_id?: number;
};
export type OzgarishAkt = { akt_id: number; tur: string; raqam: string | null; oy: string | null };
export type QoshimchaGuruh = {
  qator_id: number; tur: string; kod?: string; nom?: string; birlik?: string; hajm?: number; ota_id?: number; ota_nom?: string;
  summa?: number; barg_soni: number; narxsiz_soni: number; asos?: OzgarishAsos; asosli: boolean; akt?: OzgarishAkt;
};
export type ZamenaGuruh = {
  qator_id: number; tur: string; kod?: string; nom?: string; birlik?: string; hajm?: number; almashtirish_hajm?: number;
  summa?: number; narxsiz: boolean; barg_soni: number;
  asl_id?: number; asl_kod?: string; asl_nom?: string; asl_birlik?: string; asl_hajm?: number; asl_summa?: number;
  /** Aslning almashtirilgan qismi (reja); `farq` = summa − almashtirilgan. Narxsiz zamenada ikkalasi ham yo'q (noma'lum). */
  almashtirilgan_summa?: number; farq?: number; almashtirish_noaniq?: boolean;
  asos?: OzgarishAsos; asosli: boolean; akt?: OzgarishAkt;
};
export type BajarilmadiGuruh = {
  id: number; qator_id: number; tur: string; kod?: string; nom?: string; birlik?: string; smeta_hajm?: number;
  bajarilmagan_hajm?: number; summa?: number; asos?: OzgarishAsos;
};
export type SmetaOzgarishQatlam = {
  ok: true; obyekt_id: number;
  asl: { paket: SummaPaket | null; ustamasiz: number; narxsiz_soni: number };
  joriy: { paket: SummaPaket | null; ustamasiz: number };
  ozgarish: {
    ustamasiz: number; ustamali: number | null; qqs_bilan: number | null;
    qoshimcha: number; zamena_summa: number; almashtirilgan_summa: number; zamena_farq: number; bajarilmadi: number;
    narx_farqi: number | null; narx_farqi_izoh: string; avvalgi_jami: number; ikki_marta_sanalgan: number; invariant_ok: boolean;
    kesim: { qoshimcha: OzgarishKesimQismi[]; zamena: OzgarishKesimQismi[]; bajarilmadi: OzgarishKesimQismi[] };
  };
  qoshimcha: { soni: number; summa: number; narxsiz_soni: number; asossiz_soni: number; qisqartirildi: boolean; qatorlar: QoshimchaGuruh[] };
  zamena: {
    soni: number; zamena_summa: number; almashtirilgan_summa: number; farq: number; narxsiz_soni: number; noaniq_soni: number;
    asossiz_soni: number; qisqartirildi: boolean; qatorlar: ZamenaGuruh[];
  };
  bajarilmadi: { soni: number; summa: number; narxsiz_soni: number; qatorlar: BajarilmadiGuruh[] };
};

/** Obyekt smetasi: asl (CONST) · o'zgarishlar (asosi bilan) · smeta + o'zgarishlar. Xato — `ok:false` (NULL ≠ «o'zgarish yo'q»). */
type QatlamJavob = { ok: true; natija: SmetaOzgarishQatlam } | { ok: false; error: string };
/** Bir vaqtda bir necha ko'rsatkich (Smeta kartasi, O'zgarishlar paneli, Resurslar) shu javobni so'raydi — YAGONA so'rov; tugagach kesh yo'q (yangi ma'lumot). */
const parvozda = new Map<number, Promise<QatlamJavob>>();
export function smetaOzgarishQatlamOl(obyektId: number): Promise<QatlamJavob> {
  const bor = parvozda.get(obyektId);
  if (bor) return bor;
  const p = smetaOzgarishQatlamOqi(obyektId).finally(() => { parvozda.delete(obyektId); });
  parvozda.set(obyektId, p);
  return p;
}
async function smetaOzgarishQatlamOqi(obyektId: number): Promise<QatlamJavob> {
  const r = await vaqtliOqish('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro: 'smeta_ozgarish_qatlam_v1', obyekt_id: obyektId }),
  });
  const j = await r.json() as { ok: boolean; natija?: (Omit<SmetaOzgarishQatlam, 'ok'> & { ok?: boolean; code?: string }); error?: string };
  const n = j.natija;
  if (!j.ok || !n || n.ok !== true) return { ok: false, error: j.error || n?.code || 'SMETA_OZGARISH_OQILMADI' };
  return { ok: true, natija: { ...n, ok: true } };
}

export async function ozgarishMalumotOl(obyektId: number): Promise<OzgarishMalumot | null> {
  const r = await t2ToliqOqi<{ id: number; change_type: string | null; replaces_line_id: number | null }>(sbOqi, {
    jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&change_type=not.is.null`, ustunlar: 'id,change_type,replaces_line_id', limit: 200000,
  }, 'id').catch(() => null);
  if (!r?.ok) return null;
  const m: OzgarishMalumot = new Map();
  for (const x of r.qatorlar ?? []) {
    const t = ozgarishTuri(x.change_type);
    if (t) m.set(Number(x.id), { change_type: t, replaces_line_id: x.replaces_line_id == null ? null : Number(x.replaces_line_id) });
  }
  return m;
}

/**
 * Avvalgi (almashtirilgan) smeta versiyasi qatorlari: `t2_qator.versiya_holat = 'almashtirilgan'`
 * (migratsiya 20261114700000; `t2_daraxt` faqat 'faol' qatorlarni beradi). Asosiy ro'yxatga KIRMAYDI —
 * LRV ekranida alohida filtr, Excel'da alohida varaq (kulrang). Xato bo'lsa bo'sh (belgisiz) qaytadi.
 */
export type AvvalgiVersiya = { qatorlar: T2Qator[]; versiyaNomi: Map<number, string> };
export const AVVALGI_VERSIYA_USTUNLARI = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,norma,versiya,almashtirgan_versiya_id';

export async function avvalgiVersiyaOl(obyektId: number): Promise<AvvalgiVersiya | null> {
  const r = await t2ToliqOqi<T2Qator & { almashtirgan_versiya_id: number | null }>(sbOqi, {
    jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&versiya_holat=eq.almashtirilgan`, ustunlar: AVVALGI_VERSIYA_USTUNLARI, limit: 200000,
  }, 'id').catch(() => null);
  if (!r?.ok) return null;
  const qatorlar = (r.qatorlar ?? []) as Array<T2Qator & { almashtirgan_versiya_id: number | null }>;
  const versiyaNomi = new Map<number, string>();
  const idlar = [...new Set(qatorlar.map((q) => q.almashtirgan_versiya_id).filter((x): x is number => x != null))];
  if (idlar.length) {
    const v = await sbOqi<{ id: number; nom: string | null; manba_sana: string | null }>({
      jadval: 't2_smeta_versiya', filtr: `id=in.(${idlar.slice(0, 200).join(',')})`, ustunlar: 'id,nom,manba_sana', limit: 200,
    }).catch(() => null);
    if (v?.ok) for (const x of v.qatorlar ?? []) versiyaNomi.set(Number(x.id), [x.nom, x.manba_sana].filter(Boolean).join(' · '));
  }
  return { qatorlar, versiyaNomi };
}
