/**
 * Kundalik ish jurnali (P1, «Общий журнал работ») — SOF model (React/tarmoq yo'q; testlanadi).
 *
 * Tamoyil: saqlanadigan narsa FAQAT prorab izohi (`t2_ish_jurnal_izoh`). Kunning qolgan hamma qismi o'qishda hosil qilinadi:
 *   bajarilgan ishlar  — shu kunning FAKT aktlari (t2_akt tur=fakt, sana=kun; bekor qilinganlar kirmaydi) qatorlari, hajmi bo'yicha jamlangan;
 *   sklad kirimi       — t2_sklad_harakat (prixod) shu kuni;
 *   АОСР               — shu kuni sanalangan, imzolangan yoki qog'ozda akt (qoralama/bekor kirmaydi);
 *   murojaat/predpis.  — shu kuni yaratilgan murojaatlar (remark, predpisaniya, so'rov);
 *   ob-havo            — ixtiyoriy; tasdiq paytida snapshot sifatida izohga yoziladi.
 * Pul yo'q: jurnal faqat hajm va hodisalarni ko'rsatadi (shuning uchun SummaJuft/NULL≠0 masalasi tug'ilmaydi).
 */

export type JurnalIsh = { qatorId: number; kod: string; nom: string; birlik: string; hajm: number; aktlar: number };
export type JurnalKirim = { id: number; nomi: string; birligi: string; hajm: number; postavshik: string | null };
export type JurnalAosr = { id: number; raqam: string | null; ishNomi: string; holat: 'tasdiqlangan' | 'qogoz' };
export type JurnalMurojaat = { id: number; turi: string; sarlavha: string; holat: string; muddat: string | null };
export type JurnalObHavo = {
  harorat_min: number | null; harorat_max: number | null; yogin_mm: number | null; shamol_max: number | null; kod: number | null; manba: string | null; sana?: string | null;
};
export type JurnalIzoh = { izoh: string; odamlar: string; tasdiqlandi: boolean; versiya: number; obHavo: JurnalObHavo | null };

export type KunJurnali = {
  obyektId: number; obyektNomi: string; sana: string;
  ishlar: JurnalIsh[]; kirimlar: JurnalKirim[]; aosr: JurnalAosr[]; murojaatlar: JurnalMurojaat[];
  /** Ob-havo: tasdiqlangan izohdagi snapshot, aks holda jonli (ixtiyoriy) javob; yo'q — null (jurnal ob-havosiz ham to'liq). */
  obHavo: JurnalObHavo | null;
  izoh: JurnalIzoh | null;
  /** Qaysi manba o'qilmadi (tarmoq/ruxsat): jim yo'qotish yo'q — jurnalda «ma'lumot olinmadi» deb ko'rsatiladi. */
  olinmagan: Array<'ishlar' | 'kirim' | 'aosr' | 'murojaat' | 'izoh'>;
};

/* ───────────── xom qatorlar → model ───────────── */

export type XomAkt = { id: number; holat?: string | null };
export type XomAktQator = { akt_id: number; qator_id: number; hajm: number | string | null };
export type XomQator = { id: number; kod?: string | null; nom?: string | null; birlik?: string | null; tartib?: number | null };
export type XomKirim = { id: number; nomi?: string | null; birligi?: string | null; obyomi?: number | string | null; postavshik?: string | null; holat?: string | null; operatsiya?: string | null };
export type XomAosr = { id: number; raqam?: string | null; ish_nomi?: string | null; holat?: string | null; sana?: string | null };
export type XomMurojaat = { id: number; turi: string; sarlavha: string; holat: string; muddat: string | null; yaratildi: string; obyekt_nom?: string | null };

const son = (x: unknown): number | null => { const n = typeof x === 'string' && x.trim() === '' ? NaN : Number(x); return x == null || !Number.isFinite(n) ? null : n; };
const EPS = 1e-9;

/** Fakt aktlari qatorlari → kun ishlari: bir qator bir necha aktda bo'lsa hajmlar qo'shiladi (manfiy tuzatish ham); yig'indi 0 — tashlanadi. */
export function kunIshlari(aktlar: readonly XomAkt[], aktQatorlar: readonly XomAktQator[], qatorlar: readonly XomQator[]): JurnalIsh[] {
  const faol = new Set(aktlar.filter((a) => a.holat !== 'bekor').map((a) => a.id));
  const by = new Map(qatorlar.map((q) => [q.id, q]));
  const yig = new Map<number, { hajm: number; aktlar: Set<number> }>();
  for (const r of aktQatorlar) {
    const h = son(r.hajm);
    if (!faol.has(r.akt_id) || h == null) continue;
    const e = yig.get(r.qator_id) ?? { hajm: 0, aktlar: new Set<number>() };
    e.hajm += h; e.aktlar.add(r.akt_id);
    yig.set(r.qator_id, e);
  }
  return [...yig.entries()]
    .filter(([, e]) => Math.abs(e.hajm) > EPS)
    .map(([id, e]) => { const q = by.get(id); return { qatorId: id, kod: q?.kod ?? '', nom: q?.nom ?? `#${id}`, birlik: q?.birlik ?? '', hajm: Math.round(e.hajm * 1e6) / 1e6, aktlar: e.aktlar.size, t: q?.tartib ?? 1e12 }; })
    .sort((a, b) => a.t - b.t || a.qatorId - b.qatorId)
    .map(({ t: _t, ...r }) => r);
}

export function kunKirimlari(xom: readonly XomKirim[]): JurnalKirim[] {
  return xom.filter((x) => (x.operatsiya == null || x.operatsiya === 'prixod') && x.holat !== 'bekor' && x.holat !== 'storno')
    .map((x) => ({ id: x.id, nomi: x.nomi ?? '', birligi: x.birligi ?? '', hajm: son(x.obyomi) ?? 0, postavshik: x.postavshik ?? null }))
    .sort((a, b) => a.nomi.localeCompare(b.nomi, 'ru') || a.id - b.id);
}

export function kunAosr(xom: readonly XomAosr[], sana: string): JurnalAosr[] {
  return xom.filter((a) => a.sana === sana && (a.holat === 'tasdiqlangan' || a.holat === 'qogoz'))
    .map((a) => ({ id: a.id, raqam: a.raqam ?? null, ishNomi: a.ish_nomi ?? '', holat: a.holat as JurnalAosr['holat'] }))
    .sort((a, b) => a.id - b.id);
}

/** Shu obyekt va shu kunda yaratilgan murojaatlar (obyekt nomi bo'yicha: royxat RPC obyekt_nom beradi). */
export function kunMurojaatlari(xom: readonly XomMurojaat[], obyektNomi: string, sana: string): JurnalMurojaat[] {
  return xom.filter((m) => m.yaratildi?.slice(0, 10) === sana && (m.obyekt_nom ?? '') === obyektNomi && m.holat !== 'bekor')
    .map((m) => ({ id: m.id, turi: m.turi, sarlavha: m.sarlavha, holat: m.holat, muddat: m.muddat }))
    .sort((a, b) => a.id - b.id);
}

/** Jurnal bo'sh (hech qanday hodisa) — «bugun ish bo'lmadi» yoki ma'lumot kiritilmagan. */
export const kunBosh = (k: KunJurnali): boolean => !k.ishlar.length && !k.kirimlar.length && !k.aosr.length && !k.murojaatlar.length && !k.izoh?.izoh;

/* ───────────── ob-havo matni (WMO kodi) ───────────── */

export function obHavoKodMatni(kod: number | null | undefined): string {
  if (kod == null) return '';
  if (kod === 0) return 'ясно';
  if (kod <= 3) return 'переменная облачность';
  if (kod === 45 || kod === 48) return 'туман';
  if (kod >= 51 && kod <= 57) return 'морось';
  if (kod >= 61 && kod <= 67) return 'дождь';
  if (kod >= 71 && kod <= 77) return 'снег';
  if (kod >= 80 && kod <= 82) return 'ливень';
  if (kod >= 85 && kod <= 86) return 'снегопад';
  if (kod >= 95) return 'гроза';
  return '';
}

const f1 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }));

/** «ясно, температура от +3 до +11 °C, осадки 0 мм, ветер до 5 м/с»; ma'lumot yo'q — null (taxmin yo'q). */
export function obHavoMatni(o: JurnalObHavo | null | undefined): string | null {
  if (!o) return null;
  const sign = (n: number) => `${n > 0 ? '+' : ''}${f1(n)}`;
  const t = o.harorat_min != null && o.harorat_max != null ? `температура от ${sign(o.harorat_min)} до ${sign(o.harorat_max)} °C`
    : o.harorat_max != null ? `температура до ${sign(o.harorat_max)} °C` : o.harorat_min != null ? `температура от ${sign(o.harorat_min)} °C` : null;
  const qism = [obHavoKodMatni(o.kod) || null, t, o.yogin_mm != null ? `осадки ${f1(o.yogin_mm)} мм` : null, o.shamol_max != null ? `ветер до ${f1(o.shamol_max)} км/ч` : null].filter(Boolean);
  return qism.length ? qism.join(', ') : null;
}

/* ───────────── Jarvis / ekran uchun qisqa matn ───────────── */

const sanaRu = (iso: string) => iso.split('-').reverse().join('.');

/** AI yordamchi (buyruq satri «jurnal» vositasi) va ekran xulosasi uchun: faqat real ma'lumot, to'qilmaydi. */
export function jurnalMatni(k: KunJurnali, chek = 25): string {
  const n = (s: string, l: readonly unknown[]) => `${s}: ${l.length}`;
  const out: string[] = [`Kundalik ish jurnali — «${k.obyektNomi}», ${sanaRu(k.sana)}${k.izoh?.tasdiqlandi ? ' (prorab tasdiqlagan)' : k.izoh ? ' (qoralama)' : ' (prorab izohi yo‘q)'}.`];
  if (k.olinmagan.length) out.push(`DIQQAT: olinmadi — ${k.olinmagan.join(', ')} (jurnal to‘liq emas).`);
  out.push(n('Bajarilgan ishlar (fakt)', k.ishlar));
  for (const i of k.ishlar.slice(0, chek)) out.push(`- ${i.kod ? i.kod + ' ' : ''}${i.nom} — ${i.hajm.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${i.birlik}`.trim());
  if (k.ishlar.length > chek) out.push(`… yana ${k.ishlar.length - chek} ta`);
  out.push(n('Sklad kirimi', k.kirimlar));
  for (const i of k.kirimlar.slice(0, chek)) out.push(`- ${i.nomi} — ${i.hajm.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${i.birligi}${i.postavshik ? ` (${i.postavshik})` : ''}`);
  out.push(n('АОСР (shu kuni)', k.aosr));
  for (const i of k.aosr) out.push(`- № ${i.raqam ?? '—'} ${i.ishNomi} (${i.holat === 'tasdiqlangan' ? 'imzolangan' : 'qog‘ozda'})`);
  out.push(n('Murojaat/predpisaniya (shu kuni)', k.murojaatlar));
  for (const i of k.murojaatlar.slice(0, chek)) out.push(`- [${i.turi}] ${i.sarlavha} — ${i.holat}`);
  out.push(`Ob-havo: ${obHavoMatni(k.obHavo) ?? 'ma’lumot yo‘q'}`);
  if (k.izoh?.odamlar) out.push(`Odamlar/brigadalar: ${k.izoh.odamlar}`);
  out.push(`Prorab izohi: ${k.izoh?.izoh || '—'}`);
  return out.join('\n');
}
