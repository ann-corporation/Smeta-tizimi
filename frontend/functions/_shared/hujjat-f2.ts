/**
 * hujjat-f2.ts - saqlangan F-2 aktining Excel hujjatini yasash: YAGONA yo'l (egasi 2026-11-19: MCP ham aynan shuni ishlatadi).
 *
 * `/api/hujjat-yarat` (sayt, Android, Windows, Telegram) va `mcp/smeta-mcp` (`f2_excel`) SHU funksiyani chaqiradi - ikkinchi
 * quruvchi yo'q. Funksiya faqat `src/api/*` yuklovchilari va `src/lib/*` quruvchilarini ishlatadi; Worker (`ichkiRejimda`) yoki MCP
 * (`sayt-shim`) ularning nisbiy `fetch` larini o'z manbasiga yo'naltiradi. Bu yerda Worker/Node ga xos hech narsa yo'q.
 */
import { sbT2AktReestrOl } from '../../src/api/supabase';
import { portfelObyektOl, smetaTarixBilan, type AktQatorXom } from '../../src/api/f2-oylik-paket';
import { bekorQatorlari } from '../../src/lib/f2-bekor-qator';
import { paketAktExcel, portfelAktMoliya } from '../../src/lib/f2-oylik-paket/portfel';
import type { AktMoliya } from '../../src/lib/f2-oylik-paket/oylik';
import { f2HujjatKaliti } from '../../src/api/f2-hujjat-kontekst';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';
import { f2Manba, type DiskManba } from '../../src/lib/disk-hujjat';

export class Rad extends Error { constructor(readonly status: number, readonly code: string, msg: string) { super(msg); } }
export const rad = (e: Rad) => Response.json({ ok: false, code: e.code, xato: e.message }, { status: e.status });

export type Tayyor = { bytes: Uint8Array; faylNomi: string; turi: string; obyektId: number; davr: string | null; xesh: string; manba: DiskManba; arxivla: boolean };

/** F-2 reestridagi bitta akt (qator). */
export type F2YasaAkt = { id: number; raqam?: string | null; oy?: string | null; holat?: string | null; obyekt?: string | null; kompaniya_id?: number | null; hujjat_jami?: number | null };
export type F2YasaOpsiya = {
  /** Akt topilgach, hujjat yasalmasdan oldin (biznes qoidalari: bekor, oyiga bitta F-2 ...). Rad etish uchun `Rad` tashlaydi. */
  tekshir?: (akt: F2YasaAkt, reestr: readonly F2YasaAkt[]) => void;
  /** Summalar (ustamasiz / ustamali / QQS bilan, qator soni) - hujjat bilan bir xil hisob (`portfelAktMoliya`). */
  moliya?: boolean;
};
export type F2Tayyor = Tayyor & {
  akt: F2YasaAkt; moliya: AktMoliya | null;
  /** Server yasashida QR qo'yilgan bo'lsa: nashr tokeni, nusxa hali biriktirilmaganmi, va QR dan OLDINGI mazmun xeshi (Disk operatsiya kaliti uchun). */
  nashr?: { token: string; nusxaKerak: boolean; mazmunXesh: string };
};
/** F-2 Diskka yoziladimi: bekor va taxminiy qoralama (raqamida taxminiy/prorab belgisi; PR #670 qoidasi) yozilmaydi; qolgan hammasi yoziladi. */
export const f2DiskkaArxivlansinmi = (a: Pick<F2YasaAkt, 'holat' | 'raqam'>): boolean => a.holat !== 'bekor' && !/(taxminiy|prorab)/i.test(a.raqam ?? '');
export async function f2Yasa(kompaniyaId: number, obyektId: number, aktId: number, opsiya: F2YasaOpsiya = {}): Promise<F2Tayyor> {
  const reestr = await sbT2AktReestrOl(obyektId, 'f2');
  if (!reestr.ok || reestr.toliq === false) throw new Rad(502, 'REESTR_OQILMADI', 'F-2 reestri o‘qilmadi');
  const akt = (reestr.qatorlar ?? []).find((a) => a.id === aktId);
  if (!akt || akt.kompaniya_id !== kompaniyaId) throw new Rad(404, 'AKT_TOPILMADI', 'F-2 topilmadi');
  opsiya.tekshir?.(akt as F2YasaAkt, (reestr.qatorlar ?? []) as F2YasaAkt[]);
  let m;
  try {
    m = await portfelObyektOl(kompaniyaId, obyektId, [aktId], aktId);
    if (akt.holat === 'bekor') {
      // Bekor akt: 	2_f2_tafsilot uni ko'rsatmaydi — sayt (F2 tarixi) kabi 	2_akt_qator + smeta (tarix bilan) dan qatorlar.
      const lines = bekorQatorlari(akt, (m.aktQatorlar.get(aktId) ?? []) as AktQatorXom[], new Map(m.smeta.map((r) => [r.id, r] as const)));
      m = { ...m, tafsilot: lines, smeta: await smetaTarixBilan(obyektId, m.smeta, lines.map((l) => l.qator_id)) };
    }
  } catch (e) { throw new Rad(502, 'MALUMOT_OQILMADI', e instanceof Error ? e.message.slice(0, 160) : 'Ma‘lumot o‘qilmadi'); }
  const raqamlar = new Map((reestr.qatorlar ?? []).map((a) => [a.id, a.raqam ?? null] as const));
  let h;
  try { h = paketAktExcel(m, akt, akt.obyekt || '', raqamlar); }
  catch (e) { throw new Rad(409, 'F2_QATOR_TOPILMADI', e instanceof Error ? e.message.slice(0, 160) : 'F-2 qatori topilmadi'); }
  if (!h) throw new Rad(409, 'QATOR_YOQ', 'Bu hujjatda chiqariladigan qator yo‘q');
  if (h.topilmagan) throw new Rad(409, 'F2_QATOR_TOPILMADI', `${h.topilmagan} ta qator smetada topilmadi`);
  const moliya = opsiya.moliya ? portfelAktMoliya(m, { ...akt, hujjat_jami: akt.hujjat_jami ?? null }, akt.obyekt || '', raqamlar) : null;
  const xesh = f2HujjatKaliti(obyektId, akt.oy || '', akt.raqam, akt.id) ?? `akt:${akt.id}:${await mazmunXeshi(h.bytes)}`;
  return { akt: akt as F2YasaAkt, moliya, bytes: h.bytes, faylNomi: h.faylNomi, turi: 'f2_hujjat', obyektId, davr: akt.oy || null, xesh,
    /* Disk (egasi 2026-11-19: qoralama ham, tasdiqlangan ham Diskda turadi); kalit f2:<akt_id> - qayta yasalsa/tasdiqlansa o'sha fayl yangi versiya oladi. */
    arxivla: f2DiskkaArxivlansinmi(akt), manba: f2Manba({ aktId: akt.id, raqam: akt.raqam ?? null, obyekt: akt.obyekt || null, oy: akt.oy || null }) };
}
