/**
 * TENDER yozuv amallari — /api/sb-yoz uchun RPC argumentlarini yig'uvchi (maydon OQ RO'YXATI).
 * Mijoz yuborgan ixtiyoriy JSON RPC ga xom uzatilmaydi: har maydon turi/uzunligi tekshiriladi, ortiqchasi tashlanadi.
 * Actor (p_actor_id) FAQAT sessiyadan. RPC lar a'zolik, ruxsat, egalik va holat mashinasini o'zi ham tekshiradi (E2 §5).
 */
export const TENDER_AMALLAR: ReadonlySet<string> = new Set([
  'tender_saqla_v1', 'tender_otish_v1', 'tender_raund_v1', 'tender_taklif_v2', 'tender_taklif_qaytar_v2',
  'tender_savol_ber_v1', 'tender_javob_v1', 'tender_baholash_saqla_v1', 'tender_golib_v2', 'tender_baho_ber_v1',
  'tender_fayl_bogla_v1', 'tender_taklif_fayl_bogla_v1',
]);

export type TenderYuk = { ok: true; yuk: Record<string, unknown> } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLATLAR = ['qoralama', 'tasdiqlashda', 'elon', 'takliflar_yopildi', 'baholash', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor'];
const TURLAR = /^[a-z_]{2,40}$/;
const bad = (error: string): TenderYuk => ({ ok: false, error });
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const id = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isSafeInteger(n) && n > 0 ? n : null; };
const matn = (v: unknown, max: number): string | null => (v == null || v === '' ? null : typeof v === 'string' ? v.slice(0, max) : null);
const son = (v: unknown): number | string | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e15 ? n : 'XATO';
};
const vaqt = (v: unknown): string | null | 'XATO' => (v == null || v === '' ? null : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : 'XATO');

/** Qator maydonlarini oq ro'yxat bo'yicha tozalaydi; noto'g'ri tur bo'lsa null (rad). */
function qatorlar(arr: unknown, max: number, kalitlar: Record<string, 'matn' | 'son' | 'id' | 'sana' | 'int'>): Record<string, unknown>[] | null {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > max) return null;
  const chiq: Record<string, unknown>[] = [];
  for (const x of arr) {
    const o = obj(x); if (!o) return null;
    const r: Record<string, unknown> = {};
    for (const [k, t] of Object.entries(kalitlar)) {
      const v = o[k]; if (v == null || v === '') continue;
      if (t === 'matn') { if (typeof v !== 'string') return null; r[k] = v.slice(0, 2000); }
      else if (t === 'sana') { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; r[k] = v; }
      else if (t === 'id' || t === 'int') { const n = id(v) ?? (t === 'int' && Number(v) === 0 ? 0 : null); if (n == null) return null; r[k] = n; }
      else { const n = son(v); if (n == null || n === 'XATO') return null; r[k] = n; }
    }
    chiq.push(r);
  }
  return chiq;
}

export function tenderYuk(amal: string, so: Record<string, unknown>, actorId: number | undefined | null): TenderYuk {
  if (!actorId || !Number.isSafeInteger(actorId)) return bad('Sessiyada foydalanuvchi yo‘q');
  const kompaniya = id(so.kompaniya_id);
  if (!kompaniya) return bad('kompaniya_id noto‘g‘ri');
  if (typeof so.operation_id !== 'string' || !UUID.test(so.operation_id)) return bad('operation_id (UUID) majburiy — usiz takroriy so‘rov ikkinchi yozuv yaratadi');
  const asos = { p_actor_id: actorId, p_kompaniya_id: kompaniya, p_operation_id: so.operation_id };
  const rfq = id(so.rfq_id);
  const versiya = so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya);
  if (versiya != null && (!Number.isSafeInteger(versiya) || versiya < 0)) return bad('kutilgan_versiya noto‘g‘ri');

  switch (amal) {
    case 'tender_saqla_v1': {
      if (so.rfq_id != null && so.rfq_id !== '' && !rfq) return bad('rfq_id noto‘g‘ri');
      if (rfq && versiya == null) return bad('Tahrir uchun kutilgan_versiya majburiy');
      if (typeof so.tur !== 'string' || !TURLAR.test(so.tur) || !['ochiq', 'taklif'].includes(String(so.doira))) return bad('tur yoki doira noto‘g‘ri');
      const m = obj(so.maydonlar); if (!m) return bad('maydonlar noto‘g‘ri');
      const muddat = vaqt(so.muddat); if (muddat === 'XATO') return bad('muddat noto‘g‘ri');
      const savolMuddat = vaqt(m.savol_muddat); if (savolMuddat === 'XATO') return bad('savol_muddat noto‘g‘ri');
      const byudjet = son(m.byudjet_qqs_bilan), qqs = son(m.qqs_foiz);
      if (byudjet === 'XATO' || qqs === 'XATO') return bad('byudjet yoki QQS noto‘g‘ri');
      const meyorXom = obj(m.meyor) ?? {};
      const meyor: Record<string, number> = {};
      for (const k of ['narx', 'muddat', 'tolov', 'kafolat', 'reyting']) {
        const v = meyorXom[k]; if (v == null || v === '') continue;
        const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) return bad('meyor noto‘g‘ri');
        meyor[k] = n;
      }
      const ql = qatorlar(so.qatorlar, 200, { nom: 'matn', birlik: 'matn', miqdor: 'son', lot_no: 'id', lot_nom: 'matn', talab_sana: 'sana', yetkazish_joyi: 'matn',
        spets: 'matn', resurs_kodi: 'matn', zayavka_id: 'id', smeta_qator_id: 'id', izoh: 'matn' });
      if (!ql) return bad('qatorlar: 1–200 ta, maydonlar noto‘g‘ri');
      const qabul = so.qabul_kompaniya_idlar == null ? null : Array.isArray(so.qabul_kompaniya_idlar) ? so.qabul_kompaniya_idlar.map(id) : 'XATO';
      if (qabul === 'XATO' || (Array.isArray(qabul) && (qabul.length > 50 || qabul.some((x) => x == null)))) return bad('qabul_kompaniya_idlar noto‘g‘ri');
      const obyekt = so.obyekt_id == null || so.obyekt_id === '' ? null : id(so.obyekt_id);
      if (so.obyekt_id != null && so.obyekt_id !== '' && !obyekt) return bad('obyekt_id noto‘g‘ri');
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_kutilgan_versiya: versiya, p_tur: so.tur, p_doira: so.doira, p_qabul_kompaniya_idlar: qabul, p_obyekt_id: obyekt, p_muddat: muddat,
        p_maydonlar: { sarlavha: matn(m.sarlavha, 300), izoh: matn(m.izoh, 2000), byudjet_qqs_bilan: byudjet, byudjet_korsatish: m.byudjet_korsatish === true, qqs_foiz: qqs,
          valyuta: matn(m.valyuta, 3), baholash_usuli: matn(m.baholash_usuli, 10), meyor, savol_muddat: savolMuddat, tolov_sharti: matn(m.tolov_sharti, 500) },
        p_qatorlar: ql } };
    }
    case 'tender_otish_v1': {
      if (!rfq || versiya == null || typeof so.ga !== 'string' || !HOLATLAR.includes(so.ga)) return bad('rfq_id, kutilgan_versiya va ga majburiy');
      const sh = so.shartnoma_id == null || so.shartnoma_id === '' ? null : id(so.shartnoma_id);
      if (so.shartnoma_id != null && so.shartnoma_id !== '' && !sh) return bad('shartnoma_id noto‘g‘ri');
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_kutilgan_versiya: versiya, p_ga: so.ga, p_izoh: matn(so.izoh, 1000), p_shartnoma_id: sh } };
    }
    case 'tender_raund_v1': {
      const muddat = vaqt(so.muddat);
      if (!rfq || versiya == null || !muddat || muddat === 'XATO') return bad('rfq_id, kutilgan_versiya va muddat majburiy');
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_kutilgan_versiya: versiya, p_muddat: muddat, p_izoh: matn(so.izoh, 1000) } };
    }
    case 'tender_taklif_v2': {
      if (!rfq) return bad('rfq_id noto‘g‘ri');
      const ql = qatorlar(so.qatorlar, 200, { rfq_qator_id: 'id', narx: 'son', muddat_kun: 'int', mavjud_miqdor: 'son', izoh: 'matn' });
      if (!ql || ql.some((q) => q.rfq_qator_id == null || q.narx == null)) return bad('Har qator uchun rfq_qator_id va narx majburiy (narxsiz qator yuborilmaydi)');
      const s = obj(so.shart) ?? {};
      const yet = son(s.yetkazish_narx), qqs = son(s.qqs_foiz);
      if (yet === 'XATO' || qqs === 'XATO') return bad('yetkazish_narx yoki qqs_foiz noto‘g‘ri');
      const amal2 = s.amal_kun == null || s.amal_kun === '' ? null : id(s.amal_kun), kaf = s.kafolat_oy == null || s.kafolat_oy === '' ? null : (Number(s.kafolat_oy) === 0 ? 0 : id(s.kafolat_oy));
      if ((s.amal_kun != null && s.amal_kun !== '' && amal2 == null) || (s.kafolat_oy != null && s.kafolat_oy !== '' && kaf == null)) return bad('amal_kun yoki kafolat_oy noto‘g‘ri');
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_qatorlar: ql, p_izoh: matn(so.izoh, 2000),
        p_shart: { yetkazish_narx: yet, qqs_foiz: qqs, tolov_sharti: matn(s.tolov_sharti, 500), amal_kun: amal2, kafolat_oy: kaf } } };
    }
    case 'tender_taklif_qaytar_v2': {
      const t = id(so.taklif_id);
      if (!t || versiya == null) return bad('taklif_id va kutilgan_versiya majburiy');
      return { ok: true, yuk: { ...asos, p_taklif_id: t, p_kutilgan_versiya: versiya } };
    }
    case 'tender_savol_ber_v1': {
      const s = matn(so.savol, 2000);
      if (!rfq || !s || s.trim().length < 5) return bad('rfq_id va savol (kamida 5 belgi) majburiy');
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_savol: s } };
    }
    case 'tender_javob_v1': {
      const sid = id(so.savol_id), j = matn(so.javob, 4000);
      if (!sid || !j || j.trim().length < 2) return bad('savol_id va javob majburiy');
      return { ok: true, yuk: { ...asos, p_savol_id: sid, p_javob: j, p_ommaviy: so.ommaviy !== false } };
    }
    case 'tender_baholash_saqla_v1': {
      if (!rfq || versiya == null || !Array.isArray(so.ballar) || so.ballar.length === 0 || so.ballar.length > 100) return bad('rfq_id, kutilgan_versiya va ballar majburiy');
      const ballar: Record<string, unknown>[] = [];
      for (const x of so.ballar) {
        const o = obj(x), t = o ? id(o.taklif_id) : null, b = o ? obj(o.ballar) : null;
        if (!o || !t || !b) return bad('ballar noto‘g‘ri');
        const bb: Record<string, number> = {};
        for (const k of ['narx', 'muddat', 'tolov', 'kafolat', 'reyting']) {
          if (b[k] == null || b[k] === '') continue;
          const n = Number(b[k]); if (!Number.isFinite(n) || n < 0 || n > 100) return bad('ball 0..100 bo‘lishi kerak');
          bb[k] = n;
        }
        ballar.push({ taklif_id: t, ballar: bb, izoh: matn(o.izoh, 1000) });
      }
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_kutilgan_versiya: versiya, p_ballar: ballar } };
    }
    case 'tender_golib_v2': {
      if (!rfq || versiya == null || !Array.isArray(so.tanlov) || so.tanlov.length === 0 || so.tanlov.length > 20) return bad('rfq_id, kutilgan_versiya va tanlov majburiy');
      const asosMatn = matn(so.asos, 4000);
      if (!asosMatn || asosMatn.trim().length < 10) return bad('G‘olib tanlash asosi majburiy (kamida 10 belgi)');
      const tanlov: Record<string, unknown>[] = [];
      for (const x of so.tanlov) {
        const o = obj(x), t = o ? id(o.taklif_id) : null;
        if (!o || !t) return bad('tanlov noto‘g‘ri');
        let idl: number[] | null = null;
        if (o.qator_idlar != null) {
          if (!Array.isArray(o.qator_idlar) || o.qator_idlar.length === 0 || o.qator_idlar.length > 200) return bad('qator_idlar noto‘g‘ri');
          idl = o.qator_idlar.map(id) as number[];
          if (idl.some((n) => n == null)) return bad('qator_idlar noto‘g‘ri');
        }
        tanlov.push({ taklif_id: t, qator_idlar: idl });
      }
      return { ok: true, yuk: { ...asos, p_rfq_id: rfq, p_kutilgan_versiya: versiya, p_tanlov: tanlov, p_asos: asosMatn, p_yakun: so.yakun !== false } };
    }
    case 'tender_baho_ber_v1': {
      const b = id(so.buyurtma_id), ball = Number(so.ball);
      if (!b || !Number.isInteger(ball) || ball < 1 || ball > 5) return bad('buyurtma_id va ball (1–5) majburiy');
      return { ok: true, yuk: { ...asos, p_buyurtma_id: b, p_ball: ball, p_izoh: matn(so.izoh, 1000) } };
    }
    case 'tender_fayl_bogla_v1':
    case 'tender_taklif_fayl_bogla_v1': {
      // Fayl R2 da (hujjat-yukla); bu yerda faqat hujjat id lari (metadata). Hujjat egaligi RPC da tekshiriladi.
      const manba = amal === 'tender_fayl_bogla_v1' ? rfq : id(so.taklif_id);
      const idlar = Array.isArray(so.hujjat_idlar) ? so.hujjat_idlar.map(id) : null;
      if (!manba || !idlar || idlar.length === 0 || idlar.length > 10 || idlar.some((n) => n == null)) return bad('rfq_id/taklif_id va 1–10 ta hujjat_id majburiy');
      return { ok: true, yuk: amal === 'tender_fayl_bogla_v1' ? { ...asos, p_rfq_id: manba, p_hujjat_idlar: idlar } : { ...asos, p_taklif_id: manba, p_hujjat_idlar: idlar } };
    }
    default: return bad('Noma‘lum tender amali');
  }
}
