/**
 * functions/_shared/imzo.ts - shaxsiy imzo shlyuzlari uchun umumiy qism (ADR_SHAXSIY_IMZO.md).
 * Kriptografik tekshiruv SHU YERDA (WebCrypto verify); SQL faqat saqlaydi va yaxlitlikni ushlaydi.
 */
import { imzoMazmunToTogri, imzoTekshir, imzoXabar, imzoXeshi, IMZO_BOSH_XESH, qisqaKod, type ImzoMazmun } from '../../src/lib/imzo/yadro';
import { supabaseBaseUrl } from './supabase-url';

export type ImzoEnv = { SUPABASE_URL: string; SUPABASE_KEY: string };

/** SQL `_t2_imzo_qator_v1` xom javobi (xom: ochiq kalit va imzo bor - mijozga FAQAT `ochiqQator`/`mening` orqali beriladi). */
export type ImzoXom = ImzoMazmun & {
  id: number; token: string; xesh: string; imzo: string; ochiq_kalit: string;
  kalit_bekor_vaqt: string | null; shubhali_dan: string | null;
  hujjat_holat: 'ozgarmagan' | 'ozgargan' | 'almashtirilgan' | 'ochirilgan';
  hujjat_turi?: string; fayl_nomi?: string | null;
};

export type ImzoHolati = 'haqiqiy' | 'imzo_yaroqsiz' | 'hujjat_ozgargan' | 'hujjat_almashtirilgan' | 'hujjat_ochirilgan' | 'shubhali';

export type ImzoNatija = {
  imzo_haqiqiy: boolean;           // kriptografik imzo to'g'ri VA xesh ustunlardan qayta hisoblanganga teng
  zanjir_ok: boolean;              // oldingi imzo xeshiga ulanish buzilmagan
  holat: ImzoHolati;
  kalit_bekor: boolean;            // kalit keyin bekor qilingan (imzo o'sha paytda to'g'ri edi)
  shubhali: boolean;               // kalit egasi shu vaqtdan keyingi imzolar shubhali deb e'lon qilgan
};

/** Bitta imzoni tekshiradi. `oldingi` - zanjirda undan oldingi imzo (bo'lsa). */
export async function imzoQatorTekshir(q: ImzoXom, oldingi: ImzoXom | null, zanjirBoshi: boolean): Promise<ImzoNatija> {
  const togri = imzoMazmunToTogri(q);
  let haqiqiy = false;
  if (togri) {
    haqiqiy = (await imzoTekshir(q.ochiq_kalit, imzoXabar(q), q.imzo)) && (await imzoXeshi(q)) === q.xesh;
  }
  const zanjirOk = oldingi ? q.oldingi_xesh === oldingi.xesh : (zanjirBoshi ? q.oldingi_xesh === IMZO_BOSH_XESH : true);
  const shubhali = !!q.shubhali_dan && Date.parse(q.vaqt) >= Date.parse(q.shubhali_dan);
  let holat: ImzoHolati = 'haqiqiy';
  if (!haqiqiy || !zanjirOk) holat = 'imzo_yaroqsiz';
  else if (q.hujjat_holat === 'ozgargan') holat = 'hujjat_ozgargan';
  else if (q.hujjat_holat === 'ochirilgan') holat = 'hujjat_ochirilgan';
  else if (shubhali) holat = 'shubhali';
  else if (q.hujjat_holat === 'almashtirilgan') holat = 'hujjat_almashtirilgan';
  return { imzo_haqiqiy: haqiqiy, zanjir_ok: zanjirOk, holat, kalit_bekor: !!q.kalit_bekor_vaqt, shubhali };
}

/** Zanjir (id o'sish tartibida) bo'yicha hammasini tekshiradi. `qisqa` - ro'yxat kesilgan (birinchi imzoning boshi tekshirilmaydi). */
export async function zanjirTekshir(q: ImzoXom[], qisqa: boolean): Promise<ImzoNatija[]> {
  const out: ImzoNatija[] = [];
  for (let i = 0; i < q.length; i++) out.push(await imzoQatorTekshir(q[i], i > 0 ? q[i - 1] : null, !qisqa));
  return out;
}

/** Mijozga beriladigan imzo (ochiq kalit, xesh, imzo baytlari, foydalanuvchi id YO'Q). */
export type ImzoKorinish = {
  token?: string; imzolovchi: string; rol: string; usul: ImzoMazmun['usul']; tomon: ImzoMazmun['tomon']; imzolovchi_kompaniya: string; nomidan_kompaniya: string | null; kod: string; vaqt: string; holat: ImzoHolati; imzo_haqiqiy: boolean; zanjir_ok: boolean;
  kalit_bekor: boolean; shubhali: boolean; hujjat_holat: ImzoXom['hujjat_holat']; mazmun_xesh: string; hujjat_sha256: string;
};
export function imzoKorinish(q: ImzoXom, n: ImzoNatija, tokenKerak: boolean): ImzoKorinish {
  return {
    ...(tokenKerak ? { token: q.token } : {}),
    imzolovchi: q.imzolovchi, rol: q.rol, usul: q.usul, tomon: q.tomon, imzolovchi_kompaniya: q.imzolovchi_kompaniya, nomidan_kompaniya: q.nomidan_kompaniya,
    kod: qisqaKod(q.xesh), vaqt: q.vaqt, holat: n.holat, imzo_haqiqiy: n.imzo_haqiqiy, zanjir_ok: n.zanjir_ok,
    kalit_bekor: n.kalit_bekor, shubhali: n.shubhali, hujjat_holat: q.hujjat_holat, mazmun_xesh: q.mazmun_xesh, hujjat_sha256: q.hujjat_sha256,
  };
}

export async function imzoRpc(env: ImzoEnv, nom: string, yuk: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    if (r.status === 404) return { ok: false, code: 'SERVER_YANGILANMAGAN' };
    if (!r.ok) { console.error('[imzo]', nom, 'HTTP', r.status); return null; }
    const j = await r.json() as Record<string, unknown>;
    return j && typeof j === 'object' ? j : null;
  } catch { console.error('[imzo]', nom, 'transport'); return null; }
}

/** Xotirada (isolate) tezlik cheklovi: kalit bo'yicha `limit` ta / `oynaMs`. Qo'shimcha qatlam: Cloudflare WAF qoidasi (ADR). */
export function tezlikOmbori() {
  const m = new Map<string, { n: number; t: number }>();
  return {
    oshdi(kalit: string, limit: number, oynaMs: number, hozir = Date.now()): boolean {
      const u = m.get(kalit);
      if (!u || hozir - u.t >= oynaMs) { if (m.size > 5000) m.clear(); m.set(kalit, { n: 1, t: hozir }); return false; }
      u.n++;
      return u.n > limit;
    },
    tozala() { m.clear(); },
  };
}

/** Sessiya cookie yoshi (soniya). jti/iat bo'lmasa - exp dan (SESSIYA_MUDDAT_MS) hisoblanadi. */
export function sessiyaYoshiMs(exp: number, muddatMs: number, hozir = Date.now()): number {
  return hozir - (exp - muddatMs);
}
