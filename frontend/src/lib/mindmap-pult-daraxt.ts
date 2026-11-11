/**
 * Mindmap «Boshqaruv pulti» daraxti (sof hisob, React yo‘q).
 *
 * Kompaniya → loyiha → shartnoma → obyekt (→ smeta bo‘limlari: sekin, obyekt ochilganda yuklanadi).
 * Yon bog‘lanishlar (`yonlar`): tomonlar/kontragentlar, subpudratchilar, sklad/texnika/xodim (imzochi), mas‘ullar.
 *
 * Raqamlar BU YERDA hisoblanmaydi: obyekt/loyiha ko‘rsatkichlari `daraxtQur` (lib/mindmap-korinish — xaritaning yagona
 * hisobi) natijasidan olinadi, qoldiq — `lib/hisob-yadro` `qoldiq`. Yangi formula yo‘q; asosiy raqamlar yadrosi
 * (A oqimi) o‘zgarsa, faqat shu fayldagi `pultBelgilari` bitta nuqtada moslanadi.
 *
 * Nomlar KESILMAYDI: to‘liq nom saqlanadi; ayni daraja ichida bir xil nomlar `nomAniq` da identifikator bilan ajratiladi
 * («Yevropa oshxona · №12»), shunda ikki obyekt bir xil ko‘rinmaydi.
 */
import type { MindmapBelgi, MindmapGraf, MindmapSignal, MindmapTugun } from '../api/t2-mindmap';
import { bosHolat, entityId, type HolatSanoq, type XDaraxt, type XHolat, type XTugun } from './mindmap-korinish';
import { qoldiq } from './hisob-yadro/korinish';

export type PultTur = 'kompaniya' | 'loyiha' | 'shartnoma' | 'obyekt' | 'guruh';
export type YonTur = 'tomon' | 'subpudrat' | 'sklad' | 'texnika' | 'xodim' | 'masul';

/** Yon bog‘lanish: kimdir/nimadir shu tugunga bog‘langan. `tugunId` — graf tuguni (bo‘lsa, uzish/ochish mumkin). */
export type PultYon = { tur: YonTur; nom: string; rol: string | null; tugunId: string | null };

export type PultTugun = {
  /** Yo‘l kaliti (yagona; bir obyekt bitta shartnoma ostida bo‘ladi, lekin kalit baribir yo‘lni o‘z ichiga oladi). */
  kalit: string;
  /** Graf tuguni id (`loyiha:3`); guruh/ildiz uchun maxsus. */
  id: string;
  tur: PultTur;
  /** To‘liq real nom. */
  nom: string;
  /** Bir xil qardosh nomlar uchun ajratilgan nom (aks holda `nom`). */
  nomAniq: string;
  bolalar: PultTugun[];
  yonlar: PultYon[];
  /** Obyekt/loyiha ko‘rsatkichlari (`daraxtQur` natijasi); shartnoma/guruh/ildizda — `null`. */
  x: XTugun | null;
  /** Shu tugun ostidagi obyektlar holati (shartnoma/guruh/ildiz uchun jamlanma; obyektda — o‘zi). */
  holatSanoq: HolatSanoq;
  obyektSoni: number;
  /** Obyekt: shartnoma/loyiha id lari (kontekst uchun). */
  loyihaId: number | null;
  shartnomaId: number | null;
};

export const PULT_ILDIZ = 'kompaniya:ildiz';
export const GURUH_LOYIHASIZ = 'guruh:loyihasiz';
export const GURUH_SHARTNOMASIZ = 'guruh:shartnomasiz';

const idRaqam = (id: string): number | null => entityId(id);

function boshTugun(kalit: string, id: string, tur: PultTur, nom: string, x: XTugun | null, loyihaId: number | null, shartnomaId: number | null): PultTugun {
  return { kalit, id, tur, nom, nomAniq: nom, bolalar: [], yonlar: [], x, holatSanoq: bosHolat(), obyektSoni: 0, loyihaId, shartnomaId };
}

/** Takrorlangan nomlarga identifikator qo‘shadi (nom o‘zi KESILMAYDI). Ro‘yxat — bir xil turdagi tugunlar. */
export function nomlarniAjrat(bolalar: PultTugun[]): void {
  const sanoq = new Map<string, number>();
  for (const b of bolalar) {
    const k = b.nom.trim().toLocaleLowerCase('uz-UZ');
    sanoq.set(k, (sanoq.get(k) ?? 0) + 1);
  }
  for (const b of bolalar) {
    const n = idRaqam(b.id);
    b.nomAniq = (sanoq.get(b.nom.trim().toLocaleLowerCase('uz-UZ')) ?? 0) > 1 && n != null ? b.nom + ' · №' + n : b.nom;
  }
}

function jamla(t: PultTugun): void {
  if (t.tur === 'obyekt') {
    t.obyektSoni = 1;
    const h: XHolat = t.x?.holat ?? 'nomalum';
    t.holatSanoq = { ...bosHolat(), [h]: 1 };
    return;
  }
  const s = bosHolat();
  let n = 0;
  for (const b of t.bolalar) {
    jamla(b);
    n += b.obyektSoni;
    for (const k of Object.keys(s) as XHolat[]) s[k] += b.holatSanoq[k];
  }
  t.obyektSoni = n;
  t.holatSanoq = s;
}

/** Tugunning tomonlari: shartnomada — `meta.tomonlar`; loyihada — `qatnashchi` chiziqlari (rol bilan). */
function yonlarniQur(graf: MindmapGraf, byId: Map<string, MindmapTugun>) {
  const tomonlar = new Map<string, PultYon[]>();
  const qosh = (id: string, y: PultYon) => { const a = tomonlar.get(id); if (a) a.push(y); else tomonlar.set(id, [y]); };
  for (const b of graf.bogichlar) {
    const manba = byId.get(b.manba), maqsad = byId.get(b.maqsad);
    if (!manba || !maqsad) continue;
    if (b.tur === 'qatnashchi') {
      const rol = b.rol ?? null;
      qosh(b.maqsad, { tur: rol === 'subpudratchi' ? 'subpudrat' : 'tomon', nom: manba.nom, rol, tugunId: manba.id });
    } else if (b.tur === 'sklad_obyekt') qosh(b.maqsad, { tur: 'sklad', nom: manba.nom, rol: null, tugunId: manba.id });
    else if (b.tur === 'texnika_obyekt') qosh(b.maqsad, { tur: 'texnika', nom: manba.nom, rol: null, tugunId: manba.id });
    else if (b.tur === 'kadr_obyekt') qosh(b.maqsad, { tur: 'xodim', nom: manba.nom, rol: typeof manba.meta?.lavozim === 'string' ? manba.meta.lavozim : null, tugunId: manba.id });
    else if (b.tur === 'masul_obyekt' || b.tur === 'masul_loyiha') qosh(b.maqsad, { tur: 'masul', nom: manba.nom, rol: b.ruxsat ?? null, tugunId: manba.id });
  }
  // Shartnoma tomonlari (meta) — kontragent tugunidan mustaqil (server yuborgan nom/rol).
  for (const tg of graf.tugunlar) {
    if (tg.tur !== 'shartnoma') continue;
    const tm = Array.isArray(tg.meta?.tomonlar) ? (tg.meta!.tomonlar as { rol?: string | null; nom?: string | null; kontragent_id?: number | null }[]) : [];
    for (const t of tm) {
      if (!t?.nom) continue;
      qosh(tg.id, { tur: t.rol === 'subpudratchi' ? 'subpudrat' : 'tomon', nom: t.nom, rol: t.rol ?? null, tugunId: t.kontragent_id ? 'kontragent:' + t.kontragent_id : null });
    }
  }
  return tomonlar;
}

/** Tuzilma munosabatlari (chiziqlardan; eski RPC shaklida chiziq yo‘q bo‘lsa — meta zaxirasi). Kalit/qiymat — graf tugun id. */
const MUNOSABAT_KESH = new WeakMap<MindmapGraf, ReturnType<typeof munosabatHisobla>>();
export function pultMunosabatlari(graf: MindmapGraf) {
  let k = MUNOSABAT_KESH.get(graf);
  if (!k) { k = munosabatHisobla(graf); MUNOSABAT_KESH.set(graf, k); }
  return k;
}

function munosabatHisobla(graf: MindmapGraf) {
  const byId = new Map(graf.tugunlar.map((t) => [t.id, t]));
  const obyektLoyiha = new Map<string, string>();       // obyekt → loyiha
  const shartnomaLoyiha = new Map<string, string>();    // shartnoma → loyiha
  const obyektShartnoma = new Map<string, string>();    // obyekt → shartnoma
  for (const b of graf.bogichlar) {
    if (b.tur === 'obyekt_loyiha') obyektLoyiha.set(b.maqsad, b.manba);
    else if (b.tur === 'shartnoma_loyiha') shartnomaLoyiha.set(b.maqsad, b.manba);
    else if (b.tur === 'shartnoma_obyekt') obyektShartnoma.set(b.maqsad, b.manba);
  }
  for (const t of graf.tugunlar) {
    if (t.tur === 'obyekt' && !obyektLoyiha.has(t.id) && t.meta?.loyiha_id) obyektLoyiha.set(t.id, 'loyiha:' + t.meta.loyiha_id);
    if (t.tur === 'shartnoma') {
      if (!shartnomaLoyiha.has(t.id) && t.meta?.loyiha_id) shartnomaLoyiha.set(t.id, 'loyiha:' + t.meta.loyiha_id);
      for (const o of Array.isArray(t.meta?.obyekt_idlar) ? (t.meta!.obyekt_idlar as unknown[]) : []) {
        const oid = 'obyekt:' + Number(o);
        if (byId.has(oid) && !obyektShartnoma.has(oid)) obyektShartnoma.set(oid, t.id);
      }
    }
  }
  return { obyektLoyiha, shartnomaLoyiha, obyektShartnoma };
}
/**
 * Pult daraxtini quradi. `daraxt` — `daraxtQur(graf)` natijasi (ota komponent uni allaqachon hisoblagan; qayta hisoblanmaydi).
 */
export function pultDaraxtQur(graf: MindmapGraf, daraxt: XDaraxt): PultTugun {
  const byId = new Map(graf.tugunlar.map((t) => [t.id, t]));
  const yonlar = yonlarniQur(graf, byId);
  const kompaniya = graf.tugunlar.find((t) => t.tur === 'kompaniya');
  const ildiz = boshTugun(PULT_ILDIZ, kompaniya?.id ?? PULT_ILDIZ, 'kompaniya', kompaniya?.nom ?? '', null, null, null);

  const { obyektLoyiha, shartnomaLoyiha, obyektShartnoma } = pultMunosabatlari(graf);

  const loyihaTugun = new Map<string, PultTugun>();
  const loyihalar = graf.tugunlar.filter((t) => t.tur === 'loyiha');
  for (const l of loyihalar) {
    const n = boshTugun(l.id, l.id, 'loyiha', l.nom, daraxt.tugunlar.get(l.id) ?? null, idRaqam(l.id), null);
    n.yonlar = yonlar.get(l.id) ?? [];
    loyihaTugun.set(l.id, n);
  }
  const loyihasiz = boshTugun(GURUH_LOYIHASIZ, GURUH_LOYIHASIZ, 'guruh', '', null, null, null);

  const shartnomaTugun = new Map<string, PultTugun>();
  for (const s of graf.tugunlar.filter((t) => t.tur === 'shartnoma')) {
    const lid = shartnomaLoyiha.get(s.id) ?? null;
    const ota = lid ? loyihaTugun.get(lid) ?? loyihasiz : loyihasiz;
    const n = boshTugun(ota.kalit + '/' + s.id, s.id, 'shartnoma', s.nom, null, lid ? idRaqam(lid) : null, idRaqam(s.id));
    n.yonlar = yonlar.get(s.id) ?? [];
    shartnomaTugun.set(s.id, n);
    ota.bolalar.push(n);
  }

  for (const o of graf.tugunlar.filter((t) => t.tur === 'obyekt')) {
    const lid = obyektLoyiha.get(o.id) ?? null;
    const sid = obyektShartnoma.get(o.id) ?? null;
    const shartnoma = sid ? shartnomaTugun.get(sid) ?? null : null;
    const loyiha = lid ? loyihaTugun.get(lid) ?? null : null;
    // Ota: shartnoma → (shartnoma yo‘q) loyiha → (yo‘q) «Loyihasiz».
    const ota = shartnoma ?? loyiha ?? loyihasiz;
    const n = boshTugun(ota.kalit + '/' + o.id, o.id, 'obyekt', o.nom, daraxt.tugunlar.get(o.id) ?? null, lid ? idRaqam(lid) : shartnoma?.loyihaId ?? null, sid ? idRaqam(sid) : null);
    n.yonlar = yonlar.get(o.id) ?? [];
    ota.bolalar.push(n);
  }

  for (const l of loyihaTugun.values()) ildiz.bolalar.push(l);
  if (loyihasiz.bolalar.length) ildiz.bolalar.push(loyihasiz);

  // Tartib: shartnomalar oldin, keyin obyektlar; nom bo‘yicha.
  const tartibla = (t: PultTugun) => {
    const og = (x: PultTugun) => (x.tur === 'shartnoma' ? 0 : x.tur === 'guruh' ? 2 : 1);
    t.bolalar.sort((a, b) => og(a) - og(b) || a.nom.localeCompare(b.nom, 'uz-UZ'));
    t.bolalar.forEach(tartibla);
  };
  tartibla(ildiz);
  // Bir xil nomlar butun daraxt bo‘yicha (har tur ichida) ajratiladi: ikki «Yevropa oshxona…» turli shoxda bo‘lsa ham bir xil ko‘rinmasin.
  const turlar = new Map<PultTur, PultTugun[]>();
  const yig = (t: PultTugun) => { if (t.tur !== 'kompaniya' && t.tur !== 'guruh') { const a = turlar.get(t.tur); if (a) a.push(t); else turlar.set(t.tur, [t]); } t.bolalar.forEach(yig); };
  yig(ildiz);
  turlar.forEach((royxat) => nomlarniAjrat(royxat));
  jamla(ildiz);
  return ildiz;
}

/** Daraxtning ko‘rinadigan qatorlari (yoyilgan tugunlar bo‘yicha), `daraja` bilan. */
export type PultQator = { t: PultTugun; daraja: number };
export function pultQatorlari(ildiz: PultTugun, yoyilgan: ReadonlySet<string>, korinadi?: ReadonlySet<string> | null): PultQator[] {
  const q: PultQator[] = [];
  const yur = (t: PultTugun, d: number) => {
    if (korinadi && !korinadi.has(t.kalit)) return;
    q.push({ t, daraja: d });
    if (yoyilgan.has(t.kalit)) t.bolalar.forEach((b) => yur(b, d + 1));
  };
  yur(ildiz, 0);
  return q;
}

/** Boshlang‘ich yoyish: kompaniya, loyihalar va shartnomalar (obyektlar ko‘rinadi, ularning ichi — bosilganda). */
export function boshlangichYoyilgan(ildiz: PultTugun): Set<string> {
  const s = new Set<string>();
  const yur = (t: PultTugun) => { if (t.tur === 'obyekt') return; s.add(t.kalit); t.bolalar.forEach(yur); };
  yur(ildiz);
  return s;
}

/**
 * Qidiruv + holat filtri: mos tugunlar, ularning ajdodlari va (nom bilan mos kelgan tugunning) avlodlari.
 * `mos(matn, so‘rov)` — chaqiruvchi beradi (lotin/kirill farqsiz: `qidiruvdaBor`). Filtr yo‘q — `null`.
 */
export function pultQidiruvi(ildiz: PultTugun, qidiruv: string, mos: (matn: string, soruv: string) => boolean, holat: XHolat | null): Set<string> | null {
  const q = qidiruv.trim();
  if (!q && !holat) return null;
  const natija = new Set<string>();
  const matn = (t: PultTugun) => t.nom + ' ' + t.yonlar.map((y) => y.nom).join(' ');
  const avlod = (t: PultTugun) => { natija.add(t.kalit); t.bolalar.forEach(avlod); };
  const yur = (t: PultTugun): boolean => {
    let ichkari = false;
    for (const b of t.bolalar) if (yur(b)) ichkari = true;
    const nomMos = !q || mos(matn(t), q);
    const holatMos = !holat || (t.tur === 'obyekt' && t.x?.holat === holat);
    // Obyekt: ikkala shart; boshqa tur: holat filtri bo‘lmasa nom mosligi yetarli (avlodlari ham ko‘rinadi).
    const mosmi = t.tur === 'obyekt' ? nomMos && holatMos : !holat && !!q && nomMos;
    if (mosmi && t.tur !== 'obyekt') avlod(t);
    if (ichkari || mosmi) { natija.add(t.kalit); return true; }
    return false;
  };
  yur(ildiz);
  return natija;
}

/* ───────────── Holat belgilari (obyekt/loyiha qatori) ───────────── */

export type PultBelgi = {
  holat: XHolat;
  faktFoiz: number | null;
  f2Foiz: number | null;
  /** Smeta − F2 (ustamasiz, QQS siz). `null` — smeta noma’lum (0 emas). */
  qoldiq: number | null;
  smeta: number | null;
  signalSoni: number | null;
  kritikSoni: number | null;
  /** Takrorsiz muammolar (bir xil matn bir marta, soni bilan). */
  muammolar: { matn: string; soni: number; ogoh: boolean }[];
};

/** Bir xil matnlarni birlashtiradi: «Smeta qatori … ×3» o‘rniga bitta qator (audit 16: takror signal). */
export function takrorsizMuammolar(belgilar: readonly MindmapBelgi[], signallar: readonly MindmapSignal[]): { matn: string; soni: number; ogoh: boolean }[] {
  const m = new Map<string, { matn: string; soni: number; ogoh: boolean }>();
  const qosh = (matn: string | null | undefined, soni: number, ogoh: boolean) => {
    const toza = (matn ?? '').trim();
    if (!toza) return;
    const k = toza.toLocaleLowerCase('uz-UZ');
    const bor = m.get(k);
    if (bor) { bor.soni += soni; bor.ogoh = bor.ogoh || ogoh; } else m.set(k, { matn: toza, soni, ogoh });
  };
  for (const b of belgilar) qosh(b.matn, Math.max(1, b.soni ?? 1), b.daraja === 'ogoh');
  for (const s of signallar) qosh(s.title, 1, s.severity === 'critical' || s.severity === 'high');
  return [...m.values()].sort((a, b) => Number(b.ogoh) - Number(a.ogoh) || b.soni - a.soni);
}

export function pultBelgilari(x: XTugun | null): PultBelgi | null {
  if (!x) return null;
  return {
    holat: x.holat, faktFoiz: x.faktFoiz, f2Foiz: x.f2Foiz,
    smeta: x.smeta,
    // Qoldiq yagona yadro formulasi bilan (smeta noma’lum — null).
    qoldiq: x.smeta == null ? null : qoldiq(x.smeta, x.f2),
    signalSoni: x.signalSoni, kritikSoni: x.kritikSoni,
    muammolar: takrorsizMuammolar(x.belgilar, x.topSignallar),
  };
}

/* ───────────── Keyingi qadam ───────────── */

export type KeyingiQadam = { kalit: 'smeta' | 'fakt' | 'f2' | 'f3' | 'aosr'; nom: string; yol: string };

/**
 * Obyekt holatiga qarab eng mos keyingi qadam (faqat yo‘naltiradi — hech narsa yozilmaydi, hujjat tasdiqlanmaydi).
 * Ketma-ketlik: smeta → fakt → F2 → Nakopitelniy/F3 → АОСР. Ma’lumot noma’lum bo‘lsa — keyingi bosqichga o‘tilmaydi.
 */
export function keyingiQadam(x: XTugun | null, obyektId: number, nom: (k: KeyingiQadam['kalit']) => string): KeyingiQadam | null {
  if (!x || obyektId <= 0) return null;
  const yol = {
    smeta: '/admin/holat/' + obyektId + '?panel=smeta',
    fakt: '/admin/fakt?obyekt=' + obyektId,
    f2: '/admin/f2-tayyorlash?obyekt=' + obyektId,
    f3: '/admin/nakopitelniy?obyekt=' + obyektId,
    aosr: '/admin/aosr?obyekt=' + obyektId,
  } as const;
  const q = (k: KeyingiQadam['kalit']): KeyingiQadam => ({ kalit: k, nom: nom(k), yol: yol[k] });
  if (x.smeta == null) return q('smeta');
  if (!(x.fakt != null && x.fakt > 0)) return q('fakt');
  if (!(x.f2 != null && x.f2 > 0) || (x.faktFoiz != null && x.f2Foiz != null && x.faktFoiz > x.f2Foiz + 0.05)) return q('f2');
  if (x.f2Tasdiqlangan && (x.f2Foiz ?? 0) > 0) return q('f3');
  return q('aosr');
}
