/**
 * hujjat-sarf.ts — eksport tokenini SERVERDA majburlash (egasi: har hujjat/eksport natijasi token yechadi;
 * aynan shu mazmunni qayta yuklash takror yechmaydi).
 *
 * Oldin token faqat mijozda yechilardi (`hujjatTokenBilan` → `t2_token_sarfla_v1`), server esa to'lov dalilini faqat
 * TEKSHIRARDI (`hujjat-tolov.ts`). Endi dalil yo'q bo'lsa, `/api/hujjat-yukla` (pullik tur: F2 / F3) shu yerdagi
 * `serverSarfla` bilan o'zi yechadi — mijozdagi hisob faqat oldindan ko'rsatish uchun qoladi.
 *
 *   - actor faqat sessiyadan (chaqiruvchi beradi); kompaniya a'zoligini RPC o'zi tekshiradi;
 *   - operation_id — tur + kompaniya + obyekt + davr + mazmun xeshidan deterministik UUID (qayta yuklash takror yechmaydi);
 *   - narx server hisoblagan formula katakkalari sonidan (`xlsx-yacheyka`, mijoz bilan bir xil qoida);
 *   - keyingi qadam (R2/reyestr) xato bersa — `serverQaytar` (t2_token_qaytar_v1);
 *   - token yetmasa — 402 `TOKEN_YETMAYDI` (kerak/balans bilan).
 */
import { supabaseBaseUrl } from './supabase-url';
import { xlsxYacheykaSoni } from '../../src/lib/xlsx-yacheyka';

export type SarfEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string };

/** Hujjat turi → token amali (mijoz `hujjatTokenBilan` / `tokenBilan` bilan bir xil). */
export const sarfAmali = (turi: string): 'f2_hujjat' | 'hujjat' => (turi === 'f2_hujjat' ? 'f2_hujjat' : 'hujjat');

const hex = async (s: string): Promise<string> => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** Deterministik UUID (v4 shaklida): eksport turi + kompaniya + obyekt + davr + mazmun xeshi (+ urinish raqami). */
export async function sarfOperationId(p: { turi: string; kompaniyaId: number; obyektId?: number | null; davr?: string | null; xesh: string; urinish?: number }): Promise<string> {
  const h = await hex(`eksport|${p.turi}|${p.kompaniyaId}|${p.obyektId ?? '-'}|${(p.davr ?? '-').slice(0, 7)}|${p.xesh}|${p.urinish ?? 0}`);
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type RpcNatija = { httpOk: boolean; body: Record<string, unknown> | null };
async function rpc(env: SarfEnv, nom: string, args: Record<string, unknown>): Promise<RpcNatija> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL || '') + '/rest/v1/rpc/' + nom, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY || '', Authorization: 'Bearer ' + (env.SUPABASE_KEY || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const j = await r.json().catch(() => null);
    return { httpOk: r.ok, body: j && typeof j === 'object' ? (j as Record<string, unknown>) : null };
  } catch { return { httpOk: false, body: null }; }
}

/** Sarf aynan shu operation_id bilan qaytarilganmi (qaytarilgan sarf qayta yuklashda yangi yechimni talab qiladi). */
async function qaytarilganmi(env: SarfEnv, kompaniyaId: number, sarfOp: string): Promise<boolean | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL || '') + '/rest/v1/t2_token_harakat?kompaniya_id=eq.' + kompaniyaId
      + '&tur=eq.qaytarish&bogliq_operation_id=eq.' + encodeURIComponent(sarfOp) + '&select=operation_id&limit=1',
    { headers: { apikey: env.SUPABASE_KEY || '', Authorization: 'Bearer ' + (env.SUPABASE_KEY || ''), Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return Array.isArray(j) ? j.length > 0 : null;
  } catch { return null; }
}

export type SarfNatija =
  | { ok: true; sarflandi: number; bepulTakror: boolean; operationId: string | null }
  | { ok: false; status: 402 | 502; code: string; xato: string; kerak?: number; balans?: number };

/**
 * Pullik hujjat uchun tokenni serverda yechish. `bytes` — server o'zi tekshirgan (sha256 mos) fayl baytlari.
 * Idempotent: shu mazmun (xesh) shu kompaniyada to'langan va qaytarilmagan bo'lsa — `bepulTakror` (RPC qoidasi);
 * shu operation_id qaytarilgan bo'lsa — keyingi urinish raqami bilan yangi yechim.
 * `operationId` faqat yangi yechilgan (sarflandi > 0) holatda qaytadi — xato bo'lsa qaytarish uchun.
 */
export async function serverSarfla(env: SarfEnv, p: {
  actorId: number; kompaniyaId: number; turi: string; obyektId?: number | null; davr?: string | null; xesh: string; bytes: Uint8Array;
}): Promise<SarfNatija> {
  const yacheyka = xlsxYacheykaSoni(p.bytes);
  const amal = sarfAmali(p.turi);
  const meta: Record<string, string | number> = {
    hujjat: p.turi, sabab: 'server: arxivga saqlash', yacheyka, sanoq: 'formula', xesh: p.xesh, server: 1,
  };
  if (p.obyektId != null) meta.obyekt = p.obyektId;
  if (p.davr) meta.davr = String(p.davr).slice(0, 7);
  for (let urinish = 0; urinish < 3; urinish++) {
    const operationId = await sarfOperationId({ turi: p.turi, kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, davr: p.davr, xesh: p.xesh, urinish });
    const r = await rpc(env, 't2_token_sarfla_v1', {
      p_actor_id: p.actorId, p_kompaniya_id: p.kompaniyaId, p_amal: amal, p_birlik_soni: yacheyka, p_operation_id: operationId, p_meta: meta,
    });
    const b = r.body;
    if (!r.httpOk || !b) return { ok: false, status: 502, code: 'TOKEN_SARF_XATO', xato: 'Token yechib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.' };
    if (b.ok !== true) {
      const code = typeof b.code === 'string' ? b.code : 'TOKEN_SARF_XATO';
      if (code === 'TOKEN_YETMAYDI') {
        return { ok: false, status: 402, code, kerak: Number(b.kerak), balans: Number(b.balans),
          xato: `Token yetmaydi: kerak ${b.kerak ?? '?'}, balans ${b.balans ?? '?'}. «Tokenlar va obuna» bo‘limida sotib oling.` };
      }
      return { ok: false, status: 502, code, xato: 'Token yechib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.' };
    }
    if (b.takror === true) {
      // Shu operation_id avval ishlatilgan: qaytarilgan bo'lsa — yangi urinish; qaytarilmagan (yoki bilib bo'lmadi) — to'langan deb hisoblanadi.
      if ((await qaytarilganmi(env, p.kompaniyaId, operationId)) === true) continue;
      return { ok: true, sarflandi: 0, bepulTakror: true, operationId: null };
    }
    const sarflandi = Number(b.sarflandi) || 0;
    return { ok: true, sarflandi, bepulTakror: b.bepul_takror === true, operationId: sarflandi > 0 ? operationId : null };
  }
  return { ok: false, status: 502, code: 'TOKEN_SARF_XATO', xato: 'Token yechib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.' };
}

/** Server yechgan sarfni qaytarish (R2/reyestr yozuvi bajarilmadi). Muvaffaqiyatsiz bo'lsa ham arxiv javobini buzmaydi. */
export async function serverQaytar(env: SarfEnv, p: { actorId: number; kompaniyaId: number; sarfOperationId: string }): Promise<boolean> {
  const qaytarOp = await hex(`eksport-qaytar|${p.sarfOperationId}`);
  const v = ((parseInt(qaytarOp[16], 16) & 0x3) | 0x8).toString(16);
  const op = `${qaytarOp.slice(0, 8)}-${qaytarOp.slice(8, 12)}-4${qaytarOp.slice(13, 16)}-${v}${qaytarOp.slice(17, 20)}-${qaytarOp.slice(20, 32)}`;
  const r = await rpc(env, 't2_token_qaytar_v1', {
    p_actor_id: p.actorId, p_kompaniya_id: p.kompaniyaId, p_sarf_operation_id: p.sarfOperationId, p_operation_id: op, p_sabab: 'server: arxivga saqlash bajarilmadi',
  });
  return r.httpOk && r.body?.ok === true;
}

export function sarfRad(n: Extract<SarfNatija, { ok: false }>): Response {
  return Response.json({ ok: false, code: n.code === 'TOKEN_YETMAYDI' ? 'TOKEN_YETMAYDI' : n.code, xato: n.xato, kerak: n.kerak, balans: n.balans }, { status: n.status });
}
