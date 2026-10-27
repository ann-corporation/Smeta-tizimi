/**
 * «Tizim xaritasi» — SOF hisob (server chaqiruvi yo'q). `t2_tizim_xaritasi_v1` grafidan mavjud mindmap daraxt modeliga
 * (XDaraxt, lib/mindmap-korinish.ts) o'tkazadi — kanvas, joylashuv, klaviatura, fokus va qidiruv AYNAN o'sha kod.
 *   Butun tizim:     tizim (0) → kompaniyalar + platforma tugunlari (1) → modullar (2);
 *   Kompaniya filtri: kompaniya (0) → modullar (1).
 * Holat: server `holat` (ok / diqqat / xato) → xarita palitrasi (yaxshi / etibor / xavf). Server holat bermasa —
 * sonlardan xuddi shu qoida bilan; son ham yo'q bo'lsa — `nomalum` (yolg'on «ok» emas).
 */
import type { TizimGraf, TizimHolat, TizimMeta, TizimModulKod, TizimTugun } from '../api/t2-tizim-xaritasi';
import { t } from '../i18n/til';
import { bosResurs, bosTugun, HOLAT_TARTIB, ogirHolat, type XDaraxt, type XHolat, type XTugun, type XTur } from './mindmap-korinish';

/** Avtomatik yangilash oralig'i va xatodagi eng uzun kutish. */
export const YANGILASH_MS = 30_000;
export const YANGILASH_MAX_MS = 5 * 60_000;

const sonmi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Server holati → xarita palitrasi (ok = yashil, diqqat = sariq, xato = qizil). */
export function holatXaritaga(h: TizimHolat | null): XHolat {
  if (h === 'xato') return 'xavf';
  if (h === 'diqqat') return 'etibor';
  if (h === 'ok') return 'yaxshi';
  return 'nomalum';
}

/**
 * Tugun holati: server `holat` bo'lsa — o'sha. Aks holda sonlardan (serverdagi qoida bilan bir xil):
 *   xato   — 24 soatda xato bor;  diqqat — ochiq kritik signal yoki qotgan navbat;  ok — sonlar bor, muammo yo'q.
 * Hech qanday son kelmagan bo'lsa — `null` (noma'lum).
 */
export function modulHolati(meta: TizimMeta | null | undefined): TizimHolat | null {
  if (!meta) return null;
  if (meta.holat === 'ok' || meta.holat === 'diqqat' || meta.holat === 'xato') return meta.holat;
  const { xato_24s, kritik_signal, navbat_qotgan } = meta;
  if (![xato_24s, kritik_signal, navbat_qotgan].some(sonmi)) return null;
  if ((xato_24s ?? 0) > 0) return 'xato';
  if ((kritik_signal ?? 0) > 0 || (navbat_qotgan ?? 0) > 0) return 'diqqat';
  return 'ok';
}

export const MODUL_TARTIB: TizimModulKod[] = ['smeta', 'fakt', 'f2', 'nakopitelniy', 'sverka', 'ombor', 'agentlar'];

export function modulNomi(m: TizimModulKod | string | null | undefined): string {
  switch (m) {
    case 'smeta': return t('Smeta');
    case 'fakt': return t('Fakt');
    case 'f2': return 'F2';
    case 'nakopitelniy': return t('Nakopitelniy');
    case 'sverka': return t('Sverka');
    case 'ombor': return t('Ombor / sklad');
    case 'agentlar': return t('Agentlar');
    default: return t('Boshqa');
  }
}

/** Modul → tegishli sahifa (joriy kompaniya kontekstida ochiladi). */
export const MODUL_YOLI: Record<TizimModulKod, string> = {
  smeta: '/admin/holat',
  fakt: '/admin/fakt',
  f2: '/admin/f2-reestr',
  nakopitelniy: '/admin/nakopitelniy',
  sverka: '/admin/nakopitelniy',
  ombor: '/admin/logistika',
  agentlar: '/admin/ai-agentlar',
};

/** Nisbiy vaqt («5 daqiqa oldin»), tarjima bilan. `hozir` — test uchun. */
export function oldin(iso: string | null | undefined, hozir = Date.now()): string {
  if (!iso) return '—';
  const v = new Date(iso).getTime();
  if (Number.isNaN(v)) return '—';
  const s = Math.max(0, Math.floor((hozir - v) / 1000));
  if (s < 60) return t('hozirgina');
  if (s < 3600) return t('{n} daqiqa oldin', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} soat oldin', { n: Math.floor(s / 3600) });
  return t('{n} kun oldin', { n: Math.floor(s / 86400) });
}

const PLATFORMA_TUR = new Set(['integratsiya', 'deploy', 'ishlar']);

function tugunYasa(n: TizimTugun, tur: XTur, ota: string | null, daraja: 0 | 1 | 2): XTugun {
  const meta = n.meta ?? {};
  const x = bosTugun(n.id, tur, n.nom, null, ota, daraja);
  x.tizim = { tur: n.tur, meta };
  x.holat = holatXaritaga(modulHolati(meta));
  x.signalSoni = sonmi(meta.ochiq_signal) ? meta.ochiq_signal : null;
  x.kritikSoni = sonmi(meta.kritik_signal) ? meta.kritik_signal : null;
  x.obyektSoni = sonmi(meta.obyekt_soni) ? meta.obyekt_soni : 0;
  return x;
}

/** Tizim grafi → mindmap daraxti. Noma'lum/yetim tugunlar tashlanadi (xato emas). */
export function tizimDaraxtQur(graf: Pick<TizimGraf, 'tugunlar' | 'bogichlar'>): XDaraxt {
  const tugunlar = new Map<string, XTugun>();
  const tizimNode = graf.tugunlar.find((n) => n.tur === 'tizim') ?? null;
  const kompaniyalar = graf.tugunlar.filter((n) => n.tur === 'kompaniya');
  const rootSrc = tizimNode ?? kompaniyalar[0] ?? null;
  const bosh: XDaraxt = { ildiz: 'tizim:0', tugunlar, tartib: [], biriktirilmagan: bosResurs(), maxSmeta: 0, jamoa: null, korinish: null, pulYoq: false, doiraCheklangan: false };
  if (!rootSrc) {
    tugunlar.set('tizim:0', bosTugun('tizim:0', 'tizim', '', null, null, 0));
    bosh.tartib = ['tizim:0'];
    return bosh;
  }
  const ildiz = rootSrc.id;
  const root = tugunYasa(rootSrc, rootSrc.tur === 'tizim' ? 'tizim' : 'kompaniya', null, 0);
  tugunlar.set(ildiz, root);

  // Modul → kompaniya: avval bog'lanish, keyin meta.kompaniya_id.
  const modulOta = new Map<string, string>();
  for (const b of graf.bogichlar) if (b.tur === 'kompaniya_modul') modulOta.set(b.maqsad, b.manba);

  const birinchiDaraja: XTugun[] = [];
  if (tizimNode) {
    for (const k of kompaniyalar) {
      const x = tugunYasa(k, 'kompaniya', ildiz, 1);
      tugunlar.set(k.id, x);
      birinchiDaraja.push(x);
    }
    for (const p of graf.tugunlar.filter((n) => PLATFORMA_TUR.has(n.tur))) {
      const x = tugunYasa(p, 'platforma', ildiz, 1);
      tugunlar.set(p.id, x);
      birinchiDaraja.push(x);
    }
  }
  const modullar = graf.tugunlar.filter((n) => n.tur === 'modul');
  for (const m of modullar) {
    const otaId = modulOta.get(m.id) ?? (sonmi(m.meta?.kompaniya_id) ? 'kompaniya:' + m.meta!.kompaniya_id : null);
    const ota = otaId ? tugunlar.get(otaId) : undefined;
    if (!ota || ota.tur !== 'kompaniya') continue;
    const x = tugunYasa(m, 'modul', ota.id, ota.daraja === 0 ? 1 : 2);
    tugunlar.set(m.id, x);
    ota.bolalar.push(m.id);
    if (ota.daraja === 0) birinchiDaraja.push(x);
  }
  root.bolalar = birinchiDaraja.filter((x) => x.ota === ildiz).map((x) => x.id);

  // Ota holat taqsimoti (bolalar holati) — kartadagi holat chizig'i uchun; server holati bo'lmasa — eng og'iri.
  const jamla = (x: XTugun) => {
    const sanoq = { xavf: 0, etibor: 0, yaxshi: 0, nomalum: 0 };
    for (const id of x.bolalar) sanoq[tugunlar.get(id)!.holat] += 1;
    x.holatSanoq = sanoq;
    if (x.holat === 'nomalum' && HOLAT_TARTIB.some((h) => sanoq[h] > 0)) x.holat = ogirHolat(sanoq);
  };
  for (const id of root.bolalar) { const x = tugunlar.get(id)!; if (x.bolalar.length) jamla(x); }
  jamla(root);

  const tartib = [ildiz, ...root.bolalar, ...root.bolalar.flatMap((id) => tugunlar.get(id)!.bolalar)];
  return { ...bosh, ildiz, tartib };
}

/** Kompaniyalar ko'p bo'lsa boshida yig'iladigan tugunlar (xarita ekranga sig'sin): muammosizlar yig'iladi. */
export function boshlangichYigilgan(d: XDaraxt, chegara = 3): Set<string> {
  const root = d.tugunlar.get(d.ildiz);
  if (!root) return new Set();
  const otalar = root.bolalar.filter((id) => (d.tugunlar.get(id)?.bolalar.length ?? 0) > 0);
  if (otalar.length <= chegara) return new Set();
  return new Set(otalar.filter((id) => d.tugunlar.get(id)!.holat !== 'xavf'));
}
