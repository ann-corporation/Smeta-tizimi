/**
 * hujjat-yangila.ts - «Hujjat doim tayyor» (egasi 2026-11-19): F-2 o'zgarsa rasmiy Excel fonda qayta yasalib Diskka YANGI VERSIYA (kalit f2:<akt_id>) yoziladi.
 *
 * Navbat SQL da (t2_hujjat_yangila_navbat: trigger + debounce 2 daqiqa + retry/backoff, migratsiya 20270119000001). Bu yerda faqat ISHLOVCHI:
 *   `navbatniIshla` - toza orkestrator (tarmoq `YangilaDeps` orqali; testlanadi), `haqiqiyDeps` - Worker amalga oshirishi.
 * TOKEN: fon yasash token YECHMAYDI (token yechish moduli umuman ishlatilmaydi). Token yuklab olish/paket vaqtida, mazmun kaliti (obyekt+oy+raqam) bo'yicha bir marta.
 * Boshqa turlar (F-3, nakopitelniy, M-29 ...): navbat jadvali umumiy (`tur`); bu yerga `yasagichlar[tur]` qo'shiladi - hozir faqat 'f2'.
 */
import { hmRpc, type HmEnv } from './hujjat-maydoni';
import { imzola } from './auth';
import { ichkiRejimda } from './hujjat-ichki';
import { Rad, f2DiskkaArxivlansinmi, f2Yasa, type F2Tayyor } from './hujjat-f2';
import { diskArxivla, type DiskArxivNatija, type DiskEnv } from './disk-yoz';
import { hujjatDizayniniYukla } from '../../src/api/f2-hujjat-kontekst';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';

export type NavbatQator = { id: number; tur: string; manba_id: number; kompaniya_id: number; obyekt_id: number | null; urinish: number; aktor_id: number | null };
export type TugatNatija = 'ok' | 'otkazildi' | 'xato';

export type YangilaDeps = {
  ol: (limit: number) => Promise<NavbatQator[]>;
  tugat: (id: number, natija: TugatNatija, xato?: string | null, versiya?: number | null) => Promise<void>;
  /** F-2 ni yasaydi (token YECHILMAYDI). Rad tashlashi mumkin. */
  yasaF2: (q: NavbatQator) => Promise<F2Tayyor>;
  /** Diskka yozadi. */
  yoz: (q: NavbatQator, t: F2Tayyor) => Promise<DiskArxivNatija>;
  hozir?: () => number;
};
export type IshlaNatija = { korildi: number; yangilandi: number; otkazildi: number; xato: number; xatolar: string[] };

const qisqa = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Muddati kelgan navbatni ishlaydi. `byudjetMs` - umumiy vaqt chegarasi (Worker so'rov limiti); undan oshsa qolganlari navbatda qoladi (keyingi tick). */
export async function navbatniIshla(d: YangilaDeps, o: { limit?: number; byudjetMs?: number } = {}): Promise<IshlaNatija> {
  const hozir = d.hozir ?? Date.now;
  const boshi = hozir();
  const qatorlar = await d.ol(o.limit ?? 5);
  const n: IshlaNatija = { korildi: qatorlar.length, yangilandi: 0, otkazildi: 0, xato: 0, xatolar: [] };
  for (const q of qatorlar) {
    if (o.byudjetMs != null && hozir() - boshi > o.byudjetMs) { await d.tugat(q.id, 'xato', 'VAQT_BUDJETI', null); n.xato++; continue; }
    try {
      if (q.tur !== 'f2') { await d.tugat(q.id, 'otkazildi', `tur_qollanmaydi:${q.tur}`, null); n.otkazildi++; continue; }
      if (!q.aktor_id || !q.obyekt_id) { await d.tugat(q.id, 'xato', 'AKTOR_YOQ', null); n.xato++; n.xatolar.push(`#${q.manba_id}: AKTOR_YOQ`); continue; }
      const t = await d.yasaF2(q);
      if (!t.arxivla || !f2DiskkaArxivlansinmi(t.akt)) { await d.tugat(q.id, 'otkazildi', 'bekor_yoki_taxminiy', null); n.otkazildi++; continue; }
      const r = await d.yoz(q, t);
      if (!r.ok || !r.disk.ok) {
        const kod = !r.ok ? r.code : (r.disk as { code?: string }).code ?? 'DISK_XATO';
        await d.tugat(q.id, 'xato', `disk:${kod}`, null); n.xato++; n.xatolar.push(`#${q.manba_id}: disk:${kod}`); continue;
      }
      await d.tugat(q.id, 'ok', null, r.disk.versiya); n.yangilandi++;
    } catch (e) {
      // Akt endi yo'q / boshqa kompaniya / bekor: qayta urinish befoyda.
      if (e instanceof Rad && (e.code === 'AKT_TOPILMADI' || e.status === 404)) { await d.tugat(q.id, 'otkazildi', e.code, null).catch(() => undefined); n.otkazildi++; continue; }
      await d.tugat(q.id, 'xato', qisqa(e), null).catch(() => undefined); n.xato++; n.xatolar.push(`#${q.manba_id}: ${qisqa(e)}`);
    }
  }
  return n;
}

export type YangilaEnv = HmEnv & DiskEnv & { SESSIYA_KALIT: string };
type Ctx = { request: Request; env: YangilaEnv };

/** Worker: SQL RPC lari + ichki yuklovchilar (aktor sessiyasi serverda yasaladi; ruxsat DB dan yangidan olinadi - desktop/bff bilan bir xil usul). */
export function haqiqiyDeps(ctx: Ctx, o: { kompaniyaId?: number | null } = {}): YangilaDeps {
  const env = ctx.env;
  return {
    async ol(limit) {
      const r = await hmRpc(env, 't2_hujjat_yangila_ol_v1', { p_limit: limit, p_kompaniya: o.kompaniyaId ?? null });
      return r.httpOk && r.body?.ok ? (r.body.qatorlar as NavbatQator[]) : [];
    },
    async tugat(id, natija, xato, versiya) { await hmRpc(env, 't2_hujjat_yangila_tugat_v1', { p_id: id, p_natija: natija, p_xato: xato ?? null, p_versiya: versiya ?? null }); },
    async yasaF2(q) {
      const origin = new URL(ctx.request.url).origin;
      const cookie = await imzola({ rol: 'pto', foydalanuvchi_id: q.aktor_id as number }, env.SESSIYA_KALIT);
      const request = new Request(origin + '/', { headers: { Cookie: 'sess=' + cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } });
      return ichkiRejimda({ ...ctx, request }, async () => {
        await hujjatDizayniniYukla(q.kompaniya_id);
        return f2Yasa(q.kompaniya_id, q.obyekt_id as number, q.manba_id);
      });
    },
    /* Disk operatsiya kaliti MAZMUN xeshi (token kaliti emas: u obyekt+oy+raqam, o'zgarishda bir xil qolardi -> yangi versiya yozilmasdi).
       Mazmun o'zgarmagan bo'lsa - bir xil operatsiya (versiya ortmaydi), o'zgargan bo'lsa - yangi versiya. */
    yoz: async (q, t) => diskArxivla(env, { actorId: q.aktor_id as number, kompaniyaId: q.kompaniya_id, obyektId: q.obyekt_id as number, turi: t.turi, faylNomi: t.faylNomi, bytes: t.bytes, davr: t.davr, xesh: await mazmunXeshi(t.bytes), manba: t.manba }),
  };
}
