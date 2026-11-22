/**
 * hujjat_paket (masofaviy) — sayt «Hujjatlar paketi» bilan BIR xil nomzodlar va qoidalar (RPC t2_hujjat_paket_nomzod_v1 +
 * frontend paketReja/qoidaBilanAjrat). Worker hujjat YASAMAYDI: Diskda tayyor turgan fayllar (sayt fonda yangilab turadi) bitta
 * ZIP ga yig'iladi — 15 daqiqalik /yukla/<kod> havola (ZIP yuklash paytida R2 dan yig'iladi). Diskda yo'q/eskirganlari ro'yxatda
 * «saytda yasaladi» deb ko'rsatiladi. Diskdagi tayyor fayllar sayt paketidagi kabi BEPUL.
 */
import { z } from 'zod';
import type { Muhit } from '../../smeta-mcp/src/muhit';
import type { ToolJavob } from '../../smeta-mcp/src/tool';
import { paketReja, qoidaBilanAjrat, TUR_NOMI, type Nomzod } from '../../smeta-mcp/src/frontend';
import type { Env } from './env';
import { HAVOLA_TTL, YUKLA_YO_L } from './fayl';
import { oqishMumkin, type Vakolat } from './vakolat';

const OY = /^\d{4}-(0[1-9]|1[0-2])$/;
export const PAKET_MAX_FAYL = 120;

export const paketKirish = {
  kompaniya_id: z.number().int().positive(),
  loyiha_ids: z.array(z.number().int().positive()).max(100).optional(),
  shartnoma_ids: z.array(z.number().int().positive()).max(100).optional(),
  obyekt_ids: z.array(z.number().int().positive()).max(200).optional(),
  oy_dan: z.string().regex(OY).optional().describe('YYYY-MM'), oy_gacha: z.string().regex(OY).optional().describe('YYYY-MM'),
  turlar: z.array(z.enum(['f2', 'forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka', 'aosr'])).optional(),
  holatlar: z.array(z.enum(['qoralama', 'tasdiqlangan'])).optional(),
  havola: z.boolean().optional().describe('true — Diskdagi tayyor fayllardan ZIP havola beradi; standart false — faqat ro\'yxat (preview)'),
};

const matn = (o: unknown, isError = false): ToolJavob => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }], ...(isError ? { isError: true } : {}) });
const faylNomi = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'hujjat';

type Kirish = { kompaniya_id: number; loyiha_ids?: number[]; shartnoma_ids?: number[]; obyekt_ids?: number[]; oy_dan?: string; oy_gacha?: string; turlar?: string[]; holatlar?: string[]; havola?: boolean };

export async function hujjatPaketMasofaviy(a: Kirish, mu: Muhit, v: Vakolat, env: Env, origin: string): Promise<ToolJavob> {
  if (!oqishMumkin(v, [a.kompaniya_id])) return matn('RUXSAT_YOQ — bu kompaniyaga ruxsat yo\'q.', true);
  const filtr = {
    ...(a.loyiha_ids?.length ? { loyiha_ids: a.loyiha_ids } : {}), ...(a.shartnoma_ids?.length ? { shartnoma_ids: a.shartnoma_ids } : {}), ...(a.obyekt_ids?.length ? { obyekt_ids: a.obyekt_ids } : {}),
    ...(a.oy_dan ? { oy_dan: a.oy_dan } : {}), ...(a.oy_gacha ? { oy_gacha: a.oy_gacha } : {}), ...(a.turlar?.length ? { turlar: a.turlar } : {}), ...(a.holatlar?.length ? { holatlar: a.holatlar } : {}),
  };
  const r = await mu.oqish(async (m) => (await m.query<{ r: { ok: boolean; code?: string; nomzodlar?: Nomzod[]; jami?: number; kesilgan?: boolean } }>(
    'select public."t2_hujjat_paket_nomzod_v1"($1::bigint, $2::bigint, $3::jsonb) as r', [v.foydalanuvchiId, a.kompaniya_id, JSON.stringify(filtr)])).rows[0]?.r);
  if (!r?.ok || !r.nomzodlar) return matn(`${r?.code ?? 'NOMZOD_OQILMADI'}: nomzodlar o'qilmadi.`, true);
  const { yaroqli, rad } = qoidaBilanAjrat(r.nomzodlar);
  const reja = paketReja(r.nomzodlar, new Set(yaroqli.map((n) => n.kalit)));
  const qisqa = (n: Nomzod) => ({ tur: TUR_NOMI[n.tur] ?? n.tur, sarlavha: n.sarlavha, obyekt: n.obyekt_nom, oy: n.oy, holat: n.holat });
  const natija: Record<string, unknown> = {
    jami_nomzod: r.jami, kesilgan: r.kesilgan === true,
    diskda_tayyor: reja.diskdan.length, saytda_yasaladi: reja.yasash.length, olinmaydi: reja.olinmaydi.length,
    diskdan: reja.diskdan.slice(0, 150).map(qisqa),
    yasaladi: reja.yasash.slice(0, 150).map(qisqa),
    rad_etilgan: rad.slice(0, 100).map((x) => ({ ...qisqa(x.nomzod), sabab: x.sabab })),
  };
  if (a.havola !== true) {
    return matn({ rejim: 'preview — hech narsa yuklanmadi. ZIP havola uchun havola:true.', ...natija,
      eslatma: reja.yasash.length ? 'Diskda yo\'q yoki eskirgan hujjatlarni sayt fonda yangilaydi (bir necha daqiqa) yoki saytdagi «Hujjatlar paketi»dan yasaladi.' : undefined });
  }
  const tanlov = reja.diskdan.slice(0, PAKET_MAX_FAYL);
  if (!tanlov.length) return matn({ rejim: 'havola', ...natija, xato: 'Diskda tayyor fayl yo\'q — paket bo\'sh. Saytdagi «Hujjatlar paketi»dan foydalaning yoki birozdan so\'ng qayta so\'rang.' });
  const fayllar: Array<{ kalit: string; nom: string }> = [];
  const nomlar = new Set<string>();
  await mu.oqish(async (m) => {
    for (const n of tanlov) {
      if (n.fayl_id == null) continue;
      const y = (await m.query<{ j: Record<string, unknown> }>('select public.t2_hm_yuklab_v1($1, $2, $3) as j', [v.foydalanuvchiId, n.fayl_id, null])).rows[0]?.j;
      if (!y || y.ok !== true || !y.kalit) continue;
      const papka = faylNomi(TUR_NOMI[n.tur] ?? String(n.tur));
      let nom = `${papka}/${faylNomi(String(y.nom || n.sarlavha))}`;
      for (let i = 2; nomlar.has(nom); i++) nom = nom.replace(/(\.[^./]+)?$/, (e) => ` (${i})${e}`);
      nomlar.add(nom); fayllar.push({ kalit: String(y.kalit), nom });
    }
  });
  if (!fayllar.length) return matn({ rejim: 'havola', ...natija, xato: 'Disk fayllarini olib bo\'lmadi. Birozdan so\'ng qayta urinib ko\'ring.' }, true);
  const kod = crypto.getRandomValues(new Uint8Array(32)).reduce((s, x) => s + x.toString(16).padStart(2, '0'), '');
  const oy = a.oy_dan && a.oy_gacha && a.oy_dan === a.oy_gacha ? `_${a.oy_dan}` : '';
  await env.OAUTH_KV.put(`yukla:${kod}`, JSON.stringify({ zip: true, nom: `Hujjatlar_paketi${oy}.zip`, fayllar, aktor: v.foydalanuvchiId }), { expirationTtl: HAVOLA_TTL });
  console.log(JSON.stringify({ tur: 'mcp_remote', tool: 'hujjat_paket', aktor: v.foydalanuvchiId, kompaniya: a.kompaniya_id, fayl: fayllar.length }));
  return matn({ rejim: 'havola', ...natija, zip_fayllar: fayllar.length, havola: `${origin}${YUKLA_YO_L}${kod}`, havola_muddati: '15 daqiqa',
    token: 'bepul (Diskdagi tayyor fayllar)', izoh: 'Havolani foydalanuvchiga to\'liq bering. «saytda_yasaladi» dagilar ZIP da yo\'q — ularni sayt yasaydi.' });
}
