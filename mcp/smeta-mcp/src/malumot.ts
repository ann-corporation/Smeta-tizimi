/** Bazadan umumiy o'qishlar (frontend o'qiydigan manbalar bilan bir xil: t2_qator, t2_qator_holat, ustama RPC, podval). */
import type { Mijoz } from './db';
import { podvalTanla, ustamaliHisobla, type KatKesim, type SvodYaxlit, type UstamaNatija } from './frontend';
import { son } from './format';

export const QATOR_USTUNLAR = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,narx_usul,qoshimcha,zamena,versiya,raqam,norma,replaces_line_id,change_type';

export const HOLAT_USTUNLAR = 'qator_id,ota_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,f2_summa_nomalum,almashtirilgan_hajm,almashtirilgan_summa,qoldiq_hajm,qoldiq_summa,f2_mumkin_hajm,f2_narx,fakt_manbasi';

export type QatorRow = {
  id: number; obyekt_id: number; ota_id: number | null; daraja: number | null; tartib: number | null;
  tur: string | null; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | null; narx: number | null; kat: string | null; summa: number | null;
  qoshimcha: boolean | null; zamena: boolean | null; versiya: number; norma: number | null;
  replaces_line_id: number | null; change_type: string | null;
  [k: string]: unknown;
};

export type HolatRow = {
  qator_id: number; ota_id: number | null; tur: string | null; kod: string | null; nom: string | null; birlik: string | null; kat: string | null;
  smeta_hajm: number | null; smeta_narx: number | null; smeta_summa: number | null;
  fakt_hajm: number | null; fakt_summa: number | null; f2_hajm: number | null; f2_summa: number | null;
  f2_summa_nomalum: number | null; almashtirilgan_hajm: number | null; almashtirilgan_summa: number | null;
  qoldiq_hajm: number | null; qoldiq_summa: number | null; f2_mumkin_hajm: number | null; f2_narx: number | null; fakt_manbasi: string | null;
};

export async function obyektBormi(m: Mijoz, obyektId: number): Promise<{ id: number; nom: string; kompaniya_id: number | null }> {
  const r = await m.query<{ id: number; nom: string; kompaniya_id: number | null }>('select id, nom, kompaniya_id from public.t2_obyekt where id = $1', [obyektId]);
  if (!r.rows[0]) throw new Error(`Obyekt #${obyektId} topilmadi.`);
  return r.rows[0];
}

export async function qatorlarOl(m: Mijoz, obyektId: number): Promise<QatorRow[]> {
  const r = await m.query<QatorRow>(`select ${QATOR_USTUNLAR} from public.t2_qator where obyekt_id = $1 order by tartib nulls last, id`, [obyektId]);
  return r.rows;
}

export async function holatlarOl(m: Mijoz, obyektId: number, ustunlar = HOLAT_USTUNLAR): Promise<HolatRow[]> {
  const r = await m.query<HolatRow>(`select ${ustunlar} from public.t2_qator_holat where obyekt_id = $1`, [obyektId]);
  return r.rows;
}

export type Ustama = {
  /** Kesim → ustamali (null — koeffitsient o'qilmadi). */
  hisobla: (k: KatKesim) => UstamaNatija | null;
  holat: 'tayyor' | 'yoq';
  izoh?: string;
  /** Server svod yaxlit xulosasi (t2_obyekt_nakrutka_v1.svod_yaxlit): bolimSummalari ga uzatiladi — yaxlit bo'limlarga ustama YO'Q (UI bilan bir xil). */
  svod?: SvodYaxlit | null;
};

/**
 * YAGONA summa yadrosi (SQL `_t2_summa_paket_v1`) — kesh (`t2_obyekt_kesh`) va ekran jamilari shu funksiyadan.
 * `aktId` berilsa — bitta akt (o'lchov 'aktlar', akt o'z podvali bilan), aks holda obyektning `olchov` jami.
 * Qaytadi: ustamasiz / ustamali (ИТОГО-4, QQS siz) / qqs_bilan / ustamasiz_qism; paket yo'q bo'lsa null.
 */
export type ServerPaket = { ustamasiz: number | null; ustamali: number | null; qqs_bilan: number | null; ustamasiz_qism: number | null; nk_manba: string | null };
export async function serverPaket(m: Mijoz, obyektId: number, olchov: 'smeta' | 'smeta_joriy' | 'fakt' | 'f2' | 'f2_qoralama' | 'aktlar', aktId: number | null = null): Promise<ServerPaket | null> {
  const r = await m.query<{ p: Record<string, unknown> | null }>(
    'select p.paket as p from public._t2_summa_paket_v1(array[$1::bigint], $2::text, case when $3::bigint is null then null else array[$3::bigint] end) p', [obyektId, olchov, aktId]);
  const p = r.rows[0]?.p;
  if (!p) return null;
  return { ustamasiz: son(p.ustamasiz as number), ustamali: son(p.ustamali as number), qqs_bilan: son(p.qqs_bilan as number), ustamasiz_qism: son(p.ustamasiz_qism as number), nk_manba: (p.nk_manba as string | null) ?? null };
}

/**
 * Obyekt ustamasi: `t2_obyekt_nakrutka_v1` (useUstamaliSumma bilan bir xil manba) + amaldagi podval
 * (t2_nakrutka_podval_royxat → podvalTanla). RPC aktor talab qiladi — aktor yo'q bo'lsa ustamali hisoblanmaydi.
 */
export async function ustamaOl(m: Mijoz, obyektId: number, aktorId: number | null, shartnomaId: number | null = null): Promise<Ustama> {
  if (aktorId == null) return { hisobla: () => null, holat: 'yoq', izoh: 'aktor o\'rnatilmagan — ustamali hisoblanmadi (aktor_tanla).' };
  const r = await m.query<{ n: { ok?: boolean; code?: string; koeffitsientlar?: Record<string, number>; svod_yaxlit?: SvodYaxlit | null } | null }>(
    'select public.t2_obyekt_nakrutka_v1(p_obyekt_id => $1::bigint, p_actor_id => $2::bigint, p_shartnoma_id => $3::bigint) as n', [obyektId, aktorId, shartnomaId]);
  const n = r.rows[0]?.n;
  if (!n || n.ok !== true || !n.koeffitsientlar) return { hisobla: () => null, holat: 'yoq', izoh: `ustama koeffitsienti o'qilmadi${n?.code ? ` (${n.code})` : ''}` };
  const ob = await obyektBormi(m, obyektId);
  const pod = ob.kompaniya_id == null ? [] : (await m.query('select * from public.t2_nakrutka_podval_royxat where kompaniya_id = $1 order by yangilandi desc limit 500', [ob.kompaniya_id])).rows;
  const p = podvalTanla(pod as unknown as Parameters<typeof podvalTanla>[0], { obyektId, shartnomaId });
  const podval = p ? { versiya: 1 as const, nom: p.nom, qatorlar: p.qatorlar } : null;
  const koef = n.koeffitsientlar;
  return { hisobla: (k) => ustamaliHisobla(k, koef, podval as Parameters<typeof ustamaliHisobla>[2]), holat: 'tayyor', svod: n.svod_yaxlit ?? null, ...(podval ? { izoh: `podval: ${podval.nom}` } : {}) };
}

/** Kesimning to'liq ustamasiz yig'indisi (kat noma'lum ham); summasi noma'lum qatorlar bo'lsa ham ma'lum qismi. */
export function kesimJami(k: KatKesim): number | null {
  const s = Object.values(k.summalar).reduce<number>((a, b) => a + (son(b) ?? 0), 0) + k.nomalum;
  const bor = Object.keys(k.summalar).length > 0 || k.nomalumSoni > 0;
  return bor ? s : null;
}
