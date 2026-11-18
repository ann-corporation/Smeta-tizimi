/**
 * MINUS fakt — «normaga keltirish» (hajm<0) qatorlarining asos (BASE) ish bilan juftlari va faktsiz qolganlarini to'ldirish.
 * Yangi fakt yozilganda juft avtomatik ergashadi (DB: t2_fakt_yoz); bu tool — eski (ergashishdan oldingi) bo'shliqlarni obyektma-obyekt ko'rish/to'ldirish.
 *   amal "juftlar" (standart emas) — aniqlanmagan juftlar (noaniq/juftsiz) hisoboti; TAXMIN QILINMAYDI.
 *   amal "korik" — yetishmayotgan MINUS faktlari ro'yxati (faqat o'qiydi).
 *   amal "qollash" — t2_fakt_minus_qollash_v1 (bitta fakt akti, izoh «minus juft backfill»); dry_run STANDART true.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { obyektBormi } from '../malumot';
import { obyektIdS, tool } from '../tool';
import { dryRunT, opS, qisqa, quruq, rpcOk, sanaS } from './ish-oqimi';

export type MinusJuftSatr = { minus_id: number; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; holat: string; nomzodlar: number[] | null };
export type KorikSatr = { qator_id: number; minus_id: number; baza_id: number; tur: string; qoida: string; kod: string | null; nom: string | null; birlik: string | null; smeta_hajm: number; joriy_fakt: number; kerakli_fakt: number; farq: number };

const son = (x: unknown) => (x == null ? null : Number(x));

/** Ko'rish qatorlarini ixcham javobga (sof funksiya — testlanadi). */
export function korikXulosa(rows: readonly KorikSatr[], n: number) {
  const minus = new Set(rows.map((r) => Number(r.minus_id)));
  return {
    qator_soni: rows.length, minus_qator: minus.size,
    ...(n ? { namuna: rows.slice(0, n).map((r) => ({ qator_id: Number(r.qator_id), tur: r.tur, minus_id: Number(r.minus_id), baza_id: Number(r.baza_id), qoida: r.qoida, kod: r.kod, nom: qisqa(r.nom, 50), smeta_hajm: son(r.smeta_hajm), joriy_fakt: son(r.joriy_fakt), kerakli_fakt: son(r.kerakli_fakt), farq: son(r.farq) })) } : {}),
  };
}

export const minusFakt = tool({
  nom: 'minus_fakt',
  tavsif: 'MINUS («normaga keltirish», hajm<0) qatorlar fakti. Yangi fakt yozilganda asosga ulush bo\'yicha JUFT (va MAT/OB bolalari) avtomatik ergashadi (DB); '
    + 'bu tool eski bo\'shliqlar uchun. `amal`: "korik" (standart; yetishmayotgan MINUS faktlari, faqat o\'qiydi) | "juftlar" (aniqlanmagan juftlar: noaniq/juftsiz — taxmin qilinmaydi) | '
    + '"qollash" (t2_fakt_minus_qollash_v1: bitta fakt akti, izoh «minus juft backfill»; `dry_run` STANDART true — haqiqiy yozish uchun dry_run:false). '
    + 'Qo\'llashdan keyin F2 qoralamani f2_qoralama_yangila {qosh_yangi:true} bilan yangilang. Obyektma-obyekt.',
  kirish: {
    obyekt_id: obyektIdS, amal: z.enum(['korik', 'juftlar', 'qollash']).optional(), sana: sanaS.optional(),
    korsat: z.number().int().min(0).max(500).optional().describe('javobdagi namuna qatorlar soni (standart 20)'), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const amal = a.amal ?? 'korik'; const n = a.korsat ?? 20;
    if (amal === 'juftlar') {
      return mu.oqish(async (m) => {
        await obyektBormi(m, a.obyekt_id);
        const hammasi = (await m.query<{ holat: string; soni: number }>('select holat, count(*)::int as soni from public.t2_fakt_minus_juft_v1($1::bigint) group by holat', [a.obyekt_id])).rows;
        const r = (await m.query<MinusJuftSatr>(
          `select q.id as minus_id, q.kod, left(q.nom, 120) as nom, q.birlik, q.hajm, j.holat, j.nomzodlar
             from public.t2_fakt_minus_juft_v1($1::bigint) j join public.t2_qator q on q.id = j.minus_id where j.holat <> 'aniq' order by q.tartib, q.id limit 500`, [a.obyekt_id])).rows;
        return {
          obyekt_id: a.obyekt_id, holatlar: Object.fromEntries(hammasi.map((x) => [x.holat, Number(x.soni)])),
          aniqlanmagan: r.slice(0, Math.max(n, 20)).map((x) => ({ minus_id: Number(x.minus_id), kod: x.kod, nom: qisqa(x.nom, 60), birlik: x.birlik, hajm: son(x.hajm), holat: x.holat, nomzodlar: x.nomzodlar ?? [] })),
          izoh: 'noaniq — bir nechta teng nomzod (qo\'lda fakt kiriting yoki asosni aniqlang); juftsiz — mos asos topilmadi. Bularga fakt avtomatik ergashmaydi.',
        };
      });
    }
    if (amal === 'korik') {
      return mu.oqish(async (m) => {
        await obyektBormi(m, a.obyekt_id);
        const rows = (await m.query<KorikSatr>('select * from public.t2_fakt_minus_korik_v1($1::bigint)', [a.obyekt_id])).rows;
        return { obyekt_id: a.obyekt_id, ...korikXulosa(rows, n), izoh: 'Faqat ko\'rish — hech narsa yozilmadi. To\'ldirish: amal "qollash" (dry_run standart true).' };
      });
    }
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    return mu.yozish({ tool: 'minus_fakt', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `qollash ${a.sana ?? ''}`.trim() }, async (m) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      const res = await rpcOk(m, 't2_fakt_minus_qollash_v1', {
        p_actor_id: aktor, p_kompaniya_id: Number(ob.kompaniya_id), p_obyekt_id: a.obyekt_id, p_sana: a.sana ?? null, p_dry_run: dry, p_operation_id: a.operation_id ?? randomUUID(),
      }, aktor);
      const qat = Array.isArray(res.qatorlar) ? (res.qatorlar as KorikSatr[]) : [];
      return {
        ...(qat.length ? korikXulosa(qat, n) : {}),
        akt_id: res.akt_id ?? null, qator_soni: res.qator_soni ?? 0, aniqlanmagan_juft: res.aniqlanmagan_juft ?? 0, ...(res.izoh ? { izoh: res.izoh } : {}),
      };
    });
  },
});
