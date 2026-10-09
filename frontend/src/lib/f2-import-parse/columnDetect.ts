/**
 * Ported from `_f2UstunAniqla` in `Smeta tizimi/30_Panel.js` (line ~3529) —
 * part of T2-GAS-EXIT-001 §4 ("F2 file parsing must exit GAS"). This is the
 * "which column is which" auto-detector for uploaded F2 act files, learned
 * from studying real files in the `Ой/<oy>/*.xlsx` folder (see
 * `_f2lab/README.md`) — three known header layouts, one of them shifted by
 * one column versus the other two. Ported line-by-line; do not "clean up" a
 * branch without checking whether it exists to handle a specific template.
 */
import type { F2ColumnConfig, SheetGrid } from './types';
import { qoshimchaUstunlar, uchlikniMoslashtir } from '../smeta-anatomiya/ustun-dalil';
import { varaqniTahlilQil } from '../smeta-anatomiya/varaq';
import { sarlavhaBlokiniTop } from '../smeta-anatomiya/ustun';
import type { Katak } from '../smeta-anatomiya/turlar';

function up(v: unknown): string {
  return String(v == null ? '' : v).toUpperCase();
}

/**
 * Owner (2026-09-10): «o'zbekistonda 2 ta dastur borda smeta qilib beradigan
 * biri abc4 biri tn qurilish shuning uchun formatlarda farq bo'ladi …
 * ustunlar joylashuvi farq qiladi lekin bizni tizim universal o'qiy olishi
 * kerak bo'ladida».
 *
 * Shuning uchun ustunlar POZITSIYA bo'yicha emas, SARLAVHA SO'ZLARI bo'yicha
 * topiladi. Ro'yxatlar egasining HAQIQIY fayllaridan yig'ilgan:
 *
 *   Karting RES (ABC4):
 *     N п.п. | Шифр номера нормативов… | Наименование работ и затрат |
 *     Единица измерения | Количество | Сметная стоимость → на.ед.изм. | общая
 *   Stella RES:
 *     N п/п | НАИМЕНОВАНИЕ | ЕД. ИЗМ. | КОЛ-ВО | ЦЕНА ЗА ЕД. | СУММА (сум)
 *   F2 akt:
 *     … | НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ | ЕД.ИЗМ | НА ЕДИНИЦУ | ПО ПРОЕКТУ |
 *     на.ед.изм. | общая
 */
/* ⚠️ TARTIB MUHIM. Har bir maydon uchun avval ANIQ ibora qidiriladi, faqat
   u topilmasa UMUMIY so'zga tushiladi. Aks holda «ФОРМА» shablonidagi
   «Объем по смете» (4-ustun) «Объем по проекту» (6-ustun) dan oldin
   ushlanib, tarixiy off-by-one xatosi qaytadi -- shu faylning yuqorisidagi
   ogohlantirish aynan shu haqda. */
const HAJM_SOZ: readonly (readonly string[])[] = [
  ['ПО ПРОЕКТ'],
  ['КОЛ-ВО', 'КОЛ ВО', 'КОЛИЧЕСТВО', 'МИҚДОР', 'МИКДОР', 'ҲАЖМ', 'ХАЖМ'],
  ['ОБЪЕМ'],
];
const NARX_SOZ: readonly (readonly string[])[] = [['НА.ЕД', 'НА ЕД.ИЗМ'], ['ЦЕНА', 'НАРХ']];
const SUMMA_SOZ: readonly (readonly string[])[] = [['ОБЩАЯ'], ['СУММА', 'ЖАМИ']];
/** «N п/п», «№», «N п.п.» — TARTIB RAQAMI ustuni, kod EMAS. */
const TARTIB_KALIT = new Set(['NПП', 'NП', '№', '№ПП', '№П', 'NPP', 'NP']);

function mos(u: string, sozlar: readonly string[]): boolean {
  return sozlar.some((s) => u.indexOf(s) >= 0);
}

/** Sarlavhasi bo'sh yoki «N п/п» bo'lgan ustun kod ustuni bo'la olmaydi. */
function tartibRaqamiMi(v: unknown): boolean {
  const k = up(v).replace(/[^0-9A-ZА-Я№]/g, '');
  return k === '' || TARTIB_KALIT.has(k);
}

/**
 * Scans the first 60 rows for a header row containing "НАИМЕНОВАНИЕ" (name)
 * and a unit-column header ("ЕД.ИЗМ" / "ЕД. ИЗМ" / "ЕДИНИЦА ИЗМЕР" / "БИРЛИК").
 * Once found, looks for the code column ("ОБОСНОВ"/"ШИФР", else name-1), then
 * scans the header row plus the next 2 rows for norma/obyom/narx/sum keywords
 * — this is what makes the "ФОРМА" template (shifted by one column) resolve
 * correctly instead of silently reading the wrong column.
 */
function safeGrid(data: unknown): SheetGrid {
  if (!Array.isArray(data)) return [];
  return data.map((row) => Array.isArray(row) ? row : []);
}

/** Aniqlash natijasi: ustunlar + qanday isbotlangani (operator ko'radi). */
export type F2UstunAniqlash = F2ColumnConfig & {
  hdrRow: number;
  /** 'sarlavha' | 'arifmetika' — hajm/narx/summa qaysi dalil bilan tanlandi. */
  dalil?: { qoida: 'sarlavha' | 'arifmetika'; ishonch: 'yuqori' | 'orta' | 'past'; izoh: string };
  /** PTO qo'shgan, xaritaga kirmagan ustunlar (o'qilmaydi). */
  qoshimcha?: Array<{ ustun: number; sarlavha: string }>;
};

/**
 * SMETA YADROSI kirish nuqtasi (egasi 2026-10-09: "hamma joyda anatomiya chaqirilsin"): ustunlarni avval yagona smeta
 * anatomiyasi aniqlaydi — uni chaqiradigan barcha joy (smeta yuklash, F2 import, preview) bir xil o'qiydi. Eski
 * sarlavha-so'z detektori faqat anatomiya ustun xaritasini umuman bermasa (masalan sarlavhasiz parcha).
 */
export function f2UstunAniqla(data: SheetGrid | null | undefined): F2UstunAniqlash {
  const grid = safeGrid(data);
  try {
    const a = varaqniTahlilQil('', { nom: '', rows: grid as Katak[][] });
    const u = a.ustunlar;
    if (u && u.nom >= 0 && u.birlik >= 0 && (a.rol === 'lrv' || a.rol === 'res')) {
      // Hajm/narx/summa uchligi ma'lumot qatorlarida isbotlanadi (hajm × narx ≈ summa) — dalil operatorga ko'rsatiladi.
      const matnlar = sarlavhaBlokiniTop(grid as Katak[][])?.sarlavhalar ?? [];
      const band = new Set([u.shifr, u.nom, u.birlik, u.tartib, u.hajmBirlikka].filter((i) => i >= 0));
      const m = uchlikniMoslashtir(matnlar, grid.slice(u.malumotBoshi, u.malumotBoshi + 2000), { hajm: u.hajmLoyiha, narx: u.narx, summa: u.summa }, band);
      const uch = m.qoida === 'arifmetika' ? m.uchlik : { hajm: u.hajmLoyiha, narx: u.narx, summa: u.summa };
      // Anatomiya o'zi ustunlarni arifmetika bilan isbotlab tanlagan bo'lsa — o'sha dalil (qayta tekshiruv uni sarlavha deb ko'radi).
      const anatDalil = a.rolDalil.find((d) => d.qoida === 'ustunlar:arifmetika');
      if (anatDalil && m.qoida !== 'arifmetika') { m.qoida = 'arifmetika'; m.ishonch = 'yuqori'; m.izoh = anatDalil.izoh; }
      return {
        kod: u.shifr, nom: u.nom, bir: u.birlik, norma: u.hajmBirlikka, obyom: uch.hajm, narx: uch.narx, sum: uch.summa,
        hdrRow: u.sarlavhaQatori,
        dalil: { qoida: m.qoida, ishonch: m.ishonch, izoh: m.qoida === 'arifmetika' ? m.izoh : `smeta yadrosi (anatomiya, ${a.rol.toUpperCase()}): ${m.izoh}` },
        ...(a.qoshimchaUstunlar?.length ? { qoshimcha: a.qoshimchaUstunlar } : {}),
      };
    }
  } catch { /* yadro o'qiy olmadi — eski detektor */ }
  return eskiF2UstunAniqla(grid);
}

/** Eski (GAS dan ko'chirilgan) sarlavha-so'z detektori — faqat yadro zaxirasi. */
function eskiF2UstunAniqla(grid: SheetGrid): F2UstunAniqlash {
  const d: F2UstunAniqlash = { kod: 1, nom: 2, bir: 3, norma: 4, obyom: 5, narx: 6, sum: 7, hdrRow: -1 };

  for (let r = 0; r < Math.min(60, grid.length); r++) {
    const row = grid[r] || [];
    let iNom = -1;
    let iBir = -1;
    for (let c = 0; c < row.length; c++) {
      const u = up(row[c]);
      if (!u) continue;
      if (iNom < 0 && u.indexOf('НАИМЕНОВАНИЕ') >= 0) iNom = c;
      if (iBir < 0 && (u.indexOf('ЕД.ИЗМ') >= 0 || u.indexOf('ЕД. ИЗМ') >= 0 || u.indexOf('ЕДИНИЦА ИЗМЕР') >= 0 || u.indexOf('БИРЛИК') >= 0)) iBir = c;
    }
    if (iNom < 0 || iBir < 0) continue;
    d.hdrRow = r;
    d.nom = iNom;
    d.bir = iBir;
    d.kod = -1;
    for (let c2 = 0; c2 < row.length; c2++) {
      const u2 = up(row[c2]);
      if (u2 && c2 !== iNom && (u2.indexOf('ОБОСНОВ') >= 0 || u2.indexOf('ШИФР') >= 0)) { d.kod = c2; break; }
    }
    /* Ikkala shablonda ham ШИФР nomdan bitta chapda turadi -- lekin faqat
       o'sha katak HAQIQATAN kod sarlavhasi bo'lsa. Stella RES'ida u yerda
       «N п/п» (tartib raqami) turadi: uni kod deb olish moslashtirishga
       axlat kalit qo'shadi, shuning uchun kod umuman belgilanmaydi. */
    if (d.kod < 0 && iNom >= 1 && !tartibRaqamiMi(row[iNom - 1])) d.kod = iNom - 1;

    /* Sarlavha qatori + keyingi 2 qator (ko'p shablonda sarlavha ikki
       qavatli: «Сметная стоимость» ustida, «на.ед.изм./общая» ostida). */
    const sarlavhalar: Array<{ c: number; u: string }> = [];
    for (let rr = r; rr < Math.min(r + 3, grid.length); rr++) {
      const rw = grid[rr] || [];
      for (let c3 = 0; c3 < rw.length; c3++) {
        const u3 = up(rw[c3]).replace(/\s+/g, ' ');
        if (u3) sarlavhalar.push({ c: c3, u: u3 });
      }
    }
    /** Avval aniq iboralar bo'yicha, keyin umumiylari bo'yicha izlaydi. */
    const topBosqichli = (bosqichlar: readonly (readonly string[])[]): number => {
      for (const sozlar of bosqichlar) {
        for (const h of sarlavhalar) if (mos(h.u, sozlar)) return h.c;
      }
      return -1;
    };

    let no = -1;
    for (const h of sarlavhalar) if (h.u.indexOf('НА ЕДИНИЦУ') >= 0) { no = h.c; break; }
    const ob = topBosqichli(HAJM_SOZ);
    const nx = topBosqichli(NARX_SOZ);
    const sm = topBosqichli(SUMMA_SOZ);
    if (no >= 0) { d.norma = no; d.obyom = ob >= 0 ? ob : no + 1; }
    else if (ob >= 0) { d.obyom = ob; d.norma = Math.max(0, ob - 1); }
    if (nx >= 0) { d.narx = nx; d.sum = sm >= 0 ? sm : nx + 1; }
    else if (sm >= 0) { d.sum = sm; d.narx = Math.max(0, sm - 1); }

    /* Egasi (2026-09-25): PTO F2 hujjatiga ustun qo'shishi yoki nomini
       o'zgartirishi mumkin ("Кол-во по смете", "Выполнено ранее",
       "Примечание", "СТОИМОСТЬ ВСЕГО"…). Sarlavha so'zi faqat nomzod —
       hajm/narx/summa uchligi ma'lumot qatorlarida hajm × narx ≈ summa
       bo'yicha isbotlanadi; isbot boshqa ustunni ko'rsatsa, u olinadi. */
    // Faqat haqiqiy sarlavha qatorlari (raqamlash "1|2|3" va ma'lumot qatorlari emas).
    const sarlavhaQatorlari: number[] = [];
    for (let rr = r; rr < Math.min(r + 3, grid.length); rr++) {
      const rw = grid[rr] || [];
      const sonlar = rw.filter((v) => typeof v === 'number' || /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(String(v ?? ''))).length;
      if (rr > r && sonlar >= 2) break;
      sarlavhaQatorlari.push(rr);
    }
    const kenglik = Math.max(0, ...sarlavhaQatorlari.map((rr) => (grid[rr] || []).length));
    const matnlar = Array.from({ length: kenglik }, (_, c) => sarlavhaQatorlari.map((rr) => up((grid[rr] || [])[c]).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '));
    const tartibUstun = row.findIndex((v) => { const k = up(v).replace(/[^0-9A-ZА-Я№]/g, ''); return k !== '' && TARTIB_KALIT.has(k); });
    const band = new Set([d.kod, d.nom, d.bir, tartibUstun, ...(no >= 0 ? [no] : [])].filter((i) => i >= 0));
    const m = uchlikniMoslashtir(matnlar, grid.slice(r + 1, r + 2001), { hajm: d.obyom, narx: d.narx, summa: d.sum }, band);
    if (m.qoida === 'arifmetika') {
      d.obyom = m.uchlik.hajm; d.narx = m.uchlik.narx; d.sum = m.uchlik.summa;
      if (no < 0) d.norma = Math.max(0, d.obyom - 1);
    }
    d.dalil = { qoida: m.qoida, ishonch: m.ishonch, izoh: m.izoh };
    const qosh = qoshimchaUstunlar(matnlar, new Set([...band, d.norma, d.obyom, d.narx, d.sum]));
    if (qosh.length) d.qoshimcha = qosh;
    break;
  }
  return d;
}
