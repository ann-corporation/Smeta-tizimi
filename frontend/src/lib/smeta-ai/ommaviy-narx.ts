/**
 * Ommaviy narxlash — «Barcha narxsiz qatorlarni narxlash» (egasi 2026-11-05: raqobatchi smetani internetdan avtomatik
 * narxlaydi — bizda ham tez va kuchli bo'lsin). Sof mantiq; tarmoq/yozish — komponent va mavjud API orqali.
 *
 *   1. Navbat: obyektning narxsiz (NULL; foydalanuvchi belgilasa 0) RS/MAT/OB qatorlari nom kaliti + birlik kaliti bo'yicha
 *      birlashtiriladi (DB `t2_resurs_nom_kalit` / `t2_resurs_birlik_kalit` bilan aynan bir xil — `narx-katalog/kalit`).
 *   2. Ustuvorlik: kompaniya reestri (oldin qabul qilingan / faktura, so'nggi 12 oy, o'sha birlik) → katalog → КП → internet.
 *      Internetga faqat mahalliy manbada narxi topilmaganlar boradi (ЧЕЛ hech qachon, МАШ ham — mashina-soat internetda yo'q).
 *   3. Bir darajada bir nechta manba — arifmetik o'rtacha + har manba ko'rsatiladi; tarqoqlik > 30 % — belgi.
 *   4. Qabul: mavjud yozish yo'li — internet narxlari kompaniya reestriga (`narx_manba_yoz`, havola va sana bilan),
 *      smeta narxi `smeta_narxla_res_v3`, dalil `narx_dalil_bogla` (t2_narx_dalil). Yangi yozish yo'li yo'q.
 * Narx doim QQS siz; NULL ≠ 0.
 */
import { qqsSizNarx, NDS_SUKUT_FOIZ, yaxlit2 } from '../hisob-yadro';
import { birlikKalit, nomKalit } from '../narx-katalog/kalit';
import { narxBirlikKoef } from './narx-birlik';
import { narxTarqoqligi, TARQOQ_CHEGARA, type InternetIshonch, type InternetNatija } from './internet-narx';

export type NavbatQatori = { id: number; tur: string | null; kat: string | null; kod?: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null };
export type NavbatGuruh = {
  kalit: string; nom: string; birlik: string; kat: string | null;
  /** Total quantity over the grouped estimate lines (null when no line has a quantity). */
  hajm: number | null; qatorIds: number[]; nolNarxli: number;
};

/** DB-equal resource key: nom kaliti | birlik kaliti. */
export const resursKalit = (nom: string | null | undefined, birlik: string | null | undefined) => `${nomKalit(nom)}|${birlikKalit(birlik)}`;

/** Unpriced lines → deduplicated queue (largest quantity first). Zero prices only when the user asked (owner: 0 = 0). */
export function narxsizNavbat(qatorlar: readonly NavbatQatori[], opts: { nolHam?: boolean } = {}): NavbatGuruh[] {
  const m = new Map<string, NavbatGuruh>();
  for (const q of qatorlar) {
    if (!['rs', 'mat', 'ob'].includes(String(q.tur)) || q.kat === 'ЧЕЛ') continue;
    const nol = q.narx != null && Number(q.narx) === 0;
    if (!(q.narx == null || (opts.nolHam && nol))) continue;
    const nk = nomKalit(q.nom), bk = birlikKalit(q.birlik);
    if (!nk || !bk) continue;
    const kalit = `${nk}|${bk}`;
    const g = m.get(kalit) ?? { kalit, nom: String(q.nom ?? '').trim(), birlik: String(q.birlik ?? '').trim(), kat: q.kat, hajm: null, qatorIds: [], nolNarxli: 0 };
    g.qatorIds.push(q.id);
    if (q.hajm != null && Number.isFinite(Number(q.hajm))) g.hajm = yaxlit2((g.hajm ?? 0) + Number(q.hajm));
    if (nol) g.nolNarxli++;
    m.set(kalit, g);
  }
  return [...m.values()].sort((a, b) => b.qatorIds.length - a.qatorIds.length || (b.hajm ?? 0) - (a.hajm ?? 0));
}

/** Labour never goes anywhere; machine-hours only to local sources (no meaningful web price per machine-hour). */
export const internetgaMumkin = (g: Pick<NavbatGuruh, 'kat'>) => g.kat !== 'ЧЕЛ' && g.kat !== 'МАШ';

export type ManbaDaraja = 'reestr' | 'katalog' | 'kp' | 'internet';
export const DARAJA_TARTIBI: readonly ManbaDaraja[] = ['reestr', 'katalog', 'kp', 'internet'];
export const DARAJA_NOMI: Record<ManbaDaraja, string> = { reestr: 'Kompaniya reestri', katalog: 'Katalog', kp: 'КП', internet: 'Internet' };

/** Offer row as returned by `sbNarxTakliflarOl` (company sources + platform catalogue). */
export type LokalTaklif = {
  qator_id: number; manba_qator_id: number; manba_id: number; manba_tur: string; manba_nom: string; manba_sana: string | null;
  yil: number | null; kvartal: number | null; nds_holati: 'nds_siz' | 'nds_bilan' | 'nomalum'; manba_nom_qator: string;
  manba_birlik: string | null; manba_narx: number; platforma?: boolean | null; region?: string | null;
};

const YIL_MS = 365 * 24 * 3600 * 1000;
/** Source date: explicit date, else the end of its year/quarter; null when unknown. */
function manbaSanasi(t: Pick<LokalTaklif, 'manba_sana' | 'yil' | 'kvartal'>): number | null {
  const d = t.manba_sana ? Date.parse(t.manba_sana) : NaN;
  if (Number.isFinite(d)) return d;
  if (t.yil) return Date.UTC(t.yil, t.kvartal ? t.kvartal * 3 : 12, 0);
  return null;
}
/** Priority level of a local offer: own registry (accepted internet / invoices, ≤ 12 months) → catalogue → КП. */
export function taklifDarajasi(t: LokalTaklif, bugun = new Date()): Exclude<ManbaDaraja, 'internet'> {
  if (t.manba_tur === 'kp') return 'kp';
  if (!t.platforma && (t.manba_tur === 'boshqa' || t.manba_tur === 'faktura')) {
    const s = manbaSanasi(t);
    if (s != null && bugun.getTime() - s <= YIL_MS) return 'reestr';
  }
  return 'katalog';
}

export type TaklifManba = { daraja: ManbaDaraja; nom: string; url: string | null; sana: string | null; narx: number; manbaQatorId: number | null; izoh: string | null; ishonch?: InternetIshonch | null };
export type NarxTaklifi = {
  kalit: string; daraja: ManbaDaraja; narx: number; manbalar: TaklifManba[]; ishonch: InternetIshonch;
  tarqoq: number | null; izoh: string | null;
};

/** VAT-free estimate-unit price of a local offer; null when its unit cannot be converted exactly. */
export function lokalNarx(t: LokalTaklif, smetaBirlik: string): number | null {
  const k = narxBirlikKoef(t.manba_birlik, smetaBirlik).koef;
  if (k == null || !(t.manba_narx > 0)) return null;
  const n = t.nds_holati === 'nds_bilan' ? qqsSizNarx(t.manba_narx, NDS_SUKUT_FOIZ) : t.manba_narx;
  return yaxlit2(n * k);
}

/**
 * Local proposal for a group: the highest-priority level that has a convertible offer; within it distinct source rows are
 * averaged arithmetically (owner rule), each shown. Confidence: registry / single catalogue row — «yuqori»; spread > 30 % — «orta».
 */
export function lokalTaklif(g: NavbatGuruh, takliflar: readonly LokalTaklif[], bugun = new Date()): NarxTaklifi | null {
  const ids = new Set(g.qatorIds);
  const bor = new Map<number, LokalTaklif>();
  for (const t of takliflar) if (ids.has(t.qator_id) && !bor.has(t.manba_qator_id)) bor.set(t.manba_qator_id, t);
  for (const daraja of DARAJA_TARTIBI) {
    if (daraja === 'internet') break;
    const l = [...bor.values()].filter(t => taklifDarajasi(t, bugun) === daraja)
      .map(t => ({ t, narx: lokalNarx(t, g.birlik) })).filter((x): x is { t: LokalTaklif; narx: number } => x.narx != null);
    if (!l.length) continue;
    const narx = yaxlit2(l.reduce((s, x) => s + x.narx, 0) / l.length);
    const tarqoq = narxTarqoqligi(l.map(x => x.narx));
    const nds = l.some(x => x.t.nds_holati === 'nomalum');
    const izoh = [l.length > 1 ? `${l.length} ta manba o‘rtachasi` : null, tarqoq != null && tarqoq > TARQOQ_CHEGARA ? `tarqoqlik ${Math.round(tarqoq * 100)} %` : null,
      nds ? 'manbada QQS holati noma’lum' : null].filter(Boolean).join('; ') || null;
    return { kalit: g.kalit, daraja, narx, tarqoq, izoh,
      ishonch: tarqoq != null && tarqoq > TARQOQ_CHEGARA ? 'orta' : daraja === 'kp' && l.length === 1 ? 'orta' : 'yuqori',
      manbalar: l.map(x => ({ daraja, nom: `${x.t.manba_nom} — ${x.t.manba_nom_qator}`, url: null, sana: x.t.manba_sana, narx: x.narx, manbaQatorId: x.t.manba_qator_id, izoh: null })) };
  }
  return null;
}

/** Internet result → proposal (only page/fragment-verified sources; never a price without a link). */
export function internetTaklif(g: NavbatGuruh, n: InternetNatija): NarxTaklifi | null {
  const ok = n.manbalar.filter(m => m.tekshirildi && m.smetaNarx != null && /^https:\/\//i.test(m.url));
  if (n.narx == null || !ok.length) return null;
  const tarqoq = n.tarqoq ?? narxTarqoqligi(ok.map(m => m.smetaNarx as number));
  const izoh = [ok.length > 1 ? `${ok.length} ta manba o‘rtachasi` : null, tarqoq != null && tarqoq > TARQOQ_CHEGARA ? `tarqoqlik ${Math.round(tarqoq * 100)} %` : null,
    n.kesh ? 'shu oy keshidan (bepul)' : null].filter(Boolean).join('; ') || null;
  return { kalit: g.kalit, daraja: 'internet', narx: n.narx, tarqoq, izoh,
    ishonch: (tarqoq != null && tarqoq > TARQOQ_CHEGARA) ? 'orta' : (n.ishonch ?? 'orta'),
    manbalar: ok.map(m => ({ daraja: 'internet' as const, nom: m.sotuvchi || m.domen, url: m.url, sana: null, narx: m.smetaNarx as number,
      manbaQatorId: null, izoh: [m.birlikIzoh, m.ishonch === 'orta' ? 'sahifa skriptli — iqtibos bo‘yicha' : null].filter(Boolean).join('; ') || null, ishonch: m.ishonch ?? null })) };
}

/** Cache key of an internet price: (name key, unit key, region, month) — a repeat within the month is free. */
export function keshKalit(nom: string, birlik: string, hudud: string | null | undefined, sana = new Date()): string {
  const t = new Date(sana.getTime() + 5 * 3600 * 1000); // Asia/Tashkent (UTC+5) — the same month as the DB cache check
  const oy = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${nomKalit(nom)}|${birlikKalit(birlik)}|${nomKalit(hudud ?? '') || 'UZ'}|${oy}`;
}

/** Measured 2026-11-05: one resource = one web-search call ≈ 0,011 USD (flash + 6 results). */
export const INTERNET_USD_RESURS = 0.012;
export const AI_USTAMA_SUKUT = 0.4;
/** Estimated tokens for `n` internet resources (the server charges actual usage; cached ones are free). */
export function taxminiyToken(n: number, s: { usd_kurs: number; token_som: number } | null | undefined): number | null {
  if (!s || !(s.usd_kurs > 0) || !(s.token_som > 0) || n <= 0) return n <= 0 ? 0 : null;
  return Math.ceil((n * INTERNET_USD_RESURS * (1 + AI_USTAMA_SUKUT) * s.usd_kurs) / s.token_som);
}

export type KorikHolat = 'kutilmoqda' | 'qabul' | 'rad';
export type KorikQatori = { guruh: NavbatGuruh; taklif: NarxTaklifi | null; holat: KorikHolat; /** user-edited price (VAT-free); null = proposal */ tahrir: number | null; sabab?: string | null };

export const yakuniyNarx = (r: KorikQatori): number | null => (r.tahrir != null && r.tahrir >= 0 ? r.tahrir : r.taklif?.narx ?? null);

/** «Accept all high-confidence»: every pending row with a «yuqori» proposal. */
export const yuqorilarniQabul = (rows: readonly KorikQatori[]): KorikQatori[] =>
  rows.map(r => (r.holat === 'kutilmoqda' && r.taklif?.ishonch === 'yuqori' ? { ...r, holat: 'qabul' } : r));

export type QabulYuki = {
  /** Existing `smeta_narxla_res_v3` payload: one price per (name, unit) key. */
  narxlar: Array<{ nom: string; birlik: string; narx: number }>;
  /** Company registry rows (`narx_manba_yoz`, tur 'boshqa') for accepted internet / edited prices — with links and date. */
  reestr: Array<{ nom: string; birlik: string; narx: number; izoh: string; hudud: string | null; nds_holati: 'nds_siz' }>;
  /** Evidence for local sources that already have a row id: every estimate line → its first source row. */
  dalil: Array<{ qator_id: number; manba_qator_id: number; izoh: string }>;
  /** Groups whose evidence is the new registry row (linked after the registry write). */
  reestrKalitlar: string[];
};

/** Review → the payloads of the existing write path. Rejected / unpriced rows are never written. */
export function qabulYuki(rows: readonly KorikQatori[], hudud: string | null, sana = new Date()): QabulYuki {
  const out: QabulYuki = { narxlar: [], reestr: [], dalil: [], reestrKalitlar: [] };
  const kun = sana.toISOString().slice(0, 10);
  for (const r of rows) {
    const narx = yakuniyNarx(r);
    if (r.holat !== 'qabul' || narx == null || !(narx >= 0)) continue;
    out.narxlar.push({ nom: r.guruh.nom, birlik: r.guruh.birlik, narx });
    const tahrirlangan = r.tahrir != null && r.taklif?.narx !== r.tahrir;
    if (!r.taklif || r.taklif.daraja === 'internet' || tahrirlangan) {
      const havolalar = (r.taklif?.manbalar ?? []).filter(m => m.url).map(m => m.url as string);
      out.reestr.push({ nom: r.guruh.nom, birlik: r.guruh.birlik, narx, hudud, nds_holati: 'nds_siz',
        izoh: [`${kun}`, r.taklif ? DARAJA_NOMI[r.taklif.daraja] : 'qo‘lda', tahrirlangan ? 'foydalanuvchi tahriri' : null,
          r.taklif?.izoh, ...havolalar].filter(Boolean).join(' · ').slice(0, 1900) });
      out.reestrKalitlar.push(r.guruh.kalit);
    } else {
      const m = r.taklif.manbalar.find(x => x.manbaQatorId != null);
      if (m) for (const q of r.guruh.qatorIds) out.dalil.push({ qator_id: q, manba_qator_id: m.manbaQatorId as number,
        izoh: `Ommaviy narxlash · ${DARAJA_NOMI[r.taklif.daraja]}${r.taklif.manbalar.length > 1 ? ` · ${r.taklif.manbalar.length} manba o‘rtachasi` : ''}` });
    }
  }
  return out;
}
