/**
 * Paketli oldindan o'qish (tezlik, migratsiya 20261212800000).
 * Obyektlar ro'yxati/F2 reestri har obyekt uchun alohida `obyekt_nakrutka_v1` so'rovi berardi (14-33 ta, har biri 0,6-5 s:
 * vaqtning asosi HTTP/shlyuzda, bazada emas). `t2NakrutkaOldindan` hammasini BITTA so'rovda o'qiydi va natijani qisqa muddat
 * xotirada saqlaydi; `t2ObyektNakrutka` avval shuni ko'radi (`paketdanOl`).
 * RPC yo'q (migratsiya qo'llanmagan) yoki xato bo'lsa - eski yo'l (har obyekt alohida), natija bir xil.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { USTAMA_HODISA } from '../umumiy/ui/ustama-kesh';

type Javob = { ok: boolean; [k: string]: unknown };
const OLDINDAN_MS = 20_000;
const PAKET_HAJMI = 50;
const kesh = new Map<string, { p: Promise<Javob | null>; t: number }>();
let paketYoq = false;
const kalit = (o: number, s?: number | null) => o + ':' + (s ?? '');
if (typeof window !== 'undefined') window.addEventListener(USTAMA_HODISA, () => kesh.clear());

export function t2NakrutkaOldindan(kompaniyaId: number, juftlar: ReadonlyArray<{ obyektId: number; shartnomaId?: number | null }>): void {
  if (paketYoq || !Number.isInteger(kompaniyaId) || kompaniyaId <= 0) return;
  const hozir = Date.now();
  const yangi = new Map<string, { obyekt_id: number; shartnoma_id: number | null }>();
  for (const j of juftlar) {
    const k = kalit(j.obyektId, j.shartnomaId);
    const bor = kesh.get(k);
    if (j.obyektId > 0 && !yangi.has(k) && !(bor && hozir - bor.t < OLDINDAN_MS)) yangi.set(k, { obyekt_id: j.obyektId, shartnoma_id: j.shartnomaId ?? null });
  }
  const royxat = [...yangi.values()];
  if (royxat.length < 2) return; // bitta obyekt uchun paket foyda bermaydi
  for (let i = 0; i < royxat.length; i += PAKET_HAJMI) {
    const qism = royxat.slice(i, i + PAKET_HAJMI);
    const paket = paketOqi(kompaniyaId, qism);
    for (const j of qism) {
      const k = kalit(j.obyekt_id, j.shartnoma_id);
      const p = paket.then((m) => m?.get(k) ?? null);
      kesh.set(k, { p, t: hozir });
      void p.then((v) => { if (!v && kesh.get(k)?.p === p) kesh.delete(k); });
    }
  }
}

/** Oldindan o'qilgan natija (bo'lsa); yo'q yoki xato - null (chaqiruvchi eski yo'lga tushadi). */
export async function paketdanOl(obyektId: number, shartnomaId?: number | null): Promise<Javob | null> {
  const bor = kesh.get(kalit(obyektId, shartnomaId));
  if (!bor || Date.now() - bor.t >= OLDINDAN_MS) return null;
  return bor.p;
}

async function paketOqi(kompaniyaId: number, juftlar: Array<{ obyekt_id: number; shartnoma_id: number | null }>): Promise<Map<string, Javob> | null> {
  try {
    const res = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'obyekt_nakrutka_paket_v1', kompaniya_id: kompaniyaId, juftlar }),
    });
    const r = await res.json() as { ok?: boolean; error?: string; natija?: { ok?: boolean; natijalar?: Array<{ obyekt_id: number; shartnoma_id: number | null; natija?: Javob }> } };
    if (!r?.ok || r.natija?.ok !== true || !Array.isArray(r.natija.natijalar)) {
      if (/\(404\)|not.?found|PGRST20|Could not find/i.test(r?.error ?? '')) paketYoq = true;
      return null;
    }
    const m = new Map<string, Javob>();
    for (const x of r.natija.natijalar) if (x?.natija?.ok === true) m.set(kalit(x.obyekt_id, x.shartnoma_id), x.natija);
    return m;
  } catch { return null; }
}