/**
 * Ish stoli (server-driven, rolga mos) klienti: GET /api/ish-joyi?bolim=ish_stoli. Veb, Android va Windows bir xil javobni chizadi.
 * Server ruxsatni allaqachon tekshirgan; bu fayl faqat o'qiydi va NOMA'LUM bo'lim turlari/maydonlarini yumshoq o'tkazib yuboradi
 * (oldinga moslik). Hujjat: docs/architecture/ISH_JOYI_ROL_V1.md.
 */
import { useEffect, useState } from 'react';

export type IshStoliAmal = { id: string; nom: string; ikonka: string; maqsad: { tur: 'native' | 'web'; kod: string; yol?: string }; birlamchi?: boolean };
export type IshStoliBolim = {
  id: string; tur: 'amallar' | 'royxat' | 'kpi' | 'matn'; nom: string; manba?: string; guruh?: string;
  amallar?: string[]; amal?: string; matn?: string; katta?: boolean;
};
export type IshStoliKabinet = { id: string; kompaniya_id: number | null; nom: string; tomon: string; tomon_nom: string; manba: string; joriy: boolean };
export type IshStoliJavob = {
  versiya: number; kabinetlar: IshStoliKabinet[]; joriy: string; kompaniya_id: number | null; tomon: string; tomon_nom: string;
  rejim: 'dala' | 'standart'; dala: { katta_tugma: boolean; oflayn: boolean; ovoz: boolean; foto: boolean } | null;
  amallar: IshStoliAmal[]; bolimlar: IshStoliBolim[]; birlamchi_amal: string | null;
};

const TURLAR = new Set(['amallar', 'royxat', 'kpi', 'matn']);
const s = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Tolerant parser: noma'lum bo'lim turi yoki buzuq qator tashlab yuboriladi; asosiy tuzilma yo'q bo'lsa — null. */
export function ishStoliParse(raw: unknown): IshStoliJavob | null {
  if (!obj(raw) || raw.ok !== true || !Array.isArray(raw.amallar) || !Array.isArray(raw.bolimlar) || !Array.isArray(raw.kabinetlar) || !s(raw.joriy)) return null;
  const amallar: IshStoliAmal[] = [];
  for (const a of raw.amallar) {
    if (!obj(a) || !s(a.id) || !s(a.nom) || !obj(a.maqsad) || !s(a.maqsad.kod)) continue;
    const tur = a.maqsad.tur === 'web' ? 'web' : 'native';
    amallar.push({ id: a.id, nom: a.nom, ikonka: s(a.ikonka) ? a.ikonka : a.id, maqsad: { tur, kod: a.maqsad.kod, ...(s(a.maqsad.yol) ? { yol: a.maqsad.yol } : {}) }, ...(a.birlamchi === true ? { birlamchi: true } : {}) });
  }
  const bor = new Set(amallar.map((a) => a.id));
  const bolimlar: IshStoliBolim[] = [];
  for (const b of raw.bolimlar) {
    if (!obj(b) || !s(b.id) || !s(b.nom) || !s(b.tur) || !TURLAR.has(b.tur)) continue; // noma'lum tur — o'tkazib yuboriladi
    const ids = Array.isArray(b.amallar) ? b.amallar.filter((x): x is string => typeof x === 'string' && bor.has(x)) : undefined;
    bolimlar.push({ id: b.id, nom: b.nom, tur: b.tur as IshStoliBolim['tur'], ...(s(b.manba) ? { manba: b.manba } : {}), ...(s(b.guruh) ? { guruh: b.guruh } : {}),
      ...(ids ? { amallar: ids } : {}), ...(s(b.amal) && bor.has(b.amal) ? { amal: b.amal } : {}), ...(s(b.matn) ? { matn: b.matn } : {}), ...(b.katta === true ? { katta: true } : {}) });
  }
  const kabinetlar: IshStoliKabinet[] = raw.kabinetlar.filter(obj).filter((c) => s(c.id) && s(c.nom)).map((c) => ({
    id: String(c.id), kompaniya_id: typeof c.kompaniya_id === 'number' ? c.kompaniya_id : null, nom: String(c.nom), tomon: String(c.tomon ?? ''), tomon_nom: String(c.tomon_nom ?? ''), manba: String(c.manba ?? ''), joriy: c.joriy === true,
  }));
  return {
    versiya: typeof raw.versiya === 'number' ? raw.versiya : 1, kabinetlar, joriy: raw.joriy as string,
    kompaniya_id: typeof raw.kompaniya_id === 'number' ? raw.kompaniya_id : null, tomon: String(raw.tomon ?? ''), tomon_nom: String(raw.tomon_nom ?? ''),
    rejim: raw.rejim === 'dala' ? 'dala' : 'standart',
    dala: obj(raw.dala) ? { katta_tugma: raw.dala.katta_tugma === true, oflayn: raw.dala.oflayn === true, ovoz: raw.dala.ovoz === true, foto: raw.dala.foto === true } : null,
    amallar, bolimlar, birlamchi_amal: s(raw.birlamchi_amal) && bor.has(raw.birlamchi_amal) ? raw.birlamchi_amal : null,
  };
}

/** Native modul kodi -> veb sahifa (veb native ekranni bilmaydi). Veb yo'li serverdan kelsa — o'sha ustun. */
const VEB_YOL: Readonly<Record<string, string>> = {
  obyektlar: '/admin/obyektlar', fakt: '/admin/fakt', foto: '/admin/foto', tasdiq: '/admin/bugun', bugun: '/admin/bugun',
  ombor: '/admin/logistika', jarvis: '/admin/ai-agentlar', rahbar: '/admin/dashboard', onboarding: '/admin/ish-joylarim',
};
export const amalYoli = (a: IshStoliAmal): string | null => a.maqsad.yol ?? VEB_YOL[a.maqsad.kod] ?? null;

export async function ishStoliOl(kompaniyaId: number | null, kabinet?: string | null): Promise<IshStoliJavob | null> {
  try {
    const q = new URLSearchParams({ bolim: 'ish_stoli' });
    if (kompaniyaId) q.set('kompaniya_id', String(kompaniyaId));
    if (kabinet) q.set('kabinet', kabinet);
    const r = await fetch('/api/ish-joyi?' + q.toString(), { credentials: 'same-origin' });
    if (!r.ok) return null;
    return ishStoliParse(await r.json());
  } catch { return null; }
}

/** React-query'siz (Bugun testlari provider'siz) — oddiy hook. null = yuklanmoqda yoki mavjud emas (eski ko'rinishga qaytiladi). */
export function useIshStoli(kompaniyaId: number | null, kabinet: string | null): IshStoliJavob | null {
  const [d, setD] = useState<IshStoliJavob | null>(null);
  useEffect(() => {
    let tirik = true;
    void ishStoliOl(kompaniyaId, kabinet).then((j) => { if (tirik) setD(j); });
    return () => { tirik = false; };
  }, [kompaniyaId, kabinet]);
  return d;
}
