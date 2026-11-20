/**
 * `hujjat_paket` — universal Hujjatlar paketi (egasi 2026-11-19): sayt (F2 reestri > Hujjatlar paketi), Telegram va Jarvis bilan BIR xil nomzodlar
 * (RPC `t2_hujjat_paket_nomzod_v1`: Disk + akt reestri) va BIR xil qoidalar/reja (frontend/src/lib/hujjat-paket/nomzod.ts - ikkinchi marta yozilmagan).
 * Standart `tasdiq:false` — PREVIEW: filtr bo'yicha nomzodlar, nechtasi Diskdan (BEPUL), nechtasi yasaladi, taxminiy token bahosi (katak), qoida bilan rad etilganlar;
 * hech narsa yechilmaydi/yozilmaydi. `tasdiq:true` — Diskda yo'q F-2 lar `f2_excel` yo'li bilan yasaladi (token yechiladi, `disk:true` bo'lsa Diskka yoziladi) va `papka` ga
 * yoziladi + `Tarkib.txt`. Diskdagi tayyor fayllar MCP dan yuklanmaydi (R2 o'qish yo'q) - ularni sayt/Telegram paketi beradi; boshqa turlar (F-3, nakopitelniy ...) ham sayt orqali.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Mijoz } from '../db';
import { paketReja, qoidaBilanAjrat, tokenBahosi, TUR_NOMI, type Nomzod } from '../frontend';
import { dryRun, tool } from '../tool';
import { bittaAkt, standartPapka, faylNomiTozala } from './hujjat';

const OY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const hujjatPaket = tool({
  nom: 'hujjat_paket',
  tavsif: 'Hujjatlar paketi: filtr (loyiha/shartnoma/obyekt/oy oraliq/tur/holat) bo\'yicha nomzodlar (Disk + akt reestri), qaysilari Diskda (bepul) va qaysilari yasaladi, taxminiy token. '
    + 'Standart tasdiq:false — PREVIEW (hech narsa yechilmaydi). tasdiq:true — Diskda yo\'q F-2 lar yasaladi (token), fayllar `papka` ga + Tarkib.txt. '
    + 'Qoida: taxminiy qoralama va oyga ikkinchi F-2 kirmaydi; bekor kirmaydi. kompaniya_id kerak.',
  kirish: {
    kompaniya_id: z.number().int().positive(),
    loyiha_ids: z.array(z.number().int().positive()).max(100).optional(),
    shartnoma_ids: z.array(z.number().int().positive()).max(100).optional(),
    obyekt_ids: z.array(z.number().int().positive()).max(200).optional(),
    oy_dan: z.string().regex(OY).optional(), oy_gacha: z.string().regex(OY).optional(),
    turlar: z.array(z.enum(['f2', 'forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka', 'aosr'])).optional(),
    holatlar: z.array(z.enum(['qoralama', 'tasdiqlangan'])).optional(),
    kalitlar: z.array(z.string().max(240)).max(500).optional().describe('faqat shu hujjat kalitlari (f2:<akt_id> ...); bo\'sh = filtrga mos hammasi'),
    papka: z.string().min(1).optional(), disk: z.boolean().optional(),
    tasdiq: z.boolean().optional().describe('true — yasash va token yechish. Standart false (preview).'),
    dry_run: dryRun,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak();
    if (mu.kompaniyaDoira && !mu.kompaniyaDoira.includes(a.kompaniya_id)) throw new Error('RUXSAT_YOQ: bu kompaniyaga ruxsat yo\'q.');
    const tasdiq = a.tasdiq === true && a.dry_run !== true;
    const filtr = {
      ...(a.loyiha_ids?.length ? { loyiha_ids: a.loyiha_ids } : {}), ...(a.shartnoma_ids?.length ? { shartnoma_ids: a.shartnoma_ids } : {}), ...(a.obyekt_ids?.length ? { obyekt_ids: a.obyekt_ids } : {}),
      ...(a.oy_dan ? { oy_dan: a.oy_dan } : {}), ...(a.oy_gacha ? { oy_gacha: a.oy_gacha } : {}), ...(a.turlar?.length ? { turlar: a.turlar } : {}), ...(a.holatlar?.length ? { holatlar: a.holatlar } : {}),
    };
    const r = (await mu.oqish((m: Mijoz) => m.query<{ r: { ok: boolean; code?: string; nomzodlar?: Nomzod[]; jami?: number; kesilgan?: boolean } }>(
      'select public."t2_hujjat_paket_nomzod_v1"($1::bigint, $2::bigint, $3::jsonb) as r', [aktor, a.kompaniya_id, JSON.stringify(filtr)]))).rows[0]?.r;
    if (!r?.ok || !r.nomzodlar) throw new Error(`${r?.code ?? 'NOMZOD_OQILMADI'}: nomzodlar o'qilmadi`);
    const tanlangan = a.kalitlar?.length ? new Set(a.kalitlar) : new Set(qoidaBilanAjrat(r.nomzodlar).yaroqli.map((n) => n.kalit));
    const reja = paketReja(r.nomzodlar, tanlangan);
    const baho = tokenBahosi(reja, null);
    const sana = (n: Nomzod) => ({ kalit: n.kalit, tur: TUR_NOMI[n.tur] ?? n.tur, sarlavha: n.sarlavha, obyekt: n.obyekt_nom, oy: n.oy, holat: n.holat, ...(n.fayl_id != null ? { disk_versiya: n.versiya } : {}) });
    const natija: Record<string, unknown> = {
      rejim: tasdiq ? 'tasdiq (F-2 yasaladi, token yechiladi)' : 'preview (hech narsa yechilmadi/yozilmadi) — yasash uchun tasdiq:true',
      jami_nomzod: r.jami, kesilgan: r.kesilgan === true,
      reja: { tanlangan: reja.hujjatlar.length, diskdan_bepul: reja.diskdan.length, yasaladi: reja.yasash.length, olinmaydi: reja.olinmaydi.length, diskdan_bayt: reja.bayt, taxminiy_katak: baho.katak, eslatma: 'aniq token narxi hujjat yasalganda (f2_excel preview — haqiqiy RPC)' },
      diskdan: reja.diskdan.slice(0, 200).map(sana), yasaladi: reja.yasash.slice(0, 200).map(sana),
      olinmaydi: reja.olinmaydi.map(sana),
      rad_etilgan: qoidaBilanAjrat(r.nomzodlar).rad.map((x) => ({ ...sana(x.nomzod), sabab: x.sabab })),
    };
    if (!tasdiq) return natija;

    // F-2: Diskda tayyor bo'lsa zudlik bilan olinadi (bittaAkt: Disk afzal, token yuklab olishda), eskirgan/yo'q bo'lsa yasaladi.
    const aktlar = [...reja.yasash, ...reja.diskdan].filter((n) => n.tur === 'f2' && n.akt_id != null).slice(0, 20);
    const idlar = aktlar.map((n) => n.akt_id as number);
    const papka = path.resolve(a.papka ?? standartPapka());
    const satrlar = idlar.length ? (await mu.oqish((m: Mijoz) => m.query<{ id: number; obyekt_id: number; tur: string | null; holat: string | null; oy: string | null; raqam: string | null; kompaniya_id: number | null }>(
      `select a.id, a.obyekt_id, a.tur, a.holat, a.oy::text as oy, a.raqam, o.kompaniya_id from public.t2_akt a join public.t2_obyekt o on o.id = a.obyekt_id where a.id = any($1::bigint[]) and o.kompaniya_id = $2`, [idlar, a.kompaniya_id]))).rows : [];
    const yasaldi: unknown[] = []; const xatolar: string[] = [];
    for (const s of satrlar) {
      try { yasaldi.push(await bittaAkt(mu, s, { tasdiq: true, papka, disk: a.disk === true })); }
      catch (e) { xatolar.push(`akt #${s.id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    const boshqa = reja.yasash.filter((n) => !(n.tur === 'f2')).map((n) => n.sarlavha);
    const tarkib = ['HUJJATLAR PAKETI (MCP)', '', `F-2 yasaldi: ${yasaldi.length}`, ...aktlar.map((n) => `  ${n.sarlavha} ${n.obyekt_nom ?? ''} ${n.oy ?? ''}`.trimEnd()),
      '', `Diskda tayyor (sayt/Telegram paketi beradi): ${reja.diskdan.length}`, ...(boshqa.length ? ['', `Sayt orqali yasaladi (MCP da yo'q): ${boshqa.join(', ')}`] : []), ...(xatolar.length ? ['', 'Xato:', ...xatolar] : [])].join('\r\n');
    await fs.mkdir(papka, { recursive: true });
    const tarkibFayl = path.join(papka, faylNomiTozala('Tarkib.txt'));
    await fs.writeFile(tarkibFayl, tarkib, 'utf8');
    return { ...natija, papka, tarkib: tarkibFayl, yasaldi, xatolar, f2_chegara: aktlar.length < [...reja.yasash, ...reja.diskdan].filter((n) => n.tur === 'f2').length ? 'bir chaqiruvda ko\'pi bilan 20 ta F-2 yasaladi; qolganini qayta chaqiring' : undefined };
  },
});

export const HUJJAT_PAKET_TOOLLAR = [hujjatPaket];
