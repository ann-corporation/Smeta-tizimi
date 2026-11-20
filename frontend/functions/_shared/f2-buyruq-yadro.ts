/**
 * f2-buyruq-yadro.ts — Jarvis F2/fakt vositalarining SOF mantiqi (tarmoq/DB yo'q): tasdiq tokeni, deterministik operation_id,
 * yozuv rejasi (qaysi NOMLI RPC lar, qanday yuk bilan), dry_run natijasidan preview (qator oldin→keyin, jami QQS bilan / ustamali / ustamasiz).
 *
 * Pul qoidasi: summalar FAQAT server yadrosidan (`_t2_summa_paket_v1` → lib/summa-paket); bu yerda formula YO'Q — faqat oldin/keyin ayirmasi.
 * `rejaQur` aniq shu qoidalar bo'yicha ishlaydi (mcp/smeta-mcp bilan bir xil RPC va yuk shakli): asl smeta qatori o'zgarmaydi,
 * faol versiya, NULL ≠ 0 (bo'sh narx 0 deb olinmaydi), tasdiqlangan F2 muzlagan.
 */
import { summaPaket } from '../../src/lib/summa-paket';
import type { Normal, YozishNomi } from './f2-vositalar';

/* ───────── tasdiq tokeni (HMAC-SHA256, stateless) ───────── */
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDan = (s: string): Uint8Array => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
async function hmacKalit(sir: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode('f2-buyruq:v1:' + sir), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
/** a — aktor, k — kompaniya, o — obyekt, op — operation_id, rh — reja xeshi (preview dan keyin ma'lumot o'zgarsa tasdiq rad), v/args — vosita va tozalangan kirish. */
export type TokenYuk = { a: number; k: number; o: number; op: string; rh: string; v: YozishNomi; args: Normal; e: number };

export async function tokenYarat(sir: string, yuk: Omit<TokenYuk, 'e'>, amaliyMs = 15 * 60_000, hozir = Date.now()): Promise<string> {
  const tana = b64u(enc.encode(JSON.stringify({ ...yuk, e: hozir + amaliyMs })));
  return tana + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKalit(sir), enc.encode(tana)));
}
export async function tokenTekshir(sir: string, token: string, hozir = Date.now()): Promise<TokenYuk | 'muddati' | null> {
  if (typeof token !== 'string' || token.length > 20_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [tana, imzo] = token.split('.');
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKalit(sir), b64uDan(imzo), enc.encode(tana)))) return null;
    const y = JSON.parse(new TextDecoder().decode(b64uDan(tana))) as TokenYuk;
    if (!y || !Number.isSafeInteger(y.a) || !Number.isSafeInteger(y.k) || !Number.isSafeInteger(y.o) || typeof y.op !== 'string' || typeof y.rh !== 'string' || typeof y.v !== 'string' || !y.args || typeof y.args !== 'object') return null;
    return hozir > y.e ? 'muddati' : y;
  } catch { return null; }
}

const hex = async (s: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
export const rejaXeshi = (r: Reja): Promise<string> => hex(JSON.stringify(r));
/** Asos operation_id + kalit → barqaror UUID (v4 shaklida): takroriy tasdiq bosish aynan shu RPC operation_id lari bilan, takror yozmaydi. */
export async function uuidHosila(asos: string, qoshimcha: string): Promise<string> {
  const h = await hex(`${asos}:${qoshimcha}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* ───────── yozuv rejasi ───────── */
export type QatorMalumot = { id: number; ota_id: number | null; tur: string; kod: string | null; nom: string | null; birlik: string | null; versiya: number; versiya_holat: string | null;
  qoshimcha: boolean | null; zamena: boolean | null; replaces_line_id: number | null };
export type AktMalumot = { id: number; obyekt_id: number; tur: string; holat: string; lifecycle_status: string | null; versiya: number; raqam: string | null };
export type AktQatorMalumot = { qator_id: number; hajm: number | null; certified_quantity: number | null; certified_unit_price: number | null; certified_amount: number | null;
  provenance_status: string | null; certified_source_hash: string | null; raw_snapshot: Record<string, unknown> | null; izoh: string | null; manba_akt_qator_id?: number | null };
export type Kontekst = { aid: number; kid: number; bugun: string; qatorlar: ReadonlyMap<number, QatorMalumot>; akt?: AktMalumot | null; aktQatorlar?: readonly AktQatorMalumot[] };

/** aktorBor — RPC `p_actor_id` oladi (server MAJBURAN sessiyadan qo'yadi); opKalit — `p_operation_id` shu kalitdan hosil bo'ladi (null — RPC da yo'q). */
export type Chaqiruv = { rpc: string; amal: string; yuk: Record<string, unknown>; aktorBor: boolean; opKalit: string | null };
export type Reja = {
  vosita: YozishNomi; obyekt_id: number; chaqiruvlar: Chaqiruv[]; olchov: 'smeta' | 'fakt' | 'f2_qoralama'; akt_id: number | null;
  qator_idlar: number[]; birlik_soni: number; tavsif: string; ogohlantirish: string[];
};
export type RejaXato = { xato: string; tafsilot?: string };
const rad = (xato: string, tafsilot?: string): RejaXato => ({ xato, ...(tafsilot ? { tafsilot } : {}) });
const y6 = (x: number) => Math.round(x * 1e6) / 1e6;
const y2 = (x: number) => Math.round(x * 100) / 100;
const RESURS = ['rs', 'mat', 'ob'];
const asl = (q: QatorMalumot) => !q.qoshimcha && !q.zamena && q.replaces_line_id == null;

/** Qoralama tahriri (mcp/smeta-mcp `qoralamaTahrirYuki` bilan bir xil qoida): storno qatorlari tegilmaydi; hajm 0 bo'lmaydi. */
const stornomi = (q: Pick<AktQatorMalumot, 'raw_snapshot' | 'manba_akt_qator_id'>) => q.raw_snapshot?.source === 'storno' || q.manba_akt_qator_id != null || q.raw_snapshot?.manba_akt_qator_id != null;
function mavjudYuk(q: AktQatorMalumot): Record<string, unknown> {
  const absent = q.provenance_status === 'price_intentionally_absent' || q.certified_unit_price == null;
  const mak = q.manba_akt_qator_id ?? (q.raw_snapshot?.manba_akt_qator_id != null ? Number(q.raw_snapshot.manba_akt_qator_id) : null);
  return { qator_id: q.qator_id, certified_quantity: Number(q.certified_quantity ?? q.hajm), certified_unit_price: absent ? null : q.certified_unit_price,
    certified_amount: absent ? null : q.certified_amount, price_intentionally_absent: absent, certified_source_hash: q.certified_source_hash ?? null,
    raw_snapshot: q.raw_snapshot ?? {}, izoh: q.izoh ?? null, ...(mak != null ? { manba_akt_qator_id: mak } : {}) };
}
/** `raw_snapshot.qolTahrir` ni yangilaydi (mavjud belgi saqlanadi; hajm/narx o'zgargan bo'lsa qo'shiladi). Norma nisbati — F2 sahifasi yuklaganda aktdan hisoblanadi. */
export function qolTahrirBelgi(eski: unknown, hajmOzgardi: boolean, narxBerildi: boolean): Record<string, unknown> | null {
  const b: Record<string, unknown> = eski && typeof eski === 'object' ? { ...(eski as Record<string, unknown>) } : {};
  if (hajmOzgardi) b.hajm = true;
  if (narxBerildi) b.narx = true;
  return b.hajm === true || b.narx === true ? b : null;
}
function qoralamaYuki(mavjud: readonly AktQatorMalumot[], oz: Array<{ qator_id: number; hajm?: number; narx?: number; narxsiz?: boolean }>, olib: readonly number[], ota?: (id: number) => number | null | undefined) {
  const xato: string[] = [];
  const oddiy = new Map<number, AktQatorMalumot>();
  for (const q of mavjud) if (!stornomi(q)) oddiy.set(q.qator_id, q);
  const olibS = new Set(olib);
  for (const id of olibS) if (!oddiy.has(id)) xato.push(`#${id}: qoralamada oddiy qator sifatida yo'q`);
  const ozM = new Map<number, (typeof oz)[number]>();
  for (const z of oz) { if (!oddiy.has(z.qator_id)) xato.push(`#${z.qator_id}: qoralamada oddiy qator sifatida yo'q`); else ozM.set(z.qator_id, z); }
  const yuk: Array<Record<string, unknown>> = []; const ozgardi: number[] = [];
  for (const q of mavjud) {
    if (!stornomi(q) && olibS.has(q.qator_id)) continue;
    const y = mavjudYuk(q); const z = stornomi(q) ? undefined : ozM.get(q.qator_id);
    if (!z) { yuk.push(y); continue; }
    ozgardi.push(q.qator_id);
    const hajm = z.hajm != null ? y6(z.hajm) : (y.certified_quantity as number);
    const snap: Record<string, unknown> = { ...(y.raw_snapshot as Record<string, unknown>), enteredQuantity: hajm };
    // Qo'lda tahrir himoyasi: F2 tayyorlash «yangilash» shu belgidagi hajm/narxni smeta normasiga qaytarib yubormasin (lib/f2-akt-kiritma).
    const qolBelgi = qolTahrirBelgi(snap.qolTahrir, z.hajm != null && y6(z.hajm) !== y.certified_quantity, z.narx != null);
    if (qolBelgi) snap.qolTahrir = qolBelgi;
    if (z.narxsiz) {
      delete snap.narxsizSabab; delete snap.enteredUnitPrice; delete snap.enteredAmount;
      yuk.push({ ...y, certified_quantity: hajm, certified_unit_price: null, certified_amount: null, price_intentionally_absent: true, raw_snapshot: snap });
      continue;
    }
    const narx = z.narx ?? (y.certified_unit_price as number | null);
    if (narx == null) { yuk.push({ ...y, certified_quantity: hajm, raw_snapshot: snap }); continue; }
    const summa = y2(hajm * narx); // hujjat qatori: hajm × narx (mcp/smeta-mcp va F2 sahifasi bilan bir xil); jami/ustama — server yadrosidan
    delete snap.narxsizSabab; Object.assign(snap, { enteredUnitPrice: narx, enteredAmount: summa });
    yuk.push({ ...y, certified_quantity: hajm, certified_unit_price: narx, certified_amount: summa, price_intentionally_absent: false, raw_snapshot: snap });
  }
  // Tombstone: olib tashlangan avtomatik resurs ota ish qatorida qolsa — «yangilash» uni qayta qo'shmasin (qolTahrir.olib).
  if (ota) for (const id of olibS) {
    const o = ota(id); if (o == null || !oddiy.has(id)) continue;
    const bor = yuk.find((y) => y.qator_id === o && !(y.manba_akt_qator_id != null)); if (!bor) continue;
    const snap = { ...(bor.raw_snapshot as Record<string, unknown>) };
    const qb: Record<string, unknown> = snap.qolTahrir && typeof snap.qolTahrir === 'object' ? { ...(snap.qolTahrir as Record<string, unknown>) } : {};
    qb.olib = [...new Set([...(Array.isArray(qb.olib) ? (qb.olib as unknown[]).map(Number) : []), id])].sort((a, b) => a - b);
    bor.raw_snapshot = { ...snap, qolTahrir: qb };
  }
  if (!yuk.length) xato.push('qoralamada birorta qator qolmaydi — F2 ni bekor qilish alohida amal');
  return { yuk, xato, ozgardi, olindi: [...olibS].filter((id) => oddiy.has(id)) };
}

/** Tozalangan kirish + kontekst → NOMLI RPC chaqiruvlari. Yozmaydi: faqat reja (dry_run va tasdiqdan keyingi yozuv shu rejadan ishlaydi). */
export function rejaQur(vosita: YozishNomi, a: Normal, k: Kontekst): Reja | RejaXato {
  const og: string[] = [];
  const obyektId = Number(a.obyekt_id ?? k.akt?.obyekt_id);
  const qat = (id: number) => k.qatorlar.get(id);
  const hammasiFaol = (ids: readonly number[]): RejaXato | null => {
    for (const id of ids) {
      const q = qat(id);
      if (!q) return rad('QATOR_TOPILMADI', `#${id} bu obyektda yo'q`);
      if ((q.versiya_holat ?? 'faol') !== 'faol') return rad('QATOR_FAOL_EMAS', `#${id} faol smeta versiyasida emas`);
    }
    return null;
  };
  switch (vosita) {
    case 'fakt_yoz': {
      const qs = a.qatorlar as Array<{ qator_id: number; hajm: number }>;
      const e = hammasiFaol(qs.map((x) => x.qator_id)); if (e) return e;
      return { vosita, obyekt_id: obyektId, olchov: 'fakt', akt_id: null, qator_idlar: qs.map((x) => x.qator_id), birlik_soni: qs.length * 3,
        tavsif: `Fakt yozish: ${qs.length} qator (delta)`, ogohlantirish: og,
        chaqiruvlar: [{ rpc: 't2_fakt_yoz_v2', amal: 'fakt_yoz_v2', aktorBor: true, opKalit: 'fakt',
          yuk: { p_obyekt_id: obyektId, p_sana: (a.sana as string | null) ?? k.bugun, p_qatorlar: qs, p_izoh: a.izoh ?? null, p_raqam: a.raqam ?? null, p_actor_label: `jarvis:actor:${k.aid}` } }] };
    }
    case 'f2_qoralama_tahrir': {
      const akt = k.akt;
      if (!akt) return rad('AKT_TOPILMADI');
      if (akt.tur !== 'f2') return rad('AKT_F2_EMAS');
      if (akt.holat !== 'qoralama' || !['draft', 'rejected'].includes(akt.lifecycle_status ?? 'draft')) return rad('AKT_QORALAMA_EMAS', `holat ${akt.holat}/${akt.lifecycle_status ?? '-'}: tasdiqlangan/yuborilgan F2 muzlagan`);
      const t = qoralamaYuki(k.aktQatorlar ?? [], a.ozgartir as never, a.olib_tashla as number[], (id) => k.qatorlar.get(id)?.ota_id);
      if (t.xato.length) return rad('TAHRIR_RAD', t.xato.slice(0, 10).join('; '));
      const kv = (a.kutilgan_versiya as number | null) ?? akt.versiya;
      return { vosita, obyekt_id: akt.obyekt_id, olchov: 'f2_qoralama', akt_id: akt.id, qator_idlar: [], birlik_soni: Math.max(1, t.ozgardi.length + t.olindi.length) * 3,
        tavsif: `F2 qoralama № ${akt.raqam ?? akt.id}: ${t.ozgardi.length} o'zgardi, ${t.olindi.length} olib tashlandi`, ogohlantirish: og,
        chaqiruvlar: [{ rpc: 't2_f2_qoralama_yangila_v1', amal: 'f2_qoralama_yangila_v1', aktorBor: true, opKalit: 'f2',
          yuk: { p_kompaniya_id: k.kid, p_akt_id: akt.id, p_kutilgan_versiya: kv, p_qatorlar: t.yuk, p_manba: 'frontend_v2' } }] };
    }
    case 'zamena_qosh': {
      const aslId = a.almashtirilayotgan_qator_id as number;
      const e = hammasiFaol([aslId]); if (e) return e;
      const q = qat(aslId)!;
      const rejim = (a.rejim as 'ish' | 'resurs' | null) ?? (q.tur === 'bl' ? 'ish' : 'resurs');
      const resurslar = a.resurslar as Normal[];
      if (rejim === 'resurs') {
        if (!RESURS.includes(q.tur)) return rad('REJIM_RAD', `resurs rejimi: almashtiriladigan qator rs/mat/ob bo'lsin (bu — ${q.tur})`);
        if (resurslar.length !== 1) return rad('REJIM_RAD', 'resurs rejimi: aynan bitta resurs bering');
        if (a.ish) og.push('resurs rejimi: `ish` e\'tiborga olinmadi');
        if (a.fakt_hajm != null) og.push('resurs rejimi: fakt_hajm e\'tiborga olinmadi — zamena faktini fakt_yoz bilan kiriting');
      } else {
        if (!a.ish) return rad('REJIM_RAD', 'ish rejimi: `ish {nom, birlik, hajm}` majburiy');
        if (!resurslar.length) og.push('resurslarsiz zamena: summa faqat ish qatoridan (resurs kiritilmagan)');
      }
      const ota = q.ota_id != null ? k.qatorlar.get(q.ota_id) : null;
      if (rejim === 'ish' && q.ota_id != null && !ota) return rad('OTA_TOPILMADI', `ota qator #${q.ota_id} topilmadi`);
      if (asl(q) && q.tur !== 'bl') og.push('asl smeta resursi almashtiriladi: asl qator o\'zgarmaydi, qoplama alohida qatlamda');
      return { vosita, obyekt_id: obyektId, olchov: 'smeta', akt_id: null, qator_idlar: [aslId], birlik_soni: (resurslar.length + 1) * 3,
        tavsif: `Zamena: #${aslId} → ${String((a.ish as Normal | null)?.nom ?? resurslar[0]?.nom ?? '').slice(0, 80)}`, ogohlantirish: og,
        chaqiruvlar: [{ rpc: 't2_ish_abc_saqla_v1', amal: 'ish_abc_saqla_v1', aktorBor: true, opKalit: 'zamena',
          yuk: { p_kompaniya_id: k.kid, p_obyekt_id: obyektId, p_command: rejim === 'ish' ? 'replacement' : 'resurs_zamena', p_ota_qator_id: rejim === 'ish' ? q.ota_id : null,
            p_almashtirilayotgan_qator_id: aslId, p_ish: rejim === 'ish' ? a.ish : null, p_resurslar: resurslar, p_fakt_hajm: rejim === 'ish' ? a.fakt_hajm ?? null : null,
            p_sana: a.sana ?? null, p_sabab: a.sabab, p_kutilgan_versiya: rejim === 'ish' && ota ? ota.versiya : null } }] };
    }
    case 'bajarilmadi': {
      if (a.amal === 'bekor') {
        const ids = a.bekor_idlar as number[];
        return { vosita, obyekt_id: obyektId, olchov: 'fakt', akt_id: null, qator_idlar: [], birlik_soni: ids.length * 3, tavsif: `«Bajarilmadi» belgisini bekor qilish: ${ids.length} ta`, ogohlantirish: og,
          chaqiruvlar: ids.map((id) => ({ rpc: 't2_bajarilmadi_bekor_v1', amal: 'bajarilmadi_bekor', aktorBor: true, opKalit: `bekor:${id}`,
            yuk: { p_kompaniya_id: k.kid, p_id: id, p_sabab: a.sabab_izoh ?? null } })) };
      }
      const qs = a.qatorlar as Array<{ qator_id: number; hajm?: number }>;
      const e = hammasiFaol(qs.map((x) => x.qator_id)); if (e) return e;
      if (qs.some((x) => asl(qat(x.qator_id)!) === false)) og.push('qo\'shimcha/zamena qatori belgilanmoqda (asl smeta emas)');
      og.push('Bu faktni nolga tushirmaydi: mavjud fakt bo\'lsa avval fakt_yoz bilan minus delta yozing.');
      return { vosita, obyekt_id: obyektId, olchov: 'fakt', akt_id: null, qator_idlar: qs.map((x) => x.qator_id), birlik_soni: qs.length * 3, tavsif: `«Bajarilmadi» belgisi: ${qs.length} qator (${a.sabab_kod})`, ogohlantirish: og,
        chaqiruvlar: [{ rpc: 't2_bajarilmadi_belgila_v1', amal: 'bajarilmadi_belgila', aktorBor: true, opKalit: 'belgila',
          yuk: { p_kompaniya_id: k.kid, p_obyekt_id: obyektId, p_qatorlar: qs, p_sabab_kod: a.sabab_kod, p_sabab_izoh: a.sabab_izoh ?? null, p_hujjat_id: a.hujjat_id ?? null, p_sana: a.sana ?? null, p_zamena_qator_id: a.zamena_qator_id ?? null } }] };
    }
    case 'narx_tuzat': {
      const ns = a.narxlar as Array<{ qator_id: number; narx: number }>;
      const e = hammasiFaol(ns.map((x) => x.qator_id)); if (e) return e;
      for (const x of ns) { const q = qat(x.qator_id)!; if (!RESURS.includes(q.tur)) return rad('FAQAT_RESURS', `#${q.id} (${q.tur}): faqat rs/mat/ob narxi tuzatiladi`); }
      const aslSoni = ns.filter((x) => asl(qat(x.qator_id)!)).length;
      if (aslSoni) og.push(`DIQQAT: ${aslSoni} ta ASL smeta qatori narxi o'zgaradi (asl smeta const). Odatda zamena/qo'shimcha to'g'riroq.`);
      og.push(`Sabab: ${String(a.sabab)}`);
      return { vosita, obyekt_id: obyektId, olchov: 'smeta', akt_id: null, qator_idlar: ns.map((x) => x.qator_id), birlik_soni: ns.length * 3, tavsif: `Narx tuzatish: ${ns.length} qator (QQS siz)`, ogohlantirish: og,
        chaqiruvlar: ns.map((x) => ({ rpc: 't2_qator_tahrir', amal: 'qator_tahrir', aktorBor: false, opKalit: null,
          yuk: { p_qator_id: x.qator_id, p_maydon: 'narx', p_qiymat: String(x.narx), p_kutilgan_versiya: qat(x.qator_id)!.versiya, p_manba: 'jarvis', p_kim: `jarvis:actor:${k.aid}` } })) };
    }
    /* Transport vositalari bu reja yo'lidan o'tmaydi: o'z preview si (RPC p_yoz:false) bilan `/api/f2-buyruq` dagi transportReja da. */
    case 'transport_taqsimla':
    case 'transport_belgila':
      return rad('VOSITA_YOL_NOTOGRI', 'transport vositalari alohida yo\'ldan o\'tadi');
  }
}

/* ───────── preview ───────── */
export type Uchlik = { qqs_bilan: number | null; ustamali: number | null; ustamasiz: number | null; narxsiz_soni: number | null };
/** Server paketi (`_t2_summa_paket_v1`) → tartib: QQS bilan, ustamali (QQS siz), ustamasiz. Paket yo'q — null (0 emas). */
export function uchlik(paket: unknown): Uchlik | null {
  const p = summaPaket(paket);
  return p ? { qqs_bilan: p.qqs_bilan, ustamali: p.ustamali, ustamasiz: p.ustamasiz, narxsiz_soni: p.narxsiz_soni ?? null } : null;
}
const ayir = (a: number | null, b: number | null): number | null => (a == null || b == null ? null : Math.round((b - a) * 100) / 100);
export const uchlikFarq = (o: Uchlik | null, k: Uchlik | null): Uchlik | null => (o && k ? { qqs_bilan: ayir(o.qqs_bilan, k.qqs_bilan), ustamali: ayir(o.ustamali, k.ustamali), ustamasiz: ayir(o.ustamasiz, k.ustamasiz), narxsiz_soni: k.narxsiz_soni } : null);

const HOLAT_MAYDON = ['fakt_hajm', 'fakt_summa', 'f2_hajm', 'f2_summa', 'smeta_hajm', 'smeta_narx', 'smeta_summa', 'almashtirilgan_hajm', 'qoldiq_hajm', 'qoldiq_summa'] as const;
const AKT_MAYDON = ['certified_quantity', 'certified_unit_price', 'certified_amount'] as const;
const num = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export type Ozgarish = { maydon: string; oldin: number | null; keyin: number | null };
export type QatorFarq = { qator_id: number; kod: string | null; nom: string | null; birlik: string | null; ozgarish: Ozgarish[]; olib_tashlandi?: true; yangi?: true };
export type Preview = { qatorlar: QatorFarq[]; jami: { oldin: Uchlik | null; keyin: Uchlik | null; farq: Uchlik | null }; natijalar: Array<{ rpc: string; ok: boolean; xabar?: string }> };
export type DryRun = { oldin?: { paket?: unknown; qatorlar?: Array<Record<string, unknown>>; akt_qatorlar?: Array<Record<string, unknown>> }; keyin?: { paket?: unknown; qatorlar?: Array<Record<string, unknown>>; akt_qatorlar?: Array<Record<string, unknown>> };
  natijalar?: Array<{ rpc?: string; natija?: Record<string, unknown> | null }> };

function jadvalFarq(o: Array<Record<string, unknown>>, k: Array<Record<string, unknown>>, maydonlar: readonly string[], meta: (id: number) => { kod: string | null; nom: string | null; birlik: string | null }): QatorFarq[] {
  const om = new Map(o.map((r) => [Number(r.qator_id), r])); const km = new Map(k.map((r) => [Number(r.qator_id), r]));
  const out: QatorFarq[] = [];
  for (const id of [...new Set([...om.keys(), ...km.keys()])].sort((x, y) => x - y)) {
    const a = om.get(id), b = km.get(id);
    const ozg: Ozgarish[] = [];
    for (const m of maydonlar) { const x = a ? num(a[m]) : null, y = b ? num(b[m]) : null; if ((x == null) !== (y == null) || (x != null && y != null && Math.abs(x - y) > 1e-9)) ozg.push({ maydon: m, oldin: x, keyin: y }); }
    if (ozg.length || !a || !b) out.push({ qator_id: id, ...meta(id), ozgarish: ozg, ...(a && !b ? { olib_tashlandi: true as const } : {}), ...(!a && b ? { yangi: true as const } : {}) });
  }
  return out;
}

/** dry_run natijasidan preview. Server RPC `{ok:false}` qaytargan bo'lsa natijalar ichida ok=false bo'ladi (tasdiq tokeni berilmaydi). */
export function previewQur(reja: Reja, dry: DryRun, meta: (id: number) => { kod: string | null; nom: string | null; birlik: string | null }): Preview {
  const o = dry.oldin ?? {}, kk = dry.keyin ?? {};
  const qatorlar = [...jadvalFarq(o.qatorlar ?? [], kk.qatorlar ?? [], HOLAT_MAYDON, meta), ...jadvalFarq(o.akt_qatorlar ?? [], kk.akt_qatorlar ?? [], AKT_MAYDON, meta)];
  const oldin = uchlik(o.paket), keyin = uchlik(kk.paket);
  const natijalar = (dry.natijalar ?? []).map((n) => {
    const r = n.natija ?? null;
    const ok = !!r && r.ok !== false;
    return { rpc: String(n.rpc ?? ''), ok, ...(ok ? {} : { xabar: String(r?.xabar ?? r?.error ?? r?.code ?? 'Server rad etdi') }) };
  });
  if (natijalar.length !== reja.chaqiruvlar.length) natijalar.push({ rpc: '-', ok: false, xabar: 'dry_run chaqiruvlar soni mos kelmadi' });
  return { qatorlar, jami: { oldin, keyin, farq: uchlikFarq(oldin, keyin) }, natijalar };
}
