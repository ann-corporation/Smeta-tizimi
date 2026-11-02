/**
 * Продажа (1C, F3 sotuv) ↔ F2 MOSLASH — egasi (2026-10-26): tizimdagi F2 jami 1C «Продажа» summasiga mos emas; shu nomuvofiqlikni
 * ko'rish va yopish kerak. Продажа summasi F2 ga teng bo'lishi SHART EMAS (uni F3 yopadi), lekin farq ko'rinib turishi kerak.
 *
 * F2 «birligi» = bitta F2 hujjat:
 *  - rasmiy reestr jami (t2_f2_reestr_jami: QQSsiz / QQS bilan) — ASOSIY manba, chunki t2_akt.hujjat_jami = bog'langan qatorlar
 *    PRYAMYE yig'indisi (hujjat jami emas) va ba'zi F2 tizimda umuman yo'q;
 *  - tizimdagi akt (t2_akt) — qatorlardan ustama: mavjud _t2_f2_ustamali (t2_nakrutka_hisobla_v1 kaskadi) natijasi; YANGI FORMULA YO'Q.
 *    QQS bilan = podval.vsego + katsiz × (podval.nds / podval.itogo4) — katsiz (kategoriyasiz) qatorlar ham QQS ga tortiladi,
 *    stavka kaskadning o'zidan olinadi.
 * Ikkalasi alohida ko'rsatiladi; reestr yo'q bo'lsa — qatorlar summasi «taxminiy» belgisi bilan.
 *
 * Sukut taklifi (operator o'zgartiradi): Продажалар sana tartibida; har biri hali bog'lanmagan va oyi shu Продажа oyigacha bo'lgan
 * F2 larni oladi (ya'ni oldingi Продажадан keyingi va shu Продажагача). Saqlangan bog'lar o'zgarmaydi.
 */
import { obyektKesimi, tiyin, tolovTiyin, type ObyektKesimQator } from '../nakopitelniy-svod';
import type { MoslashF2, MoslashF3, MoslashReestr, MoslashShartnoma, TizimShartnoma } from './turlar';

export type F2Ogoh = 'TIZIMDA_YOQ' | 'REESTR_YOQ' | 'QATORLAR_FARQ' | 'SUMMA_NOMALUM';
export type F2Birlik = {
  kalit: string; aktId: number | null; reestrId: number | null; obyektId: number | null;
  /** YYYY-MM; noma'lum — null (avtomatik taklifga kirmaydi). */
  oy: string | null; raqam: string | null; holat: string | null; izoh: string | null;
  /** Tiyinda. Qatorlar: t2_akt.hujjat_jami (pryamye), ustamali (NDS siz) va QQS bilan — _t2_f2_ustamali dan. */
  qatorPryamye: number | null; qatorUstamali: number | null; qatorQqsBilan: number | null; katsiz: number | null;
  /** Rasmiy reestr (hujjat jami). */
  reestrQqssiz: number | null; reestrQqsBilan: number | null;
  /** Moslash summasi (QQS bilan): reestr bo'lsa reestr, aks holda qatorlardan. */
  asosiy: number | null; asosiyManba: 'reestr' | 'qatorlar' | null;
  /** Saqlangan Продажа (forma3 id); yo'q — null. */
  forma3Id: number | null;
  ogoh: F2Ogoh[];
};

const ixtiyoriyTiyin = (x: number | null | undefined): number | null => (x == null || !Number.isFinite(Number(x)) ? null : tiyin(Number(x)));

/** «06.2026», «01.06.2026 - 30.06.2026», «2026-06» → oxirgi oy (YYYY-MM). */
export function davrOyi(davr: string | null | undefined, oy?: string | null): string | null {
  if (oy) return oy.slice(0, 7);
  const s = String(davr ?? '');
  const iso = [...s.matchAll(/(\d{4})-(\d{2})/g)].pop();
  const toliq = [...s.matchAll(/\d{1,2}\.(\d{1,2})\.(\d{4})/g)].pop();
  if (toliq) return `${toliq[2]}-${toliq[1].padStart(2, '0')}`;
  const qisqa = [...s.matchAll(/\b(\d{1,2})\.(\d{4})\b/g)].pop();
  if (qisqa) return `${qisqa[2]}-${qisqa[1].padStart(2, '0')}`;
  return iso ? `${iso[1]}-${iso[2]}` : null;
}

/** Qatorlardan QQS bilan: podval.vsego + katsiz × (nds / itogo4). Podval yo'q — null. */
export function qatorQqsBilan(u: MoslashF2['ustama']): number | null {
  if (!u?.podval || u.podval.vsego == null) return null;
  const itogo4 = Number(u.podval.itogo4 ?? 0); const nds = Number(u.podval.nds ?? 0); const katsiz = Number(u.katsiz ?? 0);
  // ustamali = itogo4 + katsiz (server); vsego = itogo4 + nds. Katsiz qism ham shu stavkada QQS ga tortiladi.
  return tiyin(Number(u.podval.vsego) + katsiz + (itogo4 > 0 ? katsiz * (nds / itogo4) : 0));
}

/** Shartnoma F2 birliklari: aktlar (reestr jami bilan birlashtirilgan) + akti yo'q reestr qatorlari. */
export function f2Birliklar(m: Pick<MoslashShartnoma, 'f2' | 'f2_reestr' | 'f3'>): F2Birlik[] {
  const reestrAkt = new Map<number, MoslashReestr>();
  for (const r of m.f2_reestr) if (r.akt_id != null) reestrAkt.set(r.akt_id, r);
  const aktSotuv = new Map<number, number>();
  for (const f of m.f3) for (const a of f.akt_ids ?? []) aktSotuv.set(a, f.id);
  const out: F2Birlik[] = [];
  for (const a of m.f2) {
    const r = reestrAkt.get(a.akt_id) ?? null;
    const qp = ixtiyoriyTiyin(a.hujjat_jami);
    const qu = ixtiyoriyTiyin(a.ustama?.ustamali);
    const qq = qatorQqsBilan(a.ustama);
    const rs = ixtiyoriyTiyin(r?.qqssiz); const rq = ixtiyoriyTiyin(r?.qqs_bilan);
    const ogoh: F2Ogoh[] = [];
    if (!r) ogoh.push('REESTR_YOQ');
    if (r && rs != null && qu != null && Math.abs(rs - qu) > Math.max(100, Math.abs(rs) / 100)) ogoh.push('QATORLAR_FARQ');
    const asosiy = rq ?? (rs != null ? null : qq);
    if (asosiy == null) ogoh.push('SUMMA_NOMALUM');
    out.push({
      kalit: `akt:${a.akt_id}`, aktId: a.akt_id, reestrId: r?.id ?? null, obyektId: a.obyekt_id, oy: davrOyi(r?.davr, a.oy),
      raqam: a.raqam ?? r?.raqam ?? null, holat: a.holat, izoh: r?.obyekt_ish ?? null,
      qatorPryamye: qp, qatorUstamali: qu, qatorQqsBilan: qq, katsiz: ixtiyoriyTiyin(a.ustama?.katsiz),
      reestrQqssiz: rs, reestrQqsBilan: rq, asosiy, asosiyManba: rq != null ? 'reestr' : asosiy != null ? 'qatorlar' : null,
      forma3Id: aktSotuv.get(a.akt_id) ?? null, ogoh,
    });
  }
  for (const r of m.f2_reestr) {
    if (r.akt_id != null && m.f2.some((a) => a.akt_id === r.akt_id)) continue;
    const rs = ixtiyoriyTiyin(r.qqssiz); const rq = ixtiyoriyTiyin(r.qqs_bilan);
    out.push({
      kalit: `reestr:${r.id}`, aktId: null, reestrId: r.id, obyektId: null, oy: davrOyi(r.davr, r.oy), raqam: r.raqam, holat: r.holat_matn, izoh: r.obyekt_ish,
      qatorPryamye: null, qatorUstamali: null, qatorQqsBilan: null, katsiz: null, reestrQqssiz: rs, reestrQqsBilan: rq,
      asosiy: rq, asosiyManba: rq != null ? 'reestr' : null, forma3Id: r.forma3_id, ogoh: rq == null ? ['TIZIMDA_YOQ', 'SUMMA_NOMALUM'] : ['TIZIMDA_YOQ'],
    });
  }
  return out.sort((a, b) => (a.oy ?? '9999').localeCompare(b.oy ?? '9999') || (a.raqam ?? '').localeCompare(b.raqam ?? '', 'ru', { numeric: true }));
}

const sotuvTartib = (xs: readonly MoslashF3[]) => xs.slice().sort((a, b) => a.sotuv_sana.localeCompare(b.sotuv_sana) || a.id - b.id);

/** Sukut taklifi: forma3 id → birlik kalitlari. Saqlangan bog'i bor Продажа — saqlangani; boshqalari — oy qoidasi bilan. */
export function f2Taklif(sotuvlar: readonly MoslashF3[], birliklar: readonly F2Birlik[]): Map<number, string[]> {
  const natija = new Map<number, string[]>();
  const band = new Set(birliklar.filter((b) => b.forma3Id != null).map((b) => b.kalit));
  for (const s of sotuvTartib(sotuvlar)) {
    const saqlangan = birliklar.filter((b) => b.forma3Id === s.id).map((b) => b.kalit);
    if (saqlangan.length) { natija.set(s.id, saqlangan); continue; }
    const oy = s.sotuv_sana.slice(0, 7);
    const ol = birliklar.filter((b) => !band.has(b.kalit) && b.oy != null && b.oy <= oy).map((b) => b.kalit);
    ol.forEach((k) => band.add(k));
    natija.set(s.id, ol);
  }
  return natija;
}

export type SotuvMoslash = {
  f3: MoslashF3; birliklar: F2Birlik[];
  /** Bog' bazada saqlanganmi (aks holda — taklif). */
  saqlangan: boolean;
  sotuv: number; f2Pryamye: number; f2Ustamali: number; f2QqsBilan: number; nomalumSoni: number;
  /** Продажа − F2 (QQS bilan). F2 yo'q — null. */
  farq: number | null;
};
export type ShartnomaMoslashNatija = {
  shartnomaId: number; sotuvlar: SotuvMoslash[];
  /** Hech bir Продажага kirmagan F2. */
  sotuvsizF2: F2Birlik[];
  /** F2 si yo'q Продажа. */
  f2sizSotuv: MoslashF3[];
  jami: { sotuv: number; f2QqsBilan: number; f2Boglangan: number; farq: number; tizimdaYoqF2: number; reestrsizF2: number };
};

/** Продажа ↔ F2 jadvali. `tanlov` — operator o'zgartirgan to'plam (forma3 id → kalitlar); berilmasa — sukut taklifi. */
export function shartnomaMoslash(m: MoslashShartnoma, tanlov?: ReadonlyMap<number, readonly string[]>): ShartnomaMoslashNatija {
  const birliklar = f2Birliklar(m);
  const taklif = f2Taklif(m.f3, birliklar);
  const byKalit = new Map(birliklar.map((b) => [b.kalit, b]));
  const ishlatilgan = new Set<string>();
  const sotuvlar: SotuvMoslash[] = sotuvTartib(m.f3).map((f3) => {
    const kalitlar = tanlov?.get(f3.id) ?? taklif.get(f3.id) ?? [];
    const bs = kalitlar.map((k) => byKalit.get(k)).filter((b): b is F2Birlik => !!b);
    bs.forEach((b) => ishlatilgan.add(b.kalit));
    const sotuv = tiyin(f3.sotuv_summa);
    const f2QqsBilan = bs.reduce((a, b) => a + (b.asosiy ?? 0), 0);
    return {
      f3, birliklar: bs, saqlangan: birliklar.some((b) => b.forma3Id === f3.id) && !tanlov?.has(f3.id),
      sotuv, f2Pryamye: bs.reduce((a, b) => a + (b.qatorPryamye ?? 0), 0), f2Ustamali: bs.reduce((a, b) => a + (b.reestrQqssiz ?? b.qatorUstamali ?? 0), 0),
      f2QqsBilan, nomalumSoni: bs.filter((b) => b.asosiy == null).length, farq: bs.length ? sotuv - f2QqsBilan : null,
    };
  });
  const sotuvsizF2 = birliklar.filter((b) => !ishlatilgan.has(b.kalit));
  const sotuvJami = sotuvlar.reduce((a, s) => a + s.sotuv, 0);
  const f2Jami = birliklar.reduce((a, b) => a + (b.asosiy ?? 0), 0);
  return {
    shartnomaId: m.id, sotuvlar, sotuvsizF2, f2sizSotuv: sotuvlar.filter((s) => !s.birliklar.length).map((s) => s.f3),
    jami: {
      sotuv: sotuvJami, f2QqsBilan: f2Jami, f2Boglangan: sotuvlar.reduce((a, s) => a + s.f2QqsBilan, 0), farq: sotuvJami - f2Jami,
      tizimdaYoqF2: birliklar.filter((b) => b.ogoh.includes('TIZIMDA_YOQ')).length, reestrsizF2: birliklar.filter((b) => b.ogoh.includes('REESTR_YOQ')).length,
    },
  };
}

/** Shartnomaning obyekt kesimi: F3 (sotuv) obyektga Продажага bog'langan F2 (QQS bilan) nisbatida, to'lov — taqsimot bo'yicha. */
export function shartnomaObyektKesimi(m: MoslashShartnoma, sh: Pick<TizimShartnoma, 'obyektlar'> | undefined): ObyektKesimQator[] {
  const n = shartnomaMoslash(m);
  return obyektKesimi({
    obyektlar: sh?.obyektlar ?? [],
    sotuvlar: n.sotuvlar.map((s) => {
      const vazn = new Map<number, number>();
      for (const b of s.birliklar) if (b.obyektId != null && b.asosiy != null) vazn.set(b.obyektId, (vazn.get(b.obyektId) ?? 0) + b.asosiy);
      return { summa: s.sotuv, ulush: [...vazn.entries()].map(([obyektId, v]) => ({ obyektId, vazn: v })) };
    }),
    tolovlar: m.tolovlar.map((x) => ({ summa: tolovTiyin(x), obyektId: x.obyekt_id, taqsimot: x.taqsimot.map((q) => ({ obyektId: q.obyekt_id, summa: tiyin(q.summa) })) })),
  });
}

/** Saqlash uchun: kalitlar → akt id va reestr id ro'yxatlari (akti bor birlik akt orqali bog'lanadi). */
export function kalitlardanIdlar(kalitlar: readonly string[]): { aktIds: number[]; reestrIds: number[] } {
  const aktIds: number[] = []; const reestrIds: number[] = [];
  for (const k of kalitlar) {
    const [t, id] = k.split(':');
    if (t === 'akt') aktIds.push(Number(id)); else if (t === 'reestr') reestrIds.push(Number(id));
  }
  return { aktIds, reestrIds };
}
