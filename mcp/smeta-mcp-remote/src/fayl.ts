/**
 * f2_fayl — rasmiy F-2 Excel fayli (sayt fonda tayyorlab Diskka qo'ygan versiya) uchun vaqtinchalik yuklab olish havolasi.
 * Fayl QAYTA YASALMAYDI: faqat Diskdagi yangilangan versiya (t2_hujjat_tayyor_ol_v1 → t2_hm_yuklab_v1 → R2 kalit).
 * Token sayt bilan bir xil qoidada yechiladi (serverSarfla, kalit f2HujjatKaliti — shu F-2 ni qayta yuklash bepul).
 * Havola: /yukla/<tasodifiy 32 bayt> — KV da 15 daqiqa; ichida faqat R2 kalit/nom (sir yo'q). Begona kompaniya akti — RUXSAT_YOQ.
 */
import type { Muhit } from '../../smeta-mcp/src/muhit';
import type { ToolJavob } from '../../smeta-mcp/src/tool';
import { f2HujjatKaliti } from '../../../frontend/src/api/f2-hujjat-kontekst';
import { serverSarfla } from '../../../frontend/functions/_shared/hujjat-sarf';
import { havolalarYig, kompaniyalargaAylantir } from './doira';
import type { Env } from './env';
import { oqishMumkin, type Vakolat } from './vakolat';

export const HAVOLA_TTL = 900;
export const YUKLA_YO_L = '/yukla/';

const matn = (o: unknown, isError = false): ToolJavob => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }], ...(isError ? { isError: true } : {}) });

function tasodifiy(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function f2Fayl(aktId: number, mu: Muhit, v: Vakolat, env: Env, origin: string): Promise<ToolJavob> {
  const h = havolalarYig('f2_fayl', { akt_id: aktId });
  let komp: number[];
  try {
    const r = await mu.oqish((m) => kompaniyalargaAylantir(m, h));
    if (r.topilmadi.length) return matn(`RUXSAT_YOQ — topilmadi yoki ruxsat yo'q: akt ${aktId}`, true);
    komp = [...r.kompaniyalar];
  } catch { return matn('Ruxsat tekshiruvini bajarib bo\'lmadi (baza). Qayta urinib ko\'ring.', true); }
  if (!oqishMumkin(v, komp)) return matn('RUXSAT_YOQ — topilmadi yoki ruxsat yo\'q.', true);

  type Akt = { id: number; obyekt_id: number; kompaniya_id: number; oy: string | null; raqam: string | null; tur: string; holat: string | null; obyekt: string | null };
  const info = await mu.oqish(async (m) => {
    const akt = (await m.query<Akt>(`select a.id, a.obyekt_id, coalesce(o.kompaniya_id, a.kompaniya_id) as kompaniya_id, to_char(a.oy, 'YYYY-MM-DD') as oy, a.raqam, a.tur, a.holat, o.nom as obyekt
                                        from public.t2_akt a left join public.t2_obyekt o on o.id = a.obyekt_id where a.id = $1`, [aktId])).rows[0];
    if (!akt) return null;
    const t = (await m.query<{ j: Record<string, unknown> }>('select public.t2_hujjat_tayyor_ol_v1($1, $2, $3) as j', [v.foydalanuvchiId, akt.kompaniya_id, aktId])).rows[0]?.j ?? null;
    let y: Record<string, unknown> | null = null;
    if (t?.ok === true && t.eskirgan !== true && t.fayl_id != null) {
      y = (await m.query<{ j: Record<string, unknown> }>('select public.t2_hm_yuklab_v1($1, $2, $3) as j', [v.foydalanuvchiId, Number(t.fayl_id), null])).rows[0]?.j ?? null;
    }
    return { akt, t, y };
  });
  if (!info) return matn(`Akt ${aktId} topilmadi.`, true);
  const { akt, t, y } = info;
  if (akt.tur !== 'f2') return matn(`Akt ${aktId} — F-2 emas (tur: ${akt.tur}).`, true);
  if (!t || t.ok !== true || t.fayl_id == null) {
    return matn({ tayyor: false, akt_id: aktId, obyekt: akt.obyekt, sabab: 'Bu F-2 ning Diskdagi fayli hali yo\'q (sayt uni fonda tayyorlaydi).',
      maslahat: 'Foydalanuvchiga: saytdagi «Hujjatlar paketi» yoki F-2 sahifasidan yuklab oling; yoki 2–5 daqiqadan so\'ng qayta so\'rang.' });
  }
  if (t.eskirgan === true) {
    return matn({ tayyor: false, akt_id: aktId, obyekt: akt.obyekt, sabab: 'F-2 o\'zgargan — Diskdagi fayl yangilanish navbatida (fon tayyorlamoqda).',
      maslahat: 'Foydalanuvchiga: 2–5 daqiqadan so\'ng qayta so\'rang (eski versiya berilmaydi).' });
  }
  if (!y || y.ok !== true || !y.kalit) return matn('Faylni Diskdan olib bo\'lmadi. Birozdan so\'ng qayta urinib ko\'ring.', true);
  if (!env.SNAPSHOT_R2) return matn('Fayl ombori (R2) ulanmagan — administratorga xabar bering.', true);
  const obj = await env.SNAPSHOT_R2.get(String(y.kalit));
  if (!obj) return matn('Fayl omborda topilmadi. Birozdan so\'ng qayta urinib ko\'ring.', true);
  const bytes = new Uint8Array(await obj.arrayBuffer());

  const xesh = f2HujjatKaliti(akt.obyekt_id, akt.oy ?? '', akt.raqam, akt.id) ?? `f2:${akt.obyekt_id}:akt${akt.id}`;
  const s = await serverSarfla(env, { actorId: v.foydalanuvchiId, kompaniyaId: akt.kompaniya_id, turi: 'f2_hujjat', obyektId: akt.obyekt_id, davr: akt.oy, xesh, bytes });
  if (!s.ok) return matn({ tayyor: false, akt_id: aktId, sabab: s.xato, kod: s.code }, true);

  const kod = tasodifiy();
  const nom = String(y.nom || `F-2_${aktId}.xlsx`);
  await env.OAUTH_KV.put(`yukla:${kod}`, JSON.stringify({ kalit: String(y.kalit), nom, mime: y.mime ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', akt: aktId, aktor: v.foydalanuvchiId }), { expirationTtl: HAVOLA_TTL });
  console.log(JSON.stringify({ tur: 'mcp_remote', tool: 'f2_fayl', aktor: v.foydalanuvchiId, akt: aktId, token_sarf: s.sarflandi, bepul_takror: s.bepulTakror }));
  return matn({
    tayyor: true, akt_id: aktId, obyekt: akt.obyekt, oy: akt.oy, raqam: akt.raqam, holat: akt.holat, fayl: nom, hajm_kb: Math.round(bytes.byteLength / 1024),
    havola: `${origin}${YUKLA_YO_L}${kod}`, havola_muddati: '15 daqiqa',
    token: s.sarflandi > 0 ? `${s.sarflandi} token yechildi` : 'bepul (shu F-2 avval yuklangan)',
    disk_versiya: t.versiya ?? null, yangilangan: t.yangilandi ?? null,
    izoh: 'Havolani foydalanuvchiga to\'liq, o\'zgartirmasdan bering (bosib Excel faylni yuklab oladi).',
  });
}

/** GET /yukla/<kod> — KV dagi yozuv bo'yicha R2 dan faylni beradi (15 daqiqa amal qiladi). */
export async function yuklaGet(req: Request, env: Env): Promise<Response> {
  const kod = new URL(req.url).pathname.slice(YUKLA_YO_L.length);
  if (!/^[0-9a-f]{64}$/.test(kod)) return new Response('Havola noto\'g\'ri.', { status: 404 });
  const raw = await env.OAUTH_KV.get(`yukla:${kod}`);
  if (!raw) return new Response('Havola muddati o\'tgan yoki noto\'g\'ri. ChatGPT dan qayta so\'rang.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const y = JSON.parse(raw) as { kalit: string; nom: string; mime: string };
  const obj = env.SNAPSHOT_R2 ? await env.SNAPSHOT_R2.get(y.kalit) : null;
  if (!obj) return new Response('Fayl topilmadi.', { status: 404 });
  const nomAscii = y.nom.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return new Response(await obj.arrayBuffer(), { headers: {
    'Content-Type': y.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(y.nom)}`,
  } });
}
