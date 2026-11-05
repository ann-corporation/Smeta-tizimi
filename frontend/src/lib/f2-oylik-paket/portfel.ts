/**
 * F2 PORTFELI (egasi 2026-11-05: «shartnoma va obyekt darajasida men tayyorlayotgan barcha F2 lar, umumiy jamilar doim ko'rinsin»).
 * Toza funksiyalar: tanlov (shartnoma yoki obyekt, BARCHA oylar), obyekt → oy guruhlash va jamilar. Yangi formula yo'q:
 * akt summasi — `f2AktBaho` (hisob yadrosi), jamlash — `oyJami` (oylik paket bilan bir xil, NULL ≠ 0).
 * Bekor qilingan F2 ko'rinadi, lekin hech bir jamiga kirmaydi. Storno/minus qatorlar ishorasi bilan qo'shiladi.
 */
import { bosqich, type ReestrAkt, type ReestrObyekt, type ReestrShartnoma } from '../f2-reestr/reestr';
import { oyJami, oyKaliti, type AktMoliya, type OyJami, type PaketAkt } from './oylik';
import type { F2Tafsilot } from '../../api/t2-narx';
import type { PereraschetAktQator } from '../f2-pereraschet';
import { bahoMoliya, f2AktBaho, f2AktTayyorla, type F2AktEksportKirish, type F2AktTayyor } from '../f2-akt-eksport';

export type PortfelKesim = { tur: 'shartnoma'; id: number } | { tur: 'obyekt'; id: number };

/** Jami uch bo'lak: tasdiqlangan, qoralamalar (tasdiqlanmagan: jarayonda + rad), hammasi (bekor kirmaydi). */
export type PortfelJami = { tasdiqlangan: OyJami; qoralama: OyJami; hammasi: OyJami; bekorSoni: number };
export type PortfelOy = { oy: string; aktlar: PaketAkt[]; jami: PortfelJami };
export type PortfelObyekt = { obyektId: number; nom: string; oylar: PortfelOy[]; jami: PortfelJami };
export type Portfel = { obyektlar: PortfelObyekt[]; jami: PortfelJami; aktSoni: number };

/** Kesimga tegishli BARCHA F2 lar (barcha oylar, bekor qilinganlar ham — ular jamiga kirmaydi). */
export function portfelAktlari(p: {
  aktlar: readonly ReestrAkt[]; obyektlar: readonly ReestrObyekt[];
  shartnomalar: ReadonlyMap<number, readonly ReestrShartnoma[]>; loyihalar: ReadonlyMap<number, string>;
}, k: PortfelKesim): PaketAkt[] {
  const ob = new Map(p.obyektlar.map((o) => [o.id, o]));
  const out: PaketAkt[] = [];
  for (const a of p.aktlar) {
    if (k.tur === 'obyekt' ? a.obyekt_id !== k.id : !(p.shartnomalar.get(a.obyekt_id) ?? []).some((s) => s.id === k.id)) continue;
    const o = ob.get(a.obyekt_id);
    out.push({ akt: a, obyektNom: o?.nom ?? String(a.obyekt_id), loyiha: o?.loyiha_id != null ? p.loyihalar.get(o.loyiha_id) ?? null : null,
      bosqich: bosqich(a), moliya: null, moliyaXato: false, uchastkalar: null });
  }
  return out.sort((x, y) => x.obyektNom.localeCompare(y.obyektNom, 'ru') || x.akt.obyekt_id - y.akt.obyekt_id
    || (oyKaliti(x.akt.oy) ?? '').localeCompare(oyKaliti(y.akt.oy) ?? '')
    || String(x.akt.raqam ?? '').localeCompare(String(y.akt.raqam ?? ''), 'ru', { numeric: true }) || x.akt.id - y.akt.id);
}

const idlar = (rows: readonly PaketAkt[], f: (r: PaketAkt) => boolean) => new Set(rows.filter(f).map((r) => r.akt.id));

/** Bir guruh jamilari: bekor — faqat sanaladi. */
export function portfelJami(rows: readonly PaketAkt[]): PortfelJami {
  return {
    tasdiqlangan: oyJami(rows, idlar(rows, (r) => r.bosqich === 'tasdiqlangan')),
    qoralama: oyJami(rows, idlar(rows, (r) => r.bosqich === 'jarayonda' || r.bosqich === 'rad')),
    hammasi: oyJami(rows, idlar(rows, (r) => r.bosqich !== 'bekor')),
    bekorSoni: rows.filter((r) => r.bosqich === 'bekor').length,
  };
}

/** Obyekt → oy guruhlari (kirish tartibi `portfelAktlari` dagidek saqlanadi). Oyi noma'lum akt «—» guruhida. */
export function portfelGuruhla(rows: readonly PaketAkt[]): Portfel {
  const ob = new Map<number, { nom: string; oylar: Map<string, PaketAkt[]> }>();
  for (const r of rows) {
    const o = ob.get(r.akt.obyekt_id) ?? { nom: r.obyektNom, oylar: new Map<string, PaketAkt[]>() };
    const oy = oyKaliti(r.akt.oy) ?? '—';
    o.oylar.set(oy, [...(o.oylar.get(oy) ?? []), r]);
    ob.set(r.akt.obyekt_id, o);
  }
  const obyektlar: PortfelObyekt[] = [...ob].map(([obyektId, o]) => {
    const oylar = [...o.oylar].map(([oy, aktlar]) => ({ oy, aktlar, jami: portfelJami(aktlar) }));
    return { obyektId, nom: o.nom, oylar, jami: portfelJami(oylar.flatMap((x) => x.aktlar)) };
  });
  return { obyektlar, jami: portfelJami(rows), aktSoni: rows.length };
}

/** Yuklab olishga kiradigan aktlar: tasdiqlanganlar; `qoralamalar` — tasdiqlanmaganlar ham. Bekor hech qachon kirmaydi. */
export function portfelEksportAktlari(rows: readonly PaketAkt[], qoralamalar: boolean): PaketAkt[] {
  return rows.filter((r) => r.bosqich === 'tasdiqlangan' || (qoralamalar && (r.bosqich === 'jarayonda' || r.bosqich === 'rad')));
}

/** Excel varaq nomi: «Ф-2 №12 2026-03» (31 belgigacha, taqiqlangan belgilarsiz; takror bo'lsa rasmiyKitob raqam qo'shadi). */
export function aktVaraqNomi(r: Pick<PaketAkt, 'akt'>): string {
  const raqam = (r.akt.raqam ?? '').trim();
  const s = `Ф-2${raqam ? ` №${raqam}` : ` id${r.akt.id}`} ${oyKaliti(r.akt.oy) ?? ''}`.replace(/[\\/:*?[\]']/g, '-').replace(/\s+/g, ' ').trim();
  return s.slice(0, 28);
}

/* ───────────── bitta akt: yagona tayyorlash (F2 tarixi bilan bir xil) ───────────── */

/** Obyekt ma'lumoti (`portfelObyektOl` natijasi) — faqat kerakli maydonlar. */
export type PortfelObyektKirish = Pick<F2AktEksportKirish, 'smeta' | 'kontekst' | 'podvallar'> & {
  tafsilot: readonly F2Tafsilot[]; aktQatorlar: ReadonlyMap<number, readonly PereraschetAktQator[]>;
};

export function portfelAktTayyor(m: PortfelObyektKirish, akt: Pick<ReestrAkt, 'id' | 'oy' | 'raqam'>, obyektNom: string, raqamlar: ReadonlyMap<number, string | null>): F2AktTayyor | null {
  return f2AktTayyorla({ smeta: m.smeta, lines: m.tafsilot.filter((l) => l.akt_id === akt.id), aktQatorlar: m.aktQatorlar.get(akt.id) ?? [],
    podvallar: m.podvallar, kontekst: m.kontekst, akt: { id: akt.id, oy: akt.oy, raqam: akt.raqam }, obyektNom, raqamlar });
}

/** Akt summalari (yadro): qator yo'q bo'lsa — faqat hujjat jami (ustamasiz), qolgani noma'lum. */
export function portfelAktMoliya(m: PortfelObyektKirish, akt: Pick<ReestrAkt, 'id' | 'oy' | 'raqam' | 'hujjat_jami'>, obyektNom: string, raqamlar: ReadonlyMap<number, string | null>): AktMoliya {
  const k = portfelAktTayyor(m, akt, obyektNom, raqamlar);
  if (!k) return bahoMoliya({ birliklar: [], qqsBilan: null, qqs: null, ustamali: null, ustamasiz: 0, nomalumBirlik: 0, qatorSoni: 0, narxsizQator: 0 }, akt.hujjat_jami);
  return bahoMoliya(f2AktBaho(k, m.kontekst), akt.hujjat_jami);
}
