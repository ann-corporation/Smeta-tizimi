/**
 * Ko'p nashrli platforma narx indeksi (egasi 2026-10-15: katalogni tizim boshqaruvchisi yuklab yangilab boradi va u butun
 * tizim bo'yicha ishlaydi). Bir nechta nashr (katalog, asosiy materiallar, birja) bitta R2 reviziyasiga birlashtiriladi:
 *
 *   • har qator o'z nashriga (manba) bog'lanadi — obosnovaniyada aynan qaysi hujjat, davr, hudud, ishlab chiqaruvchi;
 *   • bir mahsulot (nom + birlik + hudud + ishlab chiqaruvchi + manba turi) bir necha nashrda bo'lsa — faqat ENG YANGI nashr
 *     qoladi; eski nashr faqat yangisida yo'q mahsulotlar uchun ishlaydi (davri obosnovaniyada ko'rinadi);
 *   • bir nashr ichida takror bo'lsa — eng qimmat narx (egasi: "narxni eng qimmatiga").
 *
 * Qator id: nashr tartibi × 1 000 000 + tartib raqami — deterministik, nashrlar to'plami o'zgarmasa id lar o'zgarmaydi.
 */
import { birlikKalit, nomKalit } from './kalit';
import { hududAniqla, nashrSarlavhasi, type ManbaTuri, type Nashr } from './manba-xls';
import { PRICE_LOOKUP_ROWS, PRICE_ROWS_PER_FILE, PRICE_SHARD_SCHEMA, type PriceDict, type PriceManba, type PriceRow } from './price-shards';

export const MULTI_BUILD_FORMAT = 4;
const sha256 = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))].map(x => x.toString(16).padStart(2, '0')).join('');
export const ID_QADAM = 1_000_000;
/** A source registered in the index: the edition's identity without its rows. */
export type NashrMeta = Omit<Nashr, 'qatorlar'> & { sha256: string | null };

/** Newest first: price date, then year/quarter. */
export function nashrTartibi(a: Pick<Nashr, 'sana' | 'yil' | 'kvartal'>, b: Pick<Nashr, 'sana' | 'yil' | 'kvartal'>) {
  const ka = `${a.yil ?? 0}-${a.kvartal ?? 0}-${a.sana ?? ''}`, kb = `${b.yil ?? 0}-${b.kvartal ?? 0}-${b.sana ?? ''}`;
  return ka < kb ? 1 : ka > kb ? -1 : 0;
}

class Dict {
  values: string[] = []; private idx = new Map<string, number>();
  add(v: string | null) { if (v == null) return -1; let i = this.idx.get(v); if (i == null) { i = this.values.length; this.values.push(v); this.idx.set(v, i); } return i; }
}

export type BirlashtirNatija = {
  dict: PriceDict; rows: PriceRow[];
  counts: { nashrlar: number; kirish: number; rows: number; eskirganTashlandi: number; nashrIchidaTakror: number; boshqaNarxlar: number;
    turlar: Record<string, number>; nashrBoyicha: Array<{ nom: string; rows: number }> };
};

/**
 * Merges editions into one row set. `nashrlar` order does not matter (sorted newest first internally); ids follow the
 * oldest-first order so adding a NEWER edition never renumbers older ones.
 */
export function nashrlarniBirlashtir(nashrlar: Array<Nashr & { sha256?: string | null }>): BirlashtirNatija {
  if (!nashrlar.length) throw new Error('NASHR_YOQ');
  const eskidan = [...nashrlar].sort((a, b) => -nashrTartibi(a, b) || a.nom.localeCompare(b.nom));
  const manbalar: PriceManba[] = eskidan.map((n, i) => ({ id: i + 1, tur: n.tur, nom: nashrSarlavhasi(n), raqam: n.nom, sana: n.sana, yil: n.yil, kvartal: n.kvartal,
    region: null, yetkazuvchi: n.yetkazuvchi ?? null, nds_holati: 'nds_siz', fayl_document_id: n.sha256 ? `sha256:${n.sha256}` : null }));
  const d = { birlik: new Dict(), hudud: new Dict(), zavod: new Dict(), ndsHolati: new Dict(), ndsIzoh: new Dict(), variant: new Dict(), guruh: new Dict() };
  const egallangan = new Map<string, number>();   // product key → manba index that owns it
  const nashrIchida = new Map<string, number>();  // product key + manba → position in `out`
  const out: Array<{ manba: number; seq: number; r: PriceRow }> = [];
  const c: BirlashtirNatija['counts'] = { nashrlar: nashrlar.length, kirish: 0, rows: 0, eskirganTashlandi: 0, nashrIchidaTakror: 0, boshqaNarxlar: 0, turlar: {}, nashrBoyicha: [] };
  const yangidan = eskidan.map((n, i) => ({ n, i })).reverse();
  for (const { n, i } of yangidan) {
    let soni = 0, seq = 0;
    for (const q of n.qatorlar) {
      c.kirish++;
      // The id follows the row's position in ITS edition, so superseding/adding editions never renumbers other rows.
      seq++;
      const hk = hududAniqla(q.hudud)?.kalit ?? null;
      const key = [n.tur, nomKalit(q.nom), birlikKalit(q.birlik), hk ?? '', q.zavod ?? ''].join('\u0001');
      const egasi = egallangan.get(key);
      if (egasi != null && egasi !== i) { c.eskirganTashlandi++; continue; }
      const narx = String(Math.round(q.narx * 100) / 100);
      const oldin = nashrIchida.get(key);
      if (oldin != null) {
        c.nashrIchidaTakror++;
        const prev = out[oldin].r;
        if (Number(narx) > Number(prev[5])) { prev[5] = narx; c.boshqaNarxlar++; }
        continue;
      }
      egallangan.set(key, i);
      if (seq >= ID_QADAM) throw new Error('NASHR_JUDA_KATTA ' + n.nom);
      const row: PriceRow = [(i + 1) * ID_QADAM + seq, seq, null, q.nom, d.birlik.add(q.birlik), narx, d.hudud.add(hk ? hududAniqla(q.hudud)!.nom : q.hudud),
        d.zavod.add(q.zavod), d.ndsHolati.add('nds_siz'), d.ndsIzoh.add(q.izoh), n.yil, n.kvartal, d.variant.add(q.sana), d.guruh.add(q.guruh), i];
      nashrIchida.set(key, out.length);
      out.push({ manba: i, seq, r: row });
      soni++;
    }
    c.nashrBoyicha.push({ nom: n.nom, rows: soni });
    c.turlar[n.tur] = (c.turlar[n.tur] ?? 0) + soni;
  }
  const rows = out.map(x => x.r).sort((a, b) => a[0] - b[0]);
  c.rows = rows.length;
  const dict: PriceDict = { birlik: d.birlik.values, hudud: d.hudud.values, hududKalit: d.hudud.values.map(h => hududAniqla(h)?.kalit ?? null),
    zavod: d.zavod.values, ndsHolati: d.ndsHolati.values, ndsIzoh: d.ndsIzoh.values, variant: d.variant.values, guruh: d.guruh.values,
    manba: manbalar[manbalar.length - 1], manbalar, keyOverrides: {} };
  return { dict, rows, counts: c };
}

export type QurilganFayl = { path: string; text: string; sha256: string; bytes: number };
export type QurilganReviziya = { revision: string; manifest: Record<string, unknown> & { revision: string }; files: QurilganFayl[] };

/** Shards + manifest (same file layout the client and the server lookup already read). */
export async function reviziyaQur(b: BirlashtirNatija, nashrlar: NashrMeta[], builtAt: string): Promise<QurilganReviziya> {
  const enc = new TextEncoder();
  const fayl = async (path: string, text: string): Promise<QurilganFayl> => { const bytes = enc.encode(text); return { path, text, sha256: await sha256(bytes), bytes: bytes.length }; };
  const files: QurilganFayl[] = [await fayl('dict.json', JSON.stringify(b.dict))];
  const rowFiles: QurilganFayl[] = [], lookup: Array<QurilganFayl & { from: number; to: number }> = [];
  for (let i = 0; i * PRICE_ROWS_PER_FILE < b.rows.length; i++)
    rowFiles.push(await fayl(`r/${String(i).padStart(4, '0')}.json`, JSON.stringify({ rows: b.rows.slice(i * PRICE_ROWS_PER_FILE, (i + 1) * PRICE_ROWS_PER_FILE) })));
  for (let i = 0; i * PRICE_LOOKUP_ROWS < b.rows.length; i++) {
    const part = b.rows.slice(i * PRICE_LOOKUP_ROWS, (i + 1) * PRICE_LOOKUP_ROWS);
    lookup.push({ ...(await fayl(`i/${String(i).padStart(4, '0')}.json`, JSON.stringify({ rows: part }))), from: part[0][0], to: part[part.length - 1][0] });
  }
  files.push(...rowFiles, ...lookup);
  const meta = (f: QurilganFayl) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes });
  // Revision = content hash of every shard (same editions → same revision; nothing time-dependent).
  const revisionText = PRICE_SHARD_SCHEMA + '\nformat:' + MULTI_BUILD_FORMAT + '\n' + files.map(f => f.path + ':' + f.sha256).join('\n');
  const revision = (await sha256(enc.encode(revisionText))).slice(0, 16);
  const manifest = { schema: PRICE_SHARD_SCHEMA, format: MULTI_BUILD_FORMAT, revision, status: 'REFERENCE', builtAt, policy: 'VAT_FREE_ONLY_MAX_PER_EDITION_NEWEST_EDITION_WINS',
    source: { manba: b.dict.manba, nashrlar: nashrlar.map(n => ({ ...n })) }, counts: { ...b.counts, rows: b.rows.length },
    files: { dict: meta(files[0]), rows: rowFiles.map(meta), lookup: lookup.map(l => ({ ...meta(l), from: l.from, to: l.to })) } };
  return { revision, manifest, files };
}

/** Rebuilds editions from a loaded index (so an admin can add/remove one edition without the original files). */
export function indeksdanNashrlar(dict: PriceDict, rows: PriceRow[]): Nashr[] {
  const manbalar = dict.manbalar ?? [dict.manba];
  const by = new Map<number, Nashr>();
  manbalar.forEach((m, i) => by.set(i, { tur: m.tur as ManbaTuri, nom: m.raqam ?? m.nom, yetkazuvchi: m.yetkazuvchi, yil: m.yil, kvartal: m.kvartal, oy: m.tur === 'birja' && m.sana ? Number(m.sana.slice(5, 7)) : null,
    sana: m.sana, qatorlar: [], hisob: { varaqlar: 0, olinmaganVaraqlar: [], qatorlar: 0, narxsiz: 0, hisoblanganQqs: 0 } }));
  const at = (l: string[], i: number) => (i < 0 ? null : l[i] ?? null);
  for (const r of rows) {
    const n = by.get(r[14] ?? manbalar.length - 1);
    if (!n || r[5] == null) continue;
    n.qatorlar.push({ nom: r[3], birlik: at(dict.birlik, r[4]) ?? '', narx: Number(r[5]), hudud: at(dict.hudud, r[6]), zavod: at(dict.zavod, r[7]),
      guruh: at(dict.guruh, r[13]), sana: at(dict.variant, r[12]), izoh: at(dict.ndsIzoh, r[9]) });
  }
  return [...by.values()];
}
