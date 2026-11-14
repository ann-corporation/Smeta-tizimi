/**
 * tahrir-farq.ts — chizma to'plamining ikki TAHRIRI farqi va uning pul ta'siri. Yangi aniqlagich YO'Q: elementlar P1/P2 parseri va `t2_loyiha_miqdor` dan, smeta
 * bilan bog'lanish `t2_loyiha_moslik` dan keladi (DB `t2_loyiha_tahrir_farq_v1`); bu yerda faqat hisob. Pul faqat lib/hisob-yadro orqali: bog'langan smeta
 * qatorining birlik narxi (QQS siz) x miqdor farqi; avval QQS bilan, keyin ustamali va ustamasiz (SummaJuft). Narx yo'q -> null («—»), 0 emas.
 * Asl smeta o'zgarmaydi: «smeta eskirgan» faqat belgi va qaror yozuvi.
 */
import { qatorSumma, qqsBilan, yigindi2, NDS_SUKUT_FOIZ } from '../hisob-yadro';
import { birlikkaQaytar } from './birlik';

export type TahrirHolat = 'yangi' | 'olingan' | 'ozgargan';
export type TahrirBog = { qator_id: number; kod: string | null; nom: string; birlik: string | null; hajm: number | null; narx: number | null; kat: string | null; bolim_id: number | null; bolim_nom: string | null };
export type TahrirItem = {
  varaq: string; kalit: string; nom: string; tur: string; belgi: string | null; holat: TahrirHolat;
  eski_birlik: string | null; yangi_birlik: string | null; eski_miqdor: number | null; yangi_miqdor: number | null; eski_norm: number | null; yangi_norm: number | null; foiz: number | null; boglar: TahrirBog[];
};
export type TahrirVaraq = { varaq: string; eski_soni: number; yangi_soni: number; ozgargan: number; olingan: number; yangi: number; ayni: number; holat: 'olingan_varaq' | 'yangi_varaq' | 'ozgargan' | 'ayni' };
export type TahrirQarorTuri = 'smetaga_kochir' | 'pereraschet' | 'qoldir';
export type TahrirQaror = { varaq: string; kalit: string; qaror: TahrirQarorTuri; sabab: string | null };
export type TahrirFarqDB = { eski_id: number; yangi_id: number; varaqlar: TahrirVaraq[]; items: TahrirItem[]; qarorlar: TahrirQaror[] };

export type TahrirQator = {
  item: TahrirItem;
  /** Baza birlikdagi farq (yangi - eski); noma'lum -> null. */
  farqNorm: number | null;
  /** Bog'langan asosiy smeta qatori (eng katta hajmli) va uning birligidagi farq. */
  qator: TahrirBog | null; farqQatorBirlikda: number | null;
  pulQQSsiz: number | null; pulQQSbilan: number | null; narxsiz: boolean;
  qaror: TahrirQarorTuri | null; qarorSabab: string | null;
};

export function tahrirQatorlari(d: TahrirFarqDB, qqsFoiz = NDS_SUKUT_FOIZ): TahrirQator[] {
  const qaror = new Map(d.qarorlar.map((q) => [`${q.varaq.toUpperCase()}|${q.kalit}`, q] as const));
  return d.items.map((item) => {
    const eski = item.holat === 'yangi' ? 0 : item.eski_norm; const yangi = item.holat === 'olingan' ? 0 : item.yangi_norm;
    const farqNorm = eski != null && yangi != null ? yangi - eski : null;
    const qator = [...item.boglar].sort((a, b) => (b.hajm ?? -1) - (a.hajm ?? -1))[0] ?? null;
    const f = qator && farqNorm != null ? birlikkaQaytar(farqNorm, qator.birlik) : null;
    const s = qatorSumma(f, qator?.narx ?? null);
    const q = qaror.get(`${item.varaq.toUpperCase()}|${item.kalit}`);
    return { item, farqNorm, qator, farqQatorBirlikda: f, pulQQSsiz: s, pulQQSbilan: s == null ? null : qqsBilan(s, qqsFoiz), narxsiz: s == null, qaror: q?.qaror ?? null, qarorSabab: q?.sabab ?? null };
  });
}

export type EskirganBolim = { bolimId: number; bolimNom: string | null; soni: number; varaqlar: string[]; pulQQSsiz: number; pulQQSbilan: number; narxsizSoni: number; qatorlar: TahrirQator[]; hal: number };

/** Smeta bo'limlari: tahrirda o'zgargan/olingan/yangi elementga bog'langan qatorlari bor bo'lim — ESKIRGAN (asl smeta o'zgarmaydi). */
export function eskirganBolimlar(qatorlar: readonly TahrirQator[]): EskirganBolim[] {
  const m = new Map<number, EskirganBolim>();
  for (const x of qatorlar) {
    if (!x.qator || x.qator.bolim_id == null) continue;
    const b = m.get(x.qator.bolim_id) ?? { bolimId: x.qator.bolim_id, bolimNom: x.qator.bolim_nom, soni: 0, varaqlar: [], pulQQSsiz: 0, pulQQSbilan: 0, narxsizSoni: 0, qatorlar: [], hal: 0 };
    b.soni++; b.qatorlar.push(x); if (!b.varaqlar.includes(x.item.varaq)) b.varaqlar.push(x.item.varaq);
    if (x.narxsiz) b.narxsizSoni++; if (x.qaror) b.hal++;
    m.set(x.qator.bolim_id, b);
  }
  for (const b of m.values()) { b.pulQQSsiz = yigindi2(b.qatorlar.map((x) => x.pulQQSsiz)); b.pulQQSbilan = yigindi2(b.qatorlar.map((x) => x.pulQQSbilan)); }
  return [...m.values()].sort((a, b) => Math.abs(b.pulQQSbilan) - Math.abs(a.pulQQSbilan) || b.soni - a.soni);
}

export type TahrirJami = { varaqOzgargan: number; varaqOlingan: number; varaqYangi: number; elementSoni: number; qarorKutadi: number; pulQQSsiz: number; pulQQSbilan: number; narxsizSoni: number; bogsizSoni: number };

export function tahrirJami(d: TahrirFarqDB, qatorlar: readonly TahrirQator[]): TahrirJami {
  const v = d.varaqlar;
  return {
    varaqOzgargan: v.filter((x) => x.holat === 'ozgargan').length, varaqOlingan: v.filter((x) => x.holat === 'olingan_varaq').length, varaqYangi: v.filter((x) => x.holat === 'yangi_varaq').length,
    elementSoni: qatorlar.length, qarorKutadi: qatorlar.filter((x) => !x.qaror).length,
    pulQQSsiz: yigindi2(qatorlar.map((x) => x.pulQQSsiz)), pulQQSbilan: yigindi2(qatorlar.map((x) => x.pulQQSbilan)),
    narxsizSoni: qatorlar.filter((x) => x.qator && x.narxsiz).length, bogsizSoni: qatorlar.filter((x) => !x.qator).length,
  };
}

/** Qaysi tahrirlar farqlanadi: eski = «smeta asosi» (bo'lmasa eng birinchi), yangi = eng oxirgisi. Ikkitadan kam bo'lsa null. */
export function tahrirJuftligi(t: readonly { id: number; smeta_asosi: boolean }[]): { eski: number; yangi: number; smetaEskirgan: boolean } | null {
  if (t.length < 2) return null;
  const asos = t.find((x) => x.smeta_asosi); const yangi = t[t.length - 1];
  const eski = asos ?? t[0];
  if (eski.id === yangi.id) return null;
  return { eski: eski.id, yangi: yangi.id, smetaEskirgan: !!asos };
}
