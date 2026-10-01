import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, sbT2ResursKategoriyaBelgila, yangiOperationId, type T2Obyekt, type T2Qator, type T2ResursKategoriya } from '../../api/supabase';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { f2FaylOqiCore, f2UstunAniqla, type XlsxWorkbook, type F2ColumnConfig, type SheetGrid } from '../../lib/f2-import-parse';
import { smetaDaraxtniYoy, bolaklarga } from '../../lib/smeta-flatten';
import { smetaPaketQatorlariniYoy, smetaPaketRejasiniTekshir, type SmetaPaketManbaReja } from '../../lib/smeta-package-import';
import { lrvVaIchkiResniAjrat } from '../../lib/smeta-lrv-boundary';
import type { SverkaManba } from '../../lib/smeta-anatomiya/sverka';
import { LrvResSverkaPanel } from './LrvResSverkaPanel';
import {
  smetaPaketTasdiqImzosi, smetaPaketTanloviniTekshir, smetaVaraqniTahlilQil,
  smetaPaketResTargetlariniTaklifQil, type SmetaPackageSheetChoice, type SmetaSheetAnalysis,
} from '../../lib/smeta-source-analysis';
import type { AktNode } from '../../lib/f2-match-engine';
import { varaqniTahlilQil } from '../../lib/smeta-anatomiya/varaq';
import { lrvDaraxti, ustunSozlamasi, ustunXaritasigaQayt, varaqRoli } from '../../lib/smeta-anatomiya/yuklash';
import { smetaQaytaImportDiff, type SmetaReimportDiff, type SmetaReimportLine } from '../../lib/smeta-reimport-diff';
import { podvalBlokTuri, resBolimKategoriya, resursMkKabAniqla } from '../../lib/res-kategoriya';
import { bezSkladKategoriyaAniqla } from '../../lib/resurs-kategoriyasi/bez-sklad';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';

/**
 * T2-FINAL-CLEAN-CUTOVER P0.2: native Smeta XLSX -> canonical Supabase, off
 * Google Drive/Sheets/GAS entirely (see `functions/api/smeta-yukla.ts` and
 * `supabase/migrations/20261010120000_t2_smeta_import_bulk_v1.sql`).
 *
 * Deliberately a ONE-SHOT first-import path, not the F2 flow's resumable-job
 * model: the target RPC refuses outright (SMETA_ALREADY_EXISTS) the instant
 * the object has any existing t2_qator row, so there is no "in-progress,
 * partially-written smeta" state to resume — either it's empty and this
 * writes it once, or it already has a smeta and this is refused untouched.
 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Bitta so'rovda yuboriladigan qatorlar soni. 4000 qator ~ 800 KB JSON --
 *  Pages Function uchun ham, Postgres uchun ham arzon (o'lchandi: bitta
 *  bo'lak ~70 ms). Serverdagi qattiq chegara 10 000. */
/* 2000: bitta so‘rov yengil bo‘lsin — 27k qatorli obyektda 4000 lik bo‘lak
   Cloudflare orqali tarmoq uzilishiga uchragan (owner, 2026-09-23). */
const BOLAK_HAJMI = 2000;

type SmetaYuklaJavob = {
  ok: boolean; code?: string; xato?: string; xabar?: string;
  qator_soni?: number; sessiya_id?: number; takror?: boolean;
  bolak?: number; jami?: number; obyekt_id?: number; paket_id?: number;
};

/**
 * XLSX ichidagi har bir varaq mustaqil review qilinadi. `sourceKey` tasodifiy
 * paket-scoped kalit; fayl/papka nomi faqat operatorga ko'rinadigan label.
 */
type PaketVaraq = SmetaPackageSheetChoice & {
  file: File;
  sheetName: string;
  rows: SheetGrid;
  lrvCols: F2ColumnConfig | null;
  resCols: F2ColumnConfig;
  analysis: SmetaSheetAnalysis;
  /** LRV yakunidan keyingi ichki RES ilovasi bo'lsa, operatorga
   * ko'rinadigan Excel satr chegarasi. Bu ilova ish daraxtiga kirmaydi. */
  embeddedResBoundaryRow?: number;
  /** LRV hujjati (yoki eski yagona RES) R2 dagi ID — qayta urinishda qayta yuklanmaydi. */
  documentId?: number;
  /** RES: har nishon LRV uchun alohida hujjat (server slot i manbaga bog'langan). */
  resDocumentIdByTarget?: Record<string, number>;
};

/** XLSX parser boundary: malformed/legacy worksheet data must never reach a
 * renderer or detector as `undefined`. This is deliberately fail-closed: an
 * invalid grid becomes an empty reviewable worksheet, not an auto-import. */
function safeSheetRows(rows: unknown): SheetGrid {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => Array.isArray(row)
    ? Array.from(row, (cell) => cell ?? null)
    : []);
}

export function spreadsheetReadError(fileName: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : '';
  if (/Cannot read properties of undefined \(reading ['"]length['"]\)/i.test(message)) {
    return new Error(`«${fileName}» jadval tuzilmasi o‘qilmadi. Faylni Excelda ochib, yangi .xlsx sifatida saqlang va qayta tanlang.`);
  }
  if (/XLSX_NOT_A_ZIP|End-of-central-directory|not a zip/i.test(message)) {
    return new Error(`«${fileName}» haqiqiy Excel workbook emas yoki hali Excel tomonidan band qilingan. Faylni yopib, asosiy .xlsx/.xlsm faylni tanlang.`);
  }
  return new Error(`«${fileName}» o‘qilmadi. Faylni Excelda ochib, yangi .xlsx sifatida saqlang va qayta tanlang.`);
}

/** Excel ochiq turganda yonida yaratiladigan `~$...xlsx` lock fayli
 * workbook emas: uning ichida ZIP markazi bo‘lmaydi. Paket importiga bunday
 * faylni kiritish `XLSX_NOT_A_ZIP`ni keltirib chiqarardi. Uni biznes fayldek
 * tahlil qilmaymiz; operatorga faqat tanlov yakunida tushunarli ogohlantirish
 * ko‘rsatamiz. */
export function paketImportFayllariniSarala(files: FileList | File[]): { accepted: File[]; ignoredExcelLocks: string[] } {
  const accepted: File[] = [];
  const ignoredExcelLocks: string[] = [];
  for (const file of Array.from(files || [])) {
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) continue;
    if (/^~\$/i.test(file.name)) {
      ignoredExcelLocks.push(file.name);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, ignoredExcelLocks };
}

/** `/api/smeta-yukla` ga bitta so'rov. Tarmoq uzilishi ham `ok:false`
 *  bo'lib qaytadi -- chaqiruvchi hamma joyda bir xil ishlashi uchun. */
async function smetaSorov(yuk: Record<string, unknown>): Promise<SmetaYuklaJavob> {
  try {
    const r = await fetch('/api/smeta-yukla', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    const j = await r.json().catch(() => null) as SmetaYuklaJavob | null;
    if (!j) return { ok: false, code: 'BAD_RESPONSE', xato: 'Server javobi o‘qilmadi.' };
    return j;
  } catch {
    return { ok: false, code: 'NETWORK', xato: 'Tarmoq uzildi. Qayta urinib ko‘ring.' };
  }
}

/** Vaqtinchalik (tarmoq/uzilish) xatolar — qayta urinish xavfsiz, chunki
 *  server bo‘lakni (sessiya, bo‘lak) bo‘yicha upsert qiladi
 *  (t2_smeta_import_bolak_v1): takror yuborish ikkinchi nusxa yaratmaydi. */
const VAQTINCHALIK_KODLAR = new Set(['NETWORK', 'BAD_RESPONSE']);
const QAYTA_KUTISH_MS = [2000, 5000, 10000, 20000];

export async function bolakniQaytaUrinibYubor(
  yuk: Record<string, unknown>,
  onQaytaUrinish?: (urinish: number, jami: number) => void,
  yuborish: (y: Record<string, unknown>) => Promise<SmetaYuklaJavob> = smetaSorov,
  kutish: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SmetaYuklaJavob> {
  let javob = await yuborish(yuk);
  for (let i = 0; i < QAYTA_KUTISH_MS.length && !javob.ok && VAQTINCHALIK_KODLAR.has(String(javob.code)); i++) {
    onQaytaUrinish?.(i + 1, QAYTA_KUTISH_MS.length);
    await kutish(QAYTA_KUTISH_MS[i]);
    javob = await yuborish(yuk);
  }
  return javob;
}

/**
 * T2-PTO-OWNER-CRITICAL-CLOSURE: a real Smeta is normally TWO documents --
 * LRV (lokal resurs vedomosti / lokal smeta: ish/hajm ierarxiyasi, ko'pincha
 * narxsiz) and RES (resursniy vedomost: kod/nom/birlik bo'yicha resurs narx
 * indeksi). Bitta faylda hajm VA narx bo'lmasa, LRV o'zi narxsiz import
 * qilinadi -- bu quyidagi yordamchilar RES faylini o'qib, uning narxlarini
 * nom+birlik bo'yicha LRV daraxtining rs/mat/ob bargiga ulaydi (kod, bo'lsa,
 * FAQAT qo'shimcha aniqlashtirish sifatida). LRV faylida allaqachon narx
 * bo'lgan qatorlar ustidan YOZILMAYDI -- RES faqat YETISHMAGAN narxni
 * to'ldiradi.
 *
 * ⚠️ 2026-09-09 (haqiqiy falokat, egasining "Karting2" obyektida
 * tasdiqlangan): avval bu yerda `kod` BIRINCHI USTUVOR sifatida ishlatilardi
 * (nom+birlik faqat kod topilmasa). Egasining haqiqiy Drive faylida
 * (Karting_LRV_PLUS) `kod` UMUMAN NOYOB EMAS -- masalan `kod='С'` 388 xil,
 * bir-biriga aloqasi yo'q material qatorida (220 xil haqiqiy narx bilan)
 * takrorlanadi; bu T1 dagi odatiy, meros qolgan konventsiya, xato emas.
 * Natijada bitta tasodifiy narx (birinchi indekslangani) o'sha `kod`ga ega
 * BARCHA boshqa materiallarga yopishtirilib chiqdi -- masalan
 * «САМОСВЕРЛЯЮЩИЙ ШУРУП 250 ММ» (haqiqiy narx 450) ga butunlay boshqa
 * resursning («АРМАТУРА... 12 ММ») narxi (8 295 844) yozilib, bitta qator
 * summasi 581+ mlrd, butun obyekt esa ~980 mlrd so'mga shishib ketdi.
 * Endi `nom+birlik` MAJBURIY asosiy kalit (xuddi `res-narxlash.ts`dagi
 * xavfsiz, tasdiqlangan mantiq kabi); `kod` mavjud bo'lsa ham, faqat
 * `nom+birlik` allaqachon topilgan holatni ANIQLASHTIRISH uchun ishlatiladi
 * -- hech qachon yolg'iz/mustaqil qidiruv kaliti sifatida emas.
 */
export type ResNarxYozuv = {
  kod?: string; nom?: string; birlik?: string; narx: number;
  /** RES faylining BO'LIM sarlavhasidan aniqlangan kategoriya (quyiga qarang). */
  kat?: T2ResursKategoriya;
};
/** Birlik guruhi ichidagi bitta RES yozuvi -- token bo'yicha moslash uchun. */
export type ResBirlikYozuv = { nk: string; sozlar: string[]; raqamlar: string; narx: number };

export type ResNarxIndeks = {
  byNomBir: Map<string, number>; byKodNomBir: Map<string, number>;
  katByNomBir: Map<string, T2ResursKategoriya>; katByKodNomBir: Map<string, T2ResursKategoriya>;
  /** Faqat NOM kaliti -- "RES da bor, lekin BIRLIGI boshqa" holatini
   *  "RES da umuman yo'q" dan ajratish uchun (narxsizlik sababi). */
  nomlar: Set<string>;
  /** BIRLIK bo'yicha guruhlangan yozuvlar -- owner: "eng oson yo'li mash Chas
   *  va chel Chas birliklaridan topish ... Bunaqa usul variantlar sonini
   *  kamaytirib ishni tezlatadi". */
  byBirlik: Map<string, ResBirlikYozuv[]>;
};

/** Nega bu qatorga narx qo'yilmadi -- foydalanuvchiga aynan shu ko'rsatiladi. */
export type NarxsizSabab =
  | 'res_yuklanmagan' | 'nomsiz' | 'birlik_mos_emas' | 'res_da_yoq'
  /** Normativ bo'yicha 0 -- xato emas (mashinist mehnati mashina stavkasi ichida). */
  | 'mashinist_normativ'
  /** Birlik guruhida bir nechta nomzod topildi -- taxmin qilinmadi. */
  | 'kop_nomzod';

export type NarxsizQator = {
  uid?: string; kod?: string; nom?: string; bir?: string; hajm?: number;
  sabab: NarxsizSabab;
};

export const NARXSIZ_SABAB_MATN: Record<NarxsizSabab, string> = {
  res_yuklanmagan: 'RES fayli ulanmagan — narx manbai yo‘q',
  nomsiz: 'Qator nomi bo‘sh — nom bo‘yicha moslash imkonsiz',
  birlik_mos_emas: 'RES da shu nom BOR, lekin BIRLIGI boshqa',
  res_da_yoq: 'RES ro‘yxatida bunday nom topilmadi',
  mashinist_normativ: 'Normativ bo‘yicha 0 — mashinist mehnati МАШ-Ч stavkasi ichida (xato emas)',
  kop_nomzod: 'Birlik ichida bir nechta o‘xshash nom — taxmin qilinmadi, qo‘lda tanlang',
};

export type ImportQadam = { kalit: string; nom: string; holat: 'ishlamoqda' | 'tayyor' | 'xato'; tafsilot?: string };

/**
 * Tanlangan varaqning BOSHLANG'ICH qatorlarini ustun raqamlari bilan
 * ko'rsatadi.
 *
 * Owner (2026-09-10): «res yuklangandan keyin list tanlangandan keyin list
 * holati ko'rsatilishi kerak ustunlarni aniqlashtirib olish uchun». Avval
 * ustun raqamlari (kod/nom/bir/narx) faylni KO'RMASDAN kiritilardi --
 * to'g'ri kiritilgan-kiritilmagani faqat import natijasidan bilinardi.
 * Belgilangan ustunlar rangli sarlavha bilan ajratiladi.
 */
function VaraqKorinishi({ rows, cols, qatorSoni = 8 }: {
  rows: SheetGrid | null | undefined;
  cols: { kod: number; nom: number; bir: number; narx: number } | null;
  qatorSoni?: number;
}) {
  const korsatiladi = safeSheetRows(rows).filter(r => r.some(c => String(c ?? '').trim() !== '')).slice(0, qatorSoni);
  if (!korsatiladi.length) return <p className="text-[11px] text-text-mute">Varaq bo‘sh.</p>;
  const ustunSoni = Math.min(korsatiladi.reduce((m, r) => Math.max(m, r.length), 0), 12);
  const belgi = (i: number) => cols?.kod === i ? 'kod' : cols?.nom === i ? 'nom'
    : cols?.bir === i ? 'birlik' : cols?.narx === i ? 'narx' : null;
  return (
    <div className="overflow-auto max-h-56 border border-border/40 rounded" data-testid="varaq-korinishi">
      <table className="w-full text-[11.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {Array.from({ length: ustunSoni }, (_, i) => {
              const b = belgi(i);
              return (
                <th key={i} className={`px-1.5 py-1 text-left font-normal whitespace-nowrap ${b ? 'text-accent' : 'text-text-mute'}`}>
                  {i + 1}{b ? ` · ${b}` : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {korsatiladi.map((r, ri) => (
            <tr key={ri} className="border-t border-border/30">
              {Array.from({ length: ustunSoni }, (_, ci) => (
                <td key={ci} className={`px-1.5 py-0.5 max-w-[220px] truncate ${belgi(ci) ? 'text-text' : 'text-text-dim'}`}
                  title={String(r[ci] ?? '')}>
                  {String(r[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Client-side tolerant numeric parse (comma-decimal, thousands spaces) -- server-side t2_son mirrors this. */
function son(v: unknown): number | undefined {
  if (v == null) return undefined;
  const raw = String(v).replace(/[\s ]/g, '').replace(',', '.');
  if (raw === '') return undefined;
  const m = /[+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(raw);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/* Kategoriya mantiqi lib/res-kategoriya.ts ga ko‘chirildi (Oferta bilan umumiy); eski import yo‘llari buzilmasin. */
export { podvalBlokTuri, resBolimKategoriya, resursMkKabAniqla };

/**
 * RES varag'ini {kod,nom,birlik,narx,kat} tekis ro'yxatiga o'giradi.
 *
 * Ierarxiya yo'q, lekin BO'LIM sarlavhalari bor va ular yagona joy bo'lib,
 * МАТ/ОБ/КАБ/М-К farqi shu yerdan olinadi (resBolimKategoriya ga qarang).
 *
 * ⚠️ Sarlavha faqat NARXSIZ qatorda bo'ladi -- bu shart MAJBURIY. Aks
 * holda «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ» degan RESURS «ЗАТРАТЫ ТРУДА»
 * sarlavhasi deb o'qilib, narxi yo'qolardi (T1 10_Engine.js da aynan shu
 * xato bir marta bo'lgan va o'sha yerda izohlab qo'yilgan).
 */
export function resSatrlariniOl(rows: SheetGrid, cols: F2ColumnConfig): ResNarxYozuv[] {
  const out: ResNarxYozuv[] = [];
  let joriyKat: T2ResursKategoriya | undefined;
  /* Sarlavhasiz blok podvalidan aniqlanganda orqaga qarab belgilash uchun
     shu blok qayerdan boshlanganini eslab turamiz. */
  let blokBoshi = 0;
  for (const row of rows) {
    const kod = cols.kod >= 0 ? String(row[cols.kod] ?? '').trim() : '';
    const nom = cols.nom >= 0 ? String(row[cols.nom] ?? '').trim() : '';
    const bir = cols.bir >= 0 ? String(row[cols.bir] ?? '').trim() : '';
    const narx = cols.narx >= 0 ? son(row[cols.narx]) : undefined;
    if (!nom && !kod) continue;
    if (/^\d+$/.test(nom) && /^\d+$/.test(bir)) continue; // ustun-raqamlash qatori

    /* Podval qatori (nakrutka foizi) -- blok TURINI aytadi. U narxli ham,
       narxsiz ham kelishi mumkin, shuning uchun narx shartidan OLDIN
       tekshiriladi. Faqat sarlavhadan tur aniqlanmagan qatorlarga
       (undefined yoki zaxira МАТ) qo'llanadi -- ЧЕЛ/МАШ/КАБ/М-К nom yoki
       birlik qoidasidan kelgan, ular ustidan yozilmaydi. */
    const blokTuri = podvalBlokTuri(nom);
    if (blokTuri) {
      for (let i = blokBoshi; i < out.length; i++) {
        /* Faqat МАТ/ОБ chalkashligi hal qilinadi. ЧЕЛ/МАШ/КАБ/М-К birlik
           yoki nom qoidasidan kelgan -- ular podvaldan kuchliroq. */
        if (out[i].kat === undefined || out[i].kat === 'МАТ' || out[i].kat === 'ОБ') out[i].kat = blokTuri;
      }
      blokBoshi = out.length;
      joriyKat = undefined;
      continue;
    }

    if (narx == null || narx <= 0) {
      /* Narxsiz matnli qator -- bo'lim sarlavhasi bo'lishi mumkin. Lekin
         HAQIQIY sarlavha faqat sarlavha matnidan iborat: kodi ham,
         birligi ham bo'lmaydi. Kodi/birligi bor qator -- bu narxi
         to'ldirilmagan RESURS (masalan «КОНСТРУКЦИИ СТАЛЬНЫЕ ПО ПРОЕКТУ, Т»),
         uni sarlavha deb o'qish butun keyingi oqim kategoriyasini buzardi. */
      if (kod || bir) continue;
      const b = resBolimKategoriya(nom);
      if (b === 'YAKUN') { joriyKat = undefined; blokBoshi = out.length; }
      else if (b) joriyKat = b;
      continue;
    }
    // Egasi qoidasi (beton/rastvor + м³) faqat material qatoriga — ОБ/М/К/КАБ ga tegmaydi.
    // Yakuniy qaror bazadagi trigger (t2_bez_sklad_qoida); bu yerda oldindan ko'rsatish.
    const asosiy = resursMkKabAniqla(nom, bir, joriyKat);
    const bez = asosiy === 'МАТ' ? bezSkladKategoriyaAniqla(nom, null, bir) : null;
    out.push({
      kod: kod || undefined, nom: nom || undefined, birlik: bir || undefined, narx,
      kat: bez?.kategoriya ?? asosiy,
    });
  }
  return out;
}

/** Server t2_kat_birlik bilan bir xil mantiq (birlik matnida ЧЕЛ/МАШ),
 *  faqat mijoz tomonda ko'rib chiqish uchun taxmin -- yakuniy kategoriya
 *  hamisha serverda (registr + t2_kat_birlik) hisoblanadi. ОБ/КАБ/М/К hech
 *  qachon shu taxmindan chiqmaydi -- T1 GAS ham buni faqat registr orqali
 *  hal qilardi (10_Engine.js), shuning uchun МАТ (standart) qatorlar
 *  ko'rib chiqish uchun ko'rsatiladi. */

export function katTaxmini(nom: string, birlik: string): 'ЧЕЛ' | 'МАШ' | 'МАТ' {
  const b = birlik.toUpperCase();
  if (nom.toUpperCase().includes('ТРУДА МАШИНИСТОВ')) return 'МАШ';
  if (b.includes('ЧЕЛ')) return 'ЧЕЛ';
  if (b.includes('МАШ')) return 'МАШ';
  return 'МАТ';
}

export type VaraqTegi = 'lrv' | 'res' | 'etibor_bermaslik';

/**
 * Owner: "smeta lrv res... nomni farqi yo'q tizim o'zi aniqlashga harakat
 * qilishi kerak hujjatni ko'rib ... bitta hujjat ichida ham lrv ham res
 * sahifalari ham bo'lishi mumkin". Varaq nomiga qaraganda YOMON heuristika
 * -- odamlar varaqni istalgan narsa deb ataydi ("Sheet1", "Лист2" va h.k.).
 * Buning o'rniga MAZMUNGA qaraladi:
 *   RES (tekis narx katalogi): deyarli har bir qatorda narx bor, lekin
 *     hajm deyarli YO'Q (loyihaga bog'liq emas -- umumiy narxnoma).
 *   LRV (ish/hajm ierarxiyasi): hajm ustuni bor va ko'p qatorda
 *     to'ldirilgan (narx bo'lsin-bo'lmasin -- LRV ko'pincha narxsiz keladi).
 * Ikkalasi ham yo'q yoki juda kam ma'lumot -- "nomalum" (foydalanuvchi
 * qo'lda belgilaydi, hech narsa taxmin qilib yozilmaydi).
 */
export function varaqTuriTaxmin(rows: SheetGrid | null | undefined, nom = ''): 'lrv' | 'res' | 'nomalum' {
  const grid = safeSheetRows(rows);
  /* C4: rolni avval yagona anatomiya aytadi (katalog, 1C hisobot, svod —
     LRV deb olinmaydi; LRV_PLUS — RES deb olinmaydi). Aniq xulosa bo'lmasa
     quyidagi eski mazmun evristikasi. */
  let anatLrv = true;
  try {
    const x = varaqRoli(nom, grid);
    if (x.aniq) return x.rol === 'lrv' ? 'lrv' : x.rol === 'res' ? 'res' : 'nomalum';
    // Ish daraxti topilmagan varaq (1C hisobot, katalog, grafik, ostatka) avtomatik LRV bo'lmaydi.
    anatLrv = x.anatomiya.rol === 'lrv' && x.anatomiya.ishlar.length > 0;
  } catch { /* zaxira evristika */ }
  const eski = eskiVaraqTuri(grid);
  return eski === 'lrv' && !anatLrv ? 'nomalum' : eski;
}

function eskiVaraqTuri(grid: SheetGrid): 'lrv' | 'res' | 'nomalum' {
  const cols = f2UstunAniqla(grid);
  if (cols.nom < 0) return 'nomalum';
  let jami = 0, narxli = 0, hajmli = 0;
  const bolimlar = new Set<string>();
  for (const row of grid) {
    const nom = String(row[cols.nom] ?? '').trim();
    if (!nom) continue;
    jami++;
    const narx = cols.narx >= 0 ? son(row[cols.narx]) : undefined;
    const hajm = cols.obyom >= 0 ? son(row[cols.obyom]) : undefined;
    if (narx != null && narx > 0) narxli++;
    if (hajm != null) hajmli++;
    const b = resBolimKategoriya(nom);
    if (b && b !== 'YAKUN') bolimlar.add(b);
  }
  if (jami < 3) return 'nomalum';

  /* Owner (2026-09-10): «manashu list ress listi lekin nima uchun tizim lrv
     deb o'yladi». Sabab: pastdagi «hajm bor -> LRV» qoidasi. Egasining
     haqiqiy RES varag'ida (obyekt 72, 1544 qator) КОЛ-ВО ustuni HAR BIR
     resursda to'ldirilgan -- bu «resurs jamlanmasi» ko'rinishidagi RES,
     sof narxnoma emas. Ya'ni hajmning bor-yo'qligi bu ikkisini ajrata
     olmaydi.

     Ishonchli belgi -- RES BO'LIM SARLAVHALARI (ЗАТРАТЫ ТРУДА /
     СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ / МАТЕРИАЛЬНЫЕ РЕСУРСЫ /
     ОБОРУДОВАНИЕ ...). LRV ish ierarxiyasida bunday bo'limlar bo'lmaydi.
     Kamida IKKI xil bo'lim topilsa -- bu aniq RES. */
  if (bolimlar.size >= 2) return 'res';

  const narxNisbat = narxli / jami;
  const hajmNisbat = hajmli / jami;
  if (hajmNisbat > 0.3) return 'lrv';
  if (narxNisbat > 0.6) return 'res';
  return 'nomalum';
}

/**
 * Moslashtirish kaliti.
 *
 * ⚠️ 2026-09-08: avval bu yerda faqat `.toUpperCase()` bor edi. Ikki
 * MUSTAQIL hujjat (LRV va RES) bir xil resursni bir xil harflar bilan
 * yozishiga tayanish real Excel fayllarida ishlamaydi: qo'shimcha bo'sh
 * joy, nuqta («ЧЕЛ.-Ч» vs «ЧЕЛ-Ч»), tirnoq belgisi, «м³» vs «м3»,
 * «Ё» vs «Е» -- har biri mos kelmaslikka olib keladi.
 *
 * Bazada shu muammo uchun allaqachon `t2_resurs_nom_kalit` /
 * `t2_resurs_birlik_kalit` bor (registr + `Ё→Е` + `³→3` + faqat harf/raqam).
 * Bu -- o'sha g'oyaning klient nusxasi: kalit ikkala tomonda ham bir xil
 * hosil qilinadi, shuning uchun moslashtirish o'z-o'ziga izchil.
 */
export function resKalit(v?: string | null): string {
  return String(v ?? '').toUpperCase()
    .replace(/Ё/g, 'Е').replace(/³/g, '3').replace(/²/g, '2')
    .replace(/[^0-9A-ZА-Я]/g, '');
}

/**
 * Nomni SO'ZLAR va SONLAR ga ajratadi.
 *
 * Owner (2026-09-10): «nomdagi qavs yulduzcha balo battarlardagi farqdan
 * narx topilmay qoladi shuning uchun normalize ishlashi kerak. material
 * nomidagi harf va sonlar ajratib shu orqali tekshirilsa oson bo'ladi».
 *
 * Haqiqiy misol (Stella): RES'da «КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 16 Т»,
 * LRV'da esa «КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ
 * СТРОИТЕЛЬСТВА (КРОМЕ МАГИСТРАЛЬНЫХ ТРУБОПРОВОДОВ) 16 Т» -- bir xil
 * mashina, lekin o'rtasida qo'shimcha matn bor. To'liq nom bo'yicha
 * solishtirish ishlamaydi; so'zlar to'plami + sonlar esa ishlaydi.
 *
 * SONLAR alohida saqlanadi va ular TENG bo'lishi SHART: «16 Т» va «10 Т»
 * kranlari bir-biriga aralashib ketmasligi uchun.
 */
export function narxTokenlar(nom?: string | null): { sozlar: string[]; raqamlar: string } {
  const s = String(nom ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/³/g, '3').replace(/²/g, '2');
  const bolaklar = s.split(/[^0-9A-ZА-Я]+/).filter(Boolean);
  const sozlar: string[] = [];
  const raqamlar: string[] = [];
  for (const b of bolaklar) {
    // «16Т» kabi yopishgan bo'lakni ham son va so'zga ajratamiz
    const sonlar = b.match(/[0-9]+/g);
    const harflar = b.replace(/[0-9]/g, '');
    if (sonlar) raqamlar.push(...sonlar);
    if (harflar) sozlar.push(harflar);
  }
  return { sozlar, raqamlar: raqamlar.join('.') };
}

/** ЧЕЛ-Ч / ЧЕЛ.-Ч / чел-час ... -> 'ЧЕЛЧ'; МАШ-Ч -> 'МАШЧ'. */
function birlikSinfi(birlik?: string | null): string {
  const b = resKalit(birlik);
  if (b.startsWith('ЧЕЛ')) return 'ЧЕЛЧ';
  if (b.startsWith('МАШ')) return 'МАШЧ';
  return b;
}

/** Mashinist mehnati -- normativ bo'yicha narxsiz (МАШ-Ч ichida hisoblangan). */
function mashinistMehnatimi(nom?: string | null): boolean {
  return /МАШИНИСТ/.test(String(nom ?? '').toUpperCase());
}

/**
 * Birlik guruhi ichidan nomga mos yagona yozuvni topadi.
 * Mos deb hisoblanadi: bittasining so'zlari ikkinchisiga TO'LIQ kiradi
 * (qo'shimcha matn kechiriladi) VA sonlari aynan teng.
 * Bir nechta nomzod bo'lsa -- `null` (taxmin qilinmaydi).
 */
export function birlikIchidanTop(
  yozuvlar: ResBirlikYozuv[], nom?: string | null,
): { narx: number } | 'kop_nomzod' | null {
  const { sozlar, raqamlar } = narxTokenlar(nom);
  if (!sozlar.length) return null;
  const qator = new Set(sozlar);
  const nomzod = yozuvlar.filter((y) => {
    if (y.raqamlar !== raqamlar) return false;
    const res = new Set(y.sozlar);
    const resQatorda = y.sozlar.every((w) => qator.has(w));
    const qatorResda = sozlar.every((w) => res.has(w));
    return resQatorda || qatorResda;
  });
  if (!nomzod.length) return null;
  const narxlar = new Set(nomzod.map((n) => n.narx));
  if (narxlar.size > 1) return 'kop_nomzod';
  return { narx: nomzod[0].narx };
}

export function resNarxIndeksiQur(rows: ResNarxYozuv[]): ResNarxIndeks {
  const byNomBir = new Map<string, number>();
  const byKodNomBir = new Map<string, number>();
  const katByNomBir = new Map<string, T2ResursKategoriya>();
  const katByKodNomBir = new Map<string, T2ResursKategoriya>();
  const nomlar = new Set<string>();
  const byBirlik = new Map<string, ResBirlikYozuv[]>();
  for (const r of rows) {
    const nk = resKalit(r.nom);
    if (!nk) continue; // `kod` yolg'iz hech narsani aniqlamaydi -- yuqoridagi izohga q.
    nomlar.add(nk);
    const bs = birlikSinfi(r.birlik);
    const { sozlar, raqamlar } = narxTokenlar(r.nom);
    const guruh = byBirlik.get(bs);
    const yozuv: ResBirlikYozuv = { nk, sozlar, raqamlar, narx: r.narx };
    if (guruh) guruh.push(yozuv); else byBirlik.set(bs, [yozuv]);
    const nb = nk + '|' + resKalit(r.birlik);
    if (!byNomBir.has(nb)) byNomBir.set(nb, r.narx);
    if (r.kat && !katByNomBir.has(nb)) katByNomBir.set(nb, r.kat);
    const kk = resKalit(r.kod);
    if (kk) {
      const kb = kk + '|' + nb;
      if (!byKodNomBir.has(kb)) byKodNomBir.set(kb, r.narx);
      if (r.kat && !katByKodNomBir.has(kb)) katByKodNomBir.set(kb, r.kat);
    }
  }
  return { byNomBir, byKodNomBir, katByNomBir, katByKodNomBir, nomlar, byBirlik };
}

/**
 * LRV daraxtiga RES narxlarini qo'llaydi. Faqat narxi YO'Q rs/mat/ob
 * barglariga tegadi -- LRV o'z haqiqiy narxini yozgan bo'lsa ustidan
 * YOZILMAYDI.
 *
 * ⚠️ 2026-09-08 (haqiqiy nosozlik, bazada tasdiqlangan): shart avval
 * `if (n.narx != null) return n;` edi. Lekin narxsiz LRV faylida narx
 * ustuni bo'sh emas, `0` bo'lib keladi (bo'sh katak 0 ga aylanadi) --
 * ya'ni `0 != null` bo'lgani uchun HAR BIR resurs «allaqachon narxlangan»
 * deb hisoblanib, sanoqqa ham tushmasdan tashlab ketilardi. Natijada
 * ekranda «0 ta mos, 0 ta narxsiz qoldi» chiqardi (ikkala hisoblagich
 * ham nol -- chunki sikl ularga umuman yetib bormasdi), smeta esa
 * butunlay narxsiz (`narx = 0`) import bo'lardi. Obyekt 26 («Fast Food
 * 1etaj») aynan shu holatda: 1262 ta resursning HAMMASIDA narx = 0.
 * Endi 0 ham «narx yo'q» deb hisoblanadi.
 */
export function narxlarniDaraxtgaQoll(
  tree: AktNode[], idx: ResNarxIndeks,
): { tree: AktNode[]; mosSoni: number; mosEmasSoni: number; narxsizlar: NarxsizQator[] } {
  let mosSoni = 0, mosEmasSoni = 0;
  /* Owner (2026-09-10): "yuklanish tugaganidan keyin narxlanmagan rs mat ob
     kabi har bir qatorlarni bildirishi va SABABINI keltirib bera olishi
     kerak". Avval faqat SON chiqardi ("N ta narxsiz qoldi") -- qaysi qator
     va nega ekani noma'lum edi. */
  const narxsizlar: NarxsizQator[] = [];
  const resBosh = idx.nomlar.size === 0;
  const belgila = (n: AktNode, sabab: NarxsizSabab) => {
    mosEmasSoni++;
    narxsizlar.push({ uid: n.uid, kod: n.kod, nom: n.nom, bir: n.bir, hajm: n.hajm, sabab });
  };
  function walk(n: AktNode): AktNode {
    if (n.children && n.children.length) return { ...n, children: n.children.map(walk) };
    if (n.type !== 'rs' && n.type !== 'mat' && n.type !== 'ob') return n;
    if (n.narx != null && n.narx !== 0) return n;
    const nk = resKalit(n.nom);
    if (!nk) { belgila(n, 'nomsiz'); return n; }
    const nb = nk + '|' + resKalit(n.bir);
    let narx: number | undefined;
    const kk = resKalit(n.kod);
    if (kk) narx = idx.byKodNomBir.get(kk + '|' + nb);
    if (narx == null) narx = idx.byNomBir.get(nb);

    /* ══ BIRLIK BO'YICHA ZAXIRA MOSLASH ═══════════════════════════════
       Owner (2026-09-10): «bittada aniq hamma narxlarni olishi shart har
       qanday formatdagi hujjatlarda ... eng oson yo'li mash Chas va chel
       Chas birliklaridan topish».

       Haqiqiy sabab (Stella, Drive'dagi manba fayl bilan tasdiqlangan):
       RES'da nom «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА»,
       LRV'da esa «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ» -- ayni bir narsa
       (hajmi ham bir xil: 43 647.501), lekin nomi boshqacha yozilgan.
       Nom bo'yicha qidirish topa olmagan va 108 qator, ~1.07 mlrd so'm
       narxsiz qolgan.

       ЧЕЛ-Ч: butun RES faylida ATIGI BITTA nom bor (ishchi soati stavkasi)
       -- shuning uchun barcha ЧЕЛ-Ч qatorlariga o'sha stavka qo'yiladi.
       МАШ-Ч: 170 xil mashina, har birida o'z stavkasi -- shuning uchun
       birlik faqat qidiruv doirasini toraytiradi, ichida esa nom
       so'zlari + sonlari bo'yicha moslanadi (narxTokenlar'ga qarang). */
    if (narx == null) {
      const bs = birlikSinfi(n.bir);
      if (bs === 'ЧЕЛЧ' && mashinistMehnatimi(n.nom)) {
        belgila(n, 'mashinist_normativ');
        return n;
      }
      const guruh = idx.byBirlik.get(bs);
      if (guruh?.length) {
        const narxlar = new Set(guruh.map((g) => g.narx));
        if (bs === 'ЧЕЛЧ' && narxlar.size === 1) {
          narx = guruh[0].narx;
        } else {
          const topildi = birlikIchidanTop(guruh, n.nom);
          if (topildi === 'kop_nomzod') { belgila(n, 'kop_nomzod'); return n; }
          if (topildi) narx = topildi.narx;
        }
      }
    }

    if (narx == null) {
      belgila(n, resBosh ? 'res_yuklanmagan' : idx.nomlar.has(nk) ? 'birlik_mos_emas' : 'res_da_yoq');
      return n;
    }
    mosSoni++;
    const summa = n.hajm != null ? Math.round(n.hajm * narx * 100) / 100 : undefined;
    return { ...n, narx, summa };
  }
  return { tree: tree.map(walk), mosSoni, mosEmasSoni, narxsizlar };
}

/**
 * Bir nechta RES varag'i tanlanganda ular bitta narx manbasi sifatida
 * ishlaydi. Bu yordamchi UI tugmasining holatiga bog'liq emas: import aynan
 * foydalanuvchi tanlagan barcha varaqlardan shu zahoti indeks quradi.
 *
 * Muhim qoida: bo'sh yoki tanlanmagan varaq hech qachon indeksga kirmaydi;
 * kod yolg'iz moslash kaliti emas, mavjud `resNarxIndeksiQur` qonuni saqlanadi.
 */
export function tanlanganResManbalariniYig(
  manbalar: ReadonlyArray<{ rows: SheetGrid; cols: F2ColumnConfig }>,
): ResNarxYozuv[] {
  return manbalar.flatMap(({ rows, cols }) => resSatrlariniOl(rows, cols));
}

type ResKategoriyaNomzodi = { nom: string; birlik: string; tanlangan: T2ResursKategoriya };

/** RES bo'limi bergan kategoriya faqat server zaxira qoidasidan farq qilsa
 * registrga nomzod bo'ladi. Shu sabab importning narx bosqichi operatorning
 * oldin alohida "Narxlarni ulash" tugmasini bosishiga qaram bo'lib qolmaydi. */
export function resKategoriyaNomzodlariniOl(satrlar: ResNarxYozuv[]): ResKategoriyaNomzodi[] {
  const korilgan = new Set<string>();
  const out: ResKategoriyaNomzodi[] = [];
  for (const s of satrlar) {
    if (!s.nom || !s.birlik) continue;
    const serverTaxmini = katTaxmini(s.nom, s.birlik);
    const haqiqiy = s.kat ?? serverTaxmini;
    if (haqiqiy === serverTaxmini) continue;
    const key = resKalit(s.nom) + '|' + resKalit(s.birlik);
    if (korilgan.has(key)) continue;
    korilgan.add(key);
    out.push({ nom: s.nom, birlik: s.birlik, tanlangan: haqiqiy });
  }
  return out;
}

/**
 * Bitta obyektning bir manba XLSX faylida bir necha uchastka/LRV varag'i
 * bo'lishi mumkin. Har varaqdagi lokal ID lar (`f2_0`, `f2_1`, ...) qayta
 * boshlanishi sabab ular serverga yuborishdan oldin varaq nomi bilan
 * namespace qilinadi. Bir nechta varaq tanlansa, haqiqiy Excel varaq nomi
 * yuqori RZ bo'lib saqlanadi: uchastkalar aralashmaydi va manba faylida
 * qaysi qism qayerdan kelgani daraxtning o'zida ko'rinadi.
 */
export type AnatomiyaHisobot = {
  manba: string;
  /** true — ichma-ich RZ (anatomiya) daraxti ishlatildi; false — eski tekis daraxt. */
  ierarxiya: boolean;
  rzChuqurlik: number;
  /** Eski usul ish deb qo'shadigan "ВЕДОМОСТЬ РЕСУРСОВ" qatorlari — chiqarildi. */
  vedomostChiqarildi: number;
  sabab: string | null;
};

function rzChuqurligi(tree: readonly AktNode[], d = 0): number {
  return tree.reduce((m, n) => (n.type === 'rz' ? Math.max(m, rzChuqurligi(n.children ?? [], d + 1)) : m), d);
}

/** C4: ustunlarni anatomiya aniqlaydi (sarlavha + ma'lumot arifmetikasi); topilmasa eski detektor. */
export function avtoUstunlar(rows: SheetGrid, nom = ''): F2ColumnConfig {
  try {
    const v = varaqniTahlilQil(nom, { nom, rows });
    if (v.ustunlar && v.ustunlar.nom >= 0) return ustunSozlamasi(v.ustunlar);
  } catch { /* zaxira */ }
  return f2UstunAniqla(rows);
}

const ustunTeng = (a: F2ColumnConfig, b: Partial<F2ColumnConfig> | null): boolean =>
  !!b && a.kod === b.kod && a.nom === b.nom && a.bir === b.bir && a.norma === b.norma && a.obyom === b.obyom && a.narx === b.narx && a.sum === b.sum;

/**
 * SMETA_ANATOMIYA_V1 / C4 — smetani faqat anatomiya tushunadi: LRV daraxti
 * (ichma-ich RZ, mustaqil MAT/OB, vedomost chiqarilgan) `lrvDaraxti` dan.
 * Operator ustunlarni qo'lda o'zgartirsa — (2026-10-01, egasi Q3) anatomiya o'zi shu
 * ustunlar bilan o'qiydi (ierarxiya, vedomost, RZ — bir xil qoidalar). Eski `treeBuild`
 * O'CHIRILMAGAN — faqat anatomiya varaqni LRV deb tanimasa zaxira; sabab hisobotga yoziladi
 * (anatomiyani o'rgatish uchun signal).
 */
function ierarxikDaraxt(name: string, rows: SheetGrid, cols: F2ColumnConfig): { tree: AktNode[]; hisobot: AnatomiyaHisobot } {
  let sabab: string;
  try {
    const v = varaqniTahlilQil(name, { nom: name, rows });
    const avto = v.ustunlar ? ustunSozlamasi(v.ustunlar) : null;
    const operator = !ustunTeng(cols, avto) && !ustunTeng(cols, f2UstunAniqla(rows)) && !ustunTeng(cols, avtoUstunlar(rows, name));
    const va = operator ? varaqniTahlilQil(name, { nom: name, rows }, 1, { ustunlar: ustunXaritasigaQayt(cols) }) : v;
    const d = lrvDaraxti(name, rows, va);
    if (d.anatomiya) {
      return { tree: d.tree, hisobot: { manba: name, ierarxiya: true, rzChuqurlik: rzChuqurligi(d.tree), vedomostChiqarildi: d.vedomost, sabab: operator ? 'operator ustunlari anatomiyaga berildi (ierarxiya saqlandi)' : null } };
    }
    sabab = operator
      ? `operator ustunlari bilan ham ${d.sabab} — eski o‘quvchi ishlatildi`
      : `${d.sabab} — eski o‘quvchi ishlatildi`;
  } catch {
    sabab = 'anatomiya xatosi — eski o‘quvchi ishlatildi';
  }
  const parsed = f2FaylOqiCore(rows, cols);
  const eski = 'tree' in parsed ? parsed.tree : [];
  return { tree: eski, hisobot: { manba: name, ierarxiya: false, rzChuqurlik: rzChuqurligi(eski), vedomostChiqarildi: 0, sabab } };
}

export function tanlanganLrvVaraqlaridanDaraxtQur(
  manbalar: ReadonlyArray<{ name: string; rows: SheetGrid; cols: F2ColumnConfig }>,
  options?: { harManbagaRz?: boolean; hisobot?: (h: AnatomiyaHisobot) => void },
): AktNode[] {
  const koP = options?.harManbagaRz || manbalar.length > 1;
  const namespace = (nodes: AktNode[], prefix: string): AktNode[] => nodes.map((node) => ({
    ...node,
    uid: `${prefix}::${node.uid}`,
    children: node.children ? namespace(node.children, prefix) : node.children,
  }));
  const out: AktNode[] = [];
  for (const [index, manba] of manbalar.entries()) {
    const { lrvRows } = lrvVaIchkiResniAjrat(manba.rows);
    const ier = ierarxikDaraxt(manba.name, lrvRows, manba.cols);
    if (!ier.tree.length) continue;
    options?.hisobot?.(ier.hisobot);
    const tree = namespace(ier.tree, `varaq_${index}`);
    if (koP) {
      out.push({ uid: `varaq_${index}::ildiz`, type: 'rz', nom: manba.name, children: tree });
    } else {
      out.push(...tree);
    }
  }
  return out;
}

/** Import jarayonining haqiqiy vaqtdagi qadam ro'yxati -- foydalanuvchi:
 *  "qanaqadir jarayon bo'layotganini bilib bo'lmaydi ... to'lib boruvchi
 *  ... animatsiya va loglar bilan ko'rsatib tursa". Progress-bar HAQIQIY
 *  tugagan qadamlar ulushi (simulyatsiya emas); har qadam o'z natijasi
 *  (tafsilot) bilan qatorlab ko'rsatiladi. */
export function ImportQadamlarPaneli({ qadamlar }: { qadamlar: ImportQadam[] }) {
  const tayyor = qadamlar.filter(q => q.holat === 'tayyor').length;
  const foiz = qadamlar.length ? Math.round((tayyor / qadamlar.length) * 100) : 0;
  return (
    <div className="karta p-3 space-y-2" role="status" aria-live="polite">
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-300 ease-out" style={{ width: Math.max(foiz, 6) + '%' }} />
      </div>
      <ul className="space-y-1 text-[12.5px]">
        {qadamlar.map(q => (
          <li key={q.kalit} className="flex items-center gap-2">
            {q.holat === 'ishlamoqda' && <Loader2 size={13} className="animate-spin text-accent flex-shrink-0" />}
            {q.holat === 'tayyor' && <CheckCircle2 size={13} className="text-ok flex-shrink-0" />}
            {q.holat === 'xato' && <XCircle size={13} className="text-danger flex-shrink-0" />}
            <span className={q.holat === 'xato' ? 'text-danger' : 'text-text'}>{q.nom}</span>
            {q.tafsilot && <span className="text-text-mute">— {q.tafsilot}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sessiya({ companyId, fixedObjectId, onImportlandi }: { companyId: number; fixedObjectId?: number; onImportlandi?: () => void }) {
  const workspace = usePTOWorkspace();
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState(fixedObjectId ? String(fixedObjectId) : '');
  const [book, setBook] = useState<XlsxWorkbook | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [cols, setCols] = useState<F2ColumnConfig | null>(null);
  const [preview, setPreview] = useState<Array<{ r: number; cells: string[] }>>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ qator_soni: number } | null>(null);
  const [resBook, setResBook] = useState<XlsxWorkbook | null>(null);
  /** Alohida RES faylida ham bir nechta narx varaqlari bo'lishi mumkin. */
  const [resSheetNames, setResSheetNames] = useState<string[]>([]);
  const [resColsBySheet, setResColsBySheet] = useState<Record<string, F2ColumnConfig>>({});
  const [resBusy, setResBusy] = useState(false);
  const [resError, setResError] = useState('');
  const [resIndex, setResIndex] = useState<ResNarxIndeks | null>(null);
  const [resIndexSize, setResIndexSize] = useState(0);
  const [katKorib, setKatKorib] = useState<Array<{ nom: string; birlik: string; tanlangan: T2ResursKategoriya }>>([]);
  const [katSaqlanmoqda, setKatSaqlanmoqda] = useState(false);
  const [narxsizlar, setNarxsizlar] = useState<NarxsizQator[]>([]);

  /** Owner: "qanaqadir jarayon bo'layotganini bilib bo'lmaydi" -- import
   *  bosqichlari haqiqiy vaqtda, har bir qadam nima qilayotgani va
   *  natijasi bilan ko'rsatiladi (simulyatsiya emas -- har bir yozuv
   *  aynan shu qadam tugagach yoziladi). */
  const [importQadamlari, setImportQadamlari] = useState<ImportQadam[]>([]);
  const [reimportDiff, setReimportDiff] = useState<SmetaReimportDiff | null>(null);
  /** Owner: bitta faylda ham LRV, ham RES varaqlari bo'lishi mumkin --
   *  har bir varaq turi mazmuniga qarab avtomatik taxmin qilinadi
   *  (varaqTuriTaxmin), foydalanuvchi shu yerda tasdiqlaydi/tuzatadi. */
  const [varaqTeglari, setVaraqTeglari] = useState<Record<string, VaraqTegi>>({});
  /** Har tanlangan LRV varag'i o'z ustun xaritasini saqlaydi. Bu bir
   * obyekt ichidagi uchastkalar turli Excel shaklida bo'lsa ham ularni
   * bitta import sessiyasida aralashtirmasdan o'qish uchun kerak. */
  const [inFileLrvCols, setInFileLrvCols] = useState<Record<string, F2ColumnConfig>>({});
  /** RES deb belgilangan har bir ICHKI varaq uchun avtomatik aniqlangan
   *  ustunlar -- f2UstunAniqla standart holatda ЕNKБ shakli (ikki qatorli
   *  sarlavha)ni kutadi, oddiy tekis kod/nom/narx jadvalida ustunlar
   *  noto'g'ri chiqishi mumkin, shuning uchun foydalanuvchi shu yerda ham
   *  tuzata oladi (alohida RES fayl bilan bir xil naqsh). */
  const [inFileResCols, setInFileResCols] = useState<Record<string, F2ColumnConfig>>({});
  /** Bir obyektning 4 uchastka + EO kabi ko‘p mustaqil manbasi uchun
   * boshlang‘ich smeta paketi. Bu V1 dagi bitta-fayl holatini buzmaydi. */
  const [paketVaraqlar, setPaketVaraqlar] = useState<PaketVaraq[]>([]);
  /** Faqat aynan hozirgi varaq tahlili va operator tanlovi uchun yaroqli. */
  const [paketTasdiqImzosi, setPaketTasdiqImzosi] = useState<string | null>(null);
  const [paketKalit, setPaketKalit] = useState('');
  const [paketNom, setPaketNom] = useState('');
  const [paketBand, setPaketBand] = useState(false);
  const rawFile = useRef<File | null>(null);
  const sourceDocumentId = useRef<number | undefined>(undefined);
  const sourceOperationId = useRef('');
  const importOperationId = useRef('');
  const paketImportOperationId = useRef('');
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then(r => {
      if (!active) return;
      setObjects(r.ok ? (r.qatorlar || []) as T2Obyekt[] : []);
    });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    if (fixedObjectId) setObjectId(String(fixedObjectId));
  }, [fixedObjectId]);

  useEffect(() => {
    if (fixedObjectId && objects.some((row) => row.id === fixedObjectId) && workspace.scope.objectId !== fixedObjectId) {
      workspace.setObjectId(fixedObjectId);
      return;
    }
    if (workspace.scope.objectId != null && objects.some((row) => row.id === workspace.scope.objectId)) {
      setObjectId(String(workspace.scope.objectId));
    }
  }, [fixedObjectId, objects, workspace, workspace.scope.objectId, workspace.setObjectId]);

  function reset() {
    generation.current++; setError(''); setResult(null); setCols(null); setPreview([]);
    setResBook(null); setResSheetNames([]); setResColsBySheet({}); setResIndex(null); setResIndexSize(0); setResError('');
    setVaraqTeglari({}); setInFileLrvCols({}); setInFileResCols({}); setKatKorib([]); setReimportDiff(null);
    setPaketVaraqlar([]); setPaketTasdiqImzosi(null); setPaketKalit(''); setPaketNom(''); setPaketBand(false); paketImportOperationId.current = '';
  }


  /** Foydalanuvchi bir varaqni qo'lda LRV yoki RES deb belgilaydi (yoki
   *  e'tiborsiz qoldiradi). LRV ham, RES ham checkbox kabi: bitta obyekt
   * bir necha uchastka smetasidan iborat bo'lishi, RES esa bir necha narx
   * bo'limiga ajralishi mumkin. */
  function varaqTegBelgila(workbook: XlsxWorkbook, name: string, teg: VaraqTegi) {
    setVaraqTeglari(prev => ({ ...prev, [name]: teg }));
    setResIndex(null); setResIndexSize(0); setKatKorib([]);
    if (teg === 'lrv') chooseSheet(workbook, name);
    if (teg === 'lrv') {
      setInFileLrvCols(prev => {
        if (prev[name]) return prev;
        const sheet = workbook.sheet(name);
        if (!sheet) return prev;
        return { ...prev, [name]: avtoUstunlar(sheet.rows, name) };
      });
    }
    if (teg === 'res') {
      setInFileResCols(prev => {
        if (prev[name]) return prev; // avval belgilangan tuzatish saqlanadi
        const sheet = workbook.sheet(name);
        return sheet ? { ...prev, [name]: avtoUstunlar(sheet.rows, name) } : prev;
      });
    }
  }

  function chooseSheet(workbook: XlsxWorkbook, name: string) {
    setSheetName(name);
    const sheet = workbook.sheet(name);
    if (!sheet) { setCols(null); setPreview([]); return; }
    const detected = f2FaylOqiCore(sheet.rows);
    // Ustunlar — anatomiyadan (yagona manba); ko'rinish (preview) eski yordamchidan.
    if ('cols' in detected) { setCols(avtoUstunlar(sheet.rows, name)); setPreview(detected.preview); }
    else { setCols(null); setPreview([]); }
  }

  async function reimportPreview(
    manbalar: ReadonlyArray<{ name: string; rows: SheetGrid; cols: F2ColumnConfig }>, token: number,
  ) {
    const daraxt = tanlanganLrvVaraqlaridanDaraxtQur(manbalar);
    if (!daraxt.length) throw new Error('Qayta import daraxti bo‘sh chiqdi.');
    const current = await sbT2DaraxtOl(Number(objectId));
    if (!current.ok) throw new Error('Mavjud smeta qatorlari o‘qilmadi. Diff tuzilmadi.');
    if (generation.current !== token) return;
    const before: SmetaReimportLine[] = ((current.qatorlar || []) as T2Qator[]).map((row) => ({
      canonicalId: row.id, sourceKey: null, kod: row.kod ?? null, nom: row.nom ?? null,
      birlik: row.birlik ?? null, hajm: row.hajm ?? null, norma: row.norma ?? null, narx: row.narx ?? null,
    }));
    const after: SmetaReimportLine[] = smetaDaraxtniYoy(daraxt).map((row) => ({
      canonicalId: null, sourceKey: null, kod: row.kod, nom: row.nom, birlik: row.birlik,
      hajm: row.hajm, norma: row.norma, narx: row.narx,
    }));
    setReimportDiff(smetaQaytaImportDiff(before, after));
    setPhase('Qayta import diff tayyor — yozish bloklangan');
  }

  async function upload(file: File) {
    reset(); setBook(null); setBusy(true); setPhase('Fayl o‘qilmoqda');
    rawFile.current = file; sourceDocumentId.current = undefined;
    sourceOperationId.current = yangiOperationId(); importOperationId.current = yangiOperationId();
    const token = generation.current;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(`Fayl ${MAX_FILE_BYTES / 1024 / 1024} MB dan katta.`);
      const workbook = await readXlsxFonda(await file.arrayBuffer());
      if (generation.current !== token) return;
      setBook(workbook);

      // Har bir varaq mazmuniga qarab LRV/RES/e'tiborsiz deb taxmin
      // qilinadi. Barcha LRV-ga o'xshagan varaqlar tanlanadi: bitta obyekt
      // ko'pincha bir nechta uchastka smetasidan iborat bo'ladi. Ular import
      // sessiyasida alohida manba ildizlari ostida saqlanadi.
      const teglar: Record<string, VaraqTegi> = {};
      const lrvUstunlari: Record<string, F2ColumnConfig> = {};
      const resUstunlari: Record<string, F2ColumnConfig> = {};
      let lrvTanlandi = '';
      for (const s of workbook.sheets) {
        const sheet = workbook.sheet(s.name);
        const taxmin = sheet ? varaqTuriTaxmin(sheet.rows, s.name) : 'nomalum';
        teglar[s.name] = taxmin === 'nomalum' ? 'etibor_bermaslik' : taxmin;
        if (taxmin === 'lrv' && sheet) {
          lrvUstunlari[s.name] = avtoUstunlar(sheet.rows, s.name);
          if (!lrvTanlandi) lrvTanlandi = s.name;
        }
        if (taxmin === 'res' && sheet) resUstunlari[s.name] = avtoUstunlar(sheet.rows, s.name);
      }
      if (!lrvTanlandi) { lrvTanlandi = workbook.sheets[0]?.name || ''; teglar[lrvTanlandi] = 'lrv'; }
      if (lrvTanlandi && !lrvUstunlari[lrvTanlandi]) {
        const sheet = workbook.sheet(lrvTanlandi);
        if (sheet) lrvUstunlari[lrvTanlandi] = avtoUstunlar(sheet.rows, lrvTanlandi);
      }
      setVaraqTeglari(teglar); setInFileLrvCols(lrvUstunlari); setInFileResCols(resUstunlari);

      chooseSheet(workbook, lrvTanlandi); setPhase('Varaq va ustunlarni tekshiring');
      if ((objects.find((row) => row.id === Number(objectId))?.qator_soni ?? 0) > 0) {
        const lrvManbalar = workbook.sheets.flatMap((s) => {
          if (teglar[s.name] !== 'lrv') return [];
          const sheet = workbook.sheet(s.name);
          const lrvCols = lrvUstunlari[s.name];
          return sheet && lrvCols ? [{ name: s.name, rows: sheet.rows, cols: lrvCols }] : [];
        });
        await reimportPreview(lrvManbalar, token);
      }
    } catch { if (generation.current === token) setError('Fayl o‘qilmadi. XLSX faylni tekshiring.'); }
    finally { setBusy(false); }
  }

  async function sourceniR2gaYukla(file: File, objId: number): Promise<number> {
    if (sourceDocumentId.current != null) return sourceDocumentId.current;
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const loyihaId = objects.find(o => o.id === objId)?.loyiha_id ?? null;
      const fd = new FormData();
      fd.append('fayl', file); fd.append('kompaniya_id', String(companyId));
      if (loyihaId != null) fd.append('loyiha_id', String(loyihaId));
      fd.append('obyekt_id', String(objId)); fd.append('turi', 'smeta');
      fd.append('operation_id', sourceOperationId.current || (sourceOperationId.current = yangiOperationId()));
      fd.append('sha256', sha256); fd.append('size', String(file.size));
      const r = await fetch('/api/hujjat-yukla', { method: 'POST', body: fd });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j: any = await r.json().catch(() => null);
      const documentId = j && j.ok ? Number(j.document_id) : NaN;
      if (!r.ok || !Number.isSafeInteger(documentId) || documentId <= 0) {
        throw new Error('Manba fayli kanonik R2 saqlashga qabul qilinmadi.');
      }
      sourceDocumentId.current = documentId;
      return documentId;
    } catch (e) {
      if (e instanceof Error && e.message === 'Manba fayli kanonik R2 saqlashga qabul qilinmadi.') throw e;
      throw new Error('Manba fayli kanonik R2 ga yuklanmadi. Import to‘xtatildi.');
    }
  }

  /** RES (resursniy vedomost) faylini o'qib, kod/nom/birlik/narx ustunlarini
   *  taxminan aniqlaydi -- LRV o'zi uchun ishlatilgan aynan shu detektor
   *  (f2UstunAniqla), lekin RES odatda tekis narx katalogi -- foydalanuvchi
   *  ustunlarni tasdiqlashi/tuzatishi kerak (LRV'dagi bilan bir xil naqsh). */
  async function uploadRes(file: File) {
    setResError(''); setResIndex(null); setResIndexSize(0); setKatKorib([]); setResBusy(true);
    try {
      const workbook = await readXlsxFonda(await file.arrayBuffer());
      setResBook(workbook);
      const detected: Record<string, F2ColumnConfig> = {};
      const tanlangan: string[] = [];
      for (const s of workbook.sheets) {
        if (varaqTuriTaxmin(s.rows, s.name) !== 'res') continue;
        detected[s.name] = avtoUstunlar(s.rows, s.name);
        tanlangan.push(s.name);
      }
      // Bir varaqlik faylni operator alohida RES deb tanlagan bo'lsa,
      // u taxmin turlicha chiqsa ham avvalgi qulay oqim saqlanadi.
      if (!tanlangan.length && workbook.sheets.length === 1) {
        const only = workbook.sheets[0];
        tanlangan.push(only.name);
        detected[only.name] = avtoUstunlar(only.rows, only.name);
      }
      setResSheetNames(tanlangan);
      setResColsBySheet(detected);
    } catch { setResError('RES fayli o‘qilmadi. XLSX faylni tekshiring.'); }
    finally { setResBusy(false); }
  }

  /**
   * Har XLSXning barcha varaqlari ko'rib chiqishga chiqadi. Detektor tavsiya
   * beradi, ammo noaniq varaqni ham, yuqori-confidence varaqni ham operator
   * aniq tasdiqlamaguncha import yo'liga kiritmaymiz.
   */
  async function paketFayllariniTahlilQil(files: FileList | File[]) {
    if (!objectId) { setError('Avval obyektni tanlang.'); return; }
    const fileSelection = paketImportFayllariniSarala(files);
    const incoming = fileSelection.accepted;
    if (!incoming.length) {
      setError(fileSelection.ignoredExcelLocks.length
        ? 'Faqat Excel vaqtinchalik lock fayli (`~$...`) tanlandi. Excel faylini yopib, asosiy .xlsx yoki .xlsm faylni tanlang.'
        : 'XLSX/XLSM/XLS fayl topilmadi.');
      return;
    }
    setError(''); setPaketBand(true); setPhase('Paket varaqlari tahlil qilinmoqda');
    try {
      const fresh: PaketVaraq[] = [];
      for (const file of incoming) {
        if (file.size > MAX_FILE_BYTES) throw new Error(`«${file.name}» ${MAX_FILE_BYTES / 1024 / 1024} MB dan katta.`);
        let workbook: XlsxWorkbook;
        try {
          workbook = await readXlsxFonda(await file.arrayBuffer());
        } catch (e) {
          throw spreadsheetReadError(file.name, e);
        }
        const sheets = Array.isArray(workbook.sheets) ? workbook.sheets : [];
        if (!sheets.length) throw new Error(`«${file.name}» ichida o‘qiladigan varaq topilmadi.`);
        const workbookId = `workbook-${yangiOperationId()}`;
        for (const sheetInfo of sheets) {
          if (!sheetInfo || typeof sheetInfo.name !== 'string' || !sheetInfo.name.trim()) {
            throw new Error(`«${file.name}» ichida nomi aniqlanmagan varaq bor — xavfsizlik uchun paket tahlili to‘xtatildi.`);
          }
          const sheet = workbook.sheet(sheetInfo.name);
          if (!sheet) throw new Error(`«${file.name} / ${sheetInfo.name}» varag‘i o‘qilmadi.`);
          // Bo'sh yoki nostandart satrlar `unknown` review qatori bo'ladi;
          // tashqi XLSX strukturasining `undefined.length` xatosi UIga chiqmaydi.
          const rows = safeSheetRows(sheet.rows);
          const analysis = smetaVaraqniTahlilQil(rows, sheetInfo.name);
          const parsed = f2FaylOqiCore(rows);
          const lrvSplit = analysis.detectedRole === 'lrv' ? lrvVaIchkiResniAjrat(rows) : undefined;
          fresh.push({
            id: `sheet-${yangiOperationId()}`,
            workbookId,
            sourceKey: `source-${yangiOperationId()}`,
            file,
            sheetName: sheetInfo.name,
            rows,
            lrvCols: 'cols' in parsed ? avtoUstunlar(rows, sheetInfo.name) : null,
            resCols: avtoUstunlar(rows, sheetInfo.name),
            analysis,
            embeddedResBoundaryRow: lrvSplit?.boundaryRow,
            analysisKey: analysis.analysisKey,
            selectedRole: analysis.suggestedIgnore ? 'ignore' : analysis.detectedRole === 'unknown' ? undefined : analysis.detectedRole,
          });
        }
      }
      if (!fresh.length) throw new Error('Tanlangan fayllarda o‘qiladigan varaq topilmadi.');
      const freshWithResTargets = smetaPaketResTargetlariniTaklifQil(fresh);
      setPaketVaraqlar((prev) => [...prev, ...freshWithResTargets]);
      setPaketTasdiqImzosi(null); paketImportOperationId.current = '';
      if (!paketKalit) setPaketKalit(yangiOperationId());
      if (!paketNom) setPaketNom((objects.find((x) => x.id === Number(objectId))?.nom || 'Obyekt') + ' — boshlang‘ich smeta paketi');
      const lockNote = fileSelection.ignoredExcelLocks.length
        ? ` ${fileSelection.ignoredExcelLocks.length} ta vaqtinchalik Excel fayli e’tiborsiz qoldirildi.`
        : '';
      setPhase(`${fresh.length} ta varaq tahlil qilindi — rol va RES bog‘lanishini tasdiqlang.${lockNote}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Paket fayllari o‘qilmadi.'); }
    finally { setPaketBand(false); }
  }

  /** Papka ham aynan bitta varaqma-varaq tahlil oqimidan o'tadi. */
  async function paketPapkasiniTahlilQil(files: FileList | File[]) {
    await paketFayllariniTahlilQil(files);
  }

  async function paketHujjatiniR2gaYukla(file: File, objId: number, turi: 'smeta_lrv' | 'smeta_res', sourceSlotKey: string): Promise<number> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const loyihaId = objects.find((o) => o.id === objId)?.loyiha_id ?? null;
    const fd = new FormData();
    fd.append('fayl', file); fd.append('kompaniya_id', String(companyId));
    if (loyihaId != null) fd.append('loyiha_id', String(loyihaId));
    fd.append('obyekt_id', String(objId)); fd.append('turi', turi); fd.append('source_slot_key', sourceSlotKey);
    fd.append('operation_id', yangiOperationId()); fd.append('sha256', sha256); fd.append('size', String(file.size));
    const response = await fetch('/api/hujjat-yukla', { method: 'POST', body: fd });
    const body = await response.json().catch(() => null) as { ok?: boolean; document_id?: number; code?: string } | null;
    const documentId = body?.ok ? Number(body.document_id) : NaN;
    if (!response.ok || !Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new Error('«' + file.name + '» kanonik R2 manba hujjati sifatida qabul qilinmadi (' + (body?.code || 'xato') + ').');
    }
    return documentId;
  }

  function paketVaraqniYangila(id: string, patch: Partial<PaketVaraq>) {
    setPaketVaraqlar((prev) => prev.map((sheet) => sheet.id === id ? { ...sheet, ...patch } : sheet));
    setPaketTasdiqImzosi(null); paketImportOperationId.current = '';
  }

  function paketTahliliniTasdiqla() {
    const signature = smetaPaketTasdiqImzosi(paketVaraqlar);
    const check = smetaPaketTanloviniTekshir(paketVaraqlar, signature);
    if (!check.ok) {
      setError(`Paket tahlili tasdiqlanmadi: ${check.code}${check.sheetId ? ` (${check.sheetId})` : ''}.`);
      return;
    }
    setError(''); setPaketTasdiqImzosi(signature);
    setPhase('Tahlil tasdiqlandi — import shu tarkib bilan bajariladi');
  }

  async function paketImportQil() {
    if (!objectId || !paketVaraqlar.length || paketBand) return;
    if (selectedObject?.qator_soni) { setError('Bu obyektda smeta bor; paket faqat boshlang‘ich import uchun. Qayta revision alohida nazorat oqimi bilan qilinadi.'); return; }
    if (!paketKalit || !paketNom.trim()) { setError('Paket nomi va identifikatori bo‘sh bo‘lmasligi kerak.'); return; }
    const selection = smetaPaketTanloviniTekshir(paketVaraqlar, paketTasdiqImzosi);
    if (!selection.ok) { setError(`Import bloklandi: ${selection.code}. Tahlil/rol/bog‘lanishni qayta tekshirib tasdiqlang.`); return; }
    const lrvs = paketVaraqlar.filter((sheet) => sheet.selectedRole === 'lrv');
    const reses = paketVaraqlar.filter((sheet) => sheet.selectedRole === 'res');
    if (lrvs.some((sheet) => !sheet.lrvCols)) { setError('LRV deb tanlangan varaqdan ish/hajm ustunlari aniqlanmadi. Ustunlarni tuzating yoki rolini o‘zgartiring.'); return; }
    setError(''); setResult(null); setPaketBand(true); setBusy(true); setPhase('Tasdiqlangan smeta paketi tayyorlanmoqda');
    try {
      const objId = Number(objectId);
      const pricedTrees: Array<{ sourceKey: string; tree: AktNode[] }> = [];
      const categoryCandidates: ResKategoriyaNomzodi[] = [];
      for (const lrv of lrvs) {
        const split = lrvVaIchkiResniAjrat(lrv.rows);
        const tree = tanlanganLrvVaraqlaridanDaraxtQur([{
          name: `${lrv.file.name} — ${lrv.sheetName}`,
          rows: split.lrvRows,
          cols: lrv.lrvCols!,
        }], { harManbagaRz: true });
        if (!tree.length) throw new Error(`«${lrv.file.name} / ${lrv.sheetName}» LRV daraxti bo‘sh chiqdi.`);
        const tashqiResRows = tanlanganResManbalariniYig(reses
          .filter((res) => res.targetLrvSourceKeys?.includes(lrv.sourceKey))
          .map((res) => ({ rows: res.rows, cols: res.resCols })));
        /* LRV ostidagi RES ilovasi faqat alohida/aniq ulangan RES yo'q bo'lsa
           narx manbasiga aylanadi. Ikkalasi birga bo'lsa ilova ikkinchi
           marta narx yoki miqdor kiritmaydi. */
        const ichkiResRows = split.embeddedResRows.length
          ? tanlanganResManbalariniYig([{ rows: split.embeddedResRows, cols: lrv.resCols }])
          : [];
        const rows = tashqiResRows.length ? tashqiResRows : ichkiResRows;
        const idx = rows.length ? resNarxIndeksiQur(rows) : null;
        const applied = idx ? narxlarniDaraxtgaQoll(tree, idx).tree : tree;
        pricedTrees.push({ sourceKey: lrv.sourceKey, tree: applied });
        categoryCandidates.push(...resKategoriyaNomzodlariniOl(rows));
      }
      if (categoryCandidates.length) await katNomzodlariniSaqla(categoryCandidates);

      const uploadedDocumentIds = new Map<string, number>();
      for (const lrv of lrvs) {
        const documentId = lrv.documentId ?? await paketHujjatiniR2gaYukla(lrv.file, objId, 'smeta_lrv', `smeta-paket:${paketKalit}:${lrv.sourceKey}:lrv`);
        uploadedDocumentIds.set(lrv.id, documentId);
      }
      /* Bitta RES bir nechta LRV ga belgilangan bo'lsa — har nishon uchun o'z
         hujjati (server slot i `smeta-paket:<paket>:<lrv>:res:<n>` manbaga
         bog'langan; bitta hujjat ikki manbada — PACKAGE_RES_SOURCE_DUPLICATE).
         Shunday har bog'lanish provenance i bazada alohida qayd bo'ladi. */
      const resOrdinalByTarget = new Map<string, number>();
      const resDocByTarget = new Map<string, Record<string, number>>();
      for (const res of reses) {
        const byTarget: Record<string, number> = { ...(res.resDocumentIdByTarget ?? {}) };
        for (const target of res.targetLrvSourceKeys ?? []) {
          const ordinal = (resOrdinalByTarget.get(target) || 0) + 1;
          resOrdinalByTarget.set(target, ordinal);
          byTarget[target] ??= await paketHujjatiniR2gaYukla(res.file, objId, 'smeta_res', `smeta-paket:${paketKalit}:${target}:res:${ordinal}`);
        }
        resDocByTarget.set(res.id, byTarget);
      }
      setPaketVaraqlar((prev) => prev.map((sheet) => uploadedDocumentIds.has(sheet.id)
        ? { ...sheet, documentId: uploadedDocumentIds.get(sheet.id) }
        : resDocByTarget.has(sheet.id) ? { ...sheet, resDocumentIdByTarget: resDocByTarget.get(sheet.id) } : sheet));

      const plan: SmetaPaketManbaReja[] = lrvs.map((lrv) => ({
        key: lrv.sourceKey,
        nom: `${lrv.file.name} / ${lrv.sheetName}`,
        lrvDocumentId: uploadedDocumentIds.get(lrv.id)!,
        resDocumentIds: reses.filter((res) => res.targetLrvSourceKeys?.includes(lrv.sourceKey)).map((res) => resDocByTarget.get(res.id)![lrv.sourceKey]),
      }));
      const check = smetaPaketRejasiniTekshir(paketKalit, paketNom, plan);
      if (!check.ok) throw new Error('Smeta paketi manba kontrakti bajarilmadi: ' + check.code + (check.sourceKey ? ` (${check.sourceKey})` : '') + '.');
      const flatRows = smetaPaketQatorlariniYoy(pricedTrees);
      if (!flatRows.length) throw new Error('Paket qatorlari bo‘sh chiqdi.');

      const operationId = paketImportOperationId.current || (paketImportOperationId.current = yangiOperationId());
      const start = await smetaSorov({ amal: 'paket_import_boshla', kompaniyaId: companyId, obyektId: objId,
        operationId, paketKalit, paketNom, manbalar: plan });
      if (!start.ok || !start.sessiya_id) throw new Error('Paket import sessiyasi ochilmadi (' + (start.code || 'xato') + ').');
      const sessiyaId = Number(start.sessiya_id);
      const chunks = bolaklarga(flatRows, BOLAK_HAJMI);
      for (let i = 0; i < chunks.length; i++) {
        setPhase(`Paket qatorlari yuborilmoqda: ${i + 1}/${chunks.length}`);
        const part = await bolakniQaytaUrinibYubor({ amal: 'paket_import_bolak', kompaniyaId: companyId, sessiyaId, bolak: i, qatorlar: chunks[i] },
          (n, jami) => setPhase(`Paket qatorlari yuborilmoqda: ${i + 1}/${chunks.length} — tarmoq uzildi, qayta urinish ${n}/${jami}`));
        if (!part.ok) throw new Error('Paketning ' + (i + 1) + '-bo‘lagi qabul qilinmadi (' + (part.code || 'xato') + ').');
      }
      setPhase('Paket kanonik bazaga yozilmoqda');
      const done = await smetaSorov({ amal: 'paket_import_yakunla', kompaniyaId: companyId, sessiyaId });
      if (!done.ok) throw new Error('Smeta paketi yozilmadi (' + (done.code || 'xato') + ').');
      setResult({ qator_soni: done.qator_soni || 0 });
      setObjects((prev) => prev.map((o) => o.id === objId ? { ...o, qator_soni: done.qator_soni ?? o.qator_soni } : o));
      setPhase('Smeta paketi tayyor'); onImportlandi?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'Smeta paketi import qilinmadi.'); }
    finally { setBusy(false); setPaketBand(false); }
  }
  function resVaraqBelgila(workbook: XlsxWorkbook, name: string, tanlandi: boolean) {
    setResIndex(null); setResIndexSize(0); setKatKorib([]);
    setResSheetNames(prev => tanlandi ? [...new Set([...prev, name])] : prev.filter(x => x !== name));
    if (!tanlandi) return;
    const sheet = workbook.sheet(name);
    if (!sheet) return;
    setResColsBySheet(prev => prev[name] ? prev : { ...prev, [name]: avtoUstunlar(sheet.rows, name) });
  }
  /** Narx satrlarini BARCHA manbalardan yig'adi: (1) asosiy faylda RES deb
   *  belgilangan varaq(lar) -- ustunlar avtomatik aniqlanadi, (2) alohida
   *  yuklangan RES fayli (bor bo'lsa, ustunlari foydalanuvchi tuzatgan
   *  holda). Ikkalasi ham bo'lishi, faqat bittasi bo'lishi yoki hech biri
   *  bo'lmasligi mumkin -- owner: "bitta hujjat ichida ham lrv ham res
   *  sahifalari ham bo'lishi mumkin". */
  function resSatrlariBarchaManbadan(): ResNarxYozuv[] {
    const manbalar: Array<{ rows: SheetGrid; cols: F2ColumnConfig }> = [];
    if (book) {
      for (const s of book.sheets) {
        if (varaqTeglari[s.name] !== 'res') continue;
        const sheet = book.sheet(s.name);
        if (!sheet) continue;
        manbalar.push({ rows: sheet.rows, cols: inFileResCols[s.name] || avtoUstunlar(sheet.rows, s.name) });
      }
    }
    if (resBook) {
      for (const name of resSheetNames) {
        const sheet = resBook.sheet(name);
        const cols = resColsBySheet[name];
        if (sheet && cols) manbalar.push({ rows: sheet.rows, cols });
      }
    }
    return tanlanganResManbalariniYig(manbalar);
  }

  /**
   * RES narxlarini indekslaydi VA kategoriya registriga yoziladigan
   * nomzodlarni tayyorlaydi.
   *
   * Kategoriya endi RES faylining BO'LIM sarlavhasidan aniqlanadi
   * (resBolimKategoriya) -- ya'ni ОБ/КАБ/М-К endi «taxmin qilib
   * bo'lmaydigan» narsa emas. Registrga faqat serverning o'z zaxira
   * mantiqidan (t2_kat_birlik ~ katTaxmini) FARQ QILADIGAN qatorlar
   * yoziladi: server МАТ deb hisoblaydigan, aslida esa ОБ/КАБ/М-К
   * bo'lganlari. Boshqalarini yozish ortiqcha -- server o'zi to'g'ri
   * topadi.
   */
  function resNarxlarniUlash() {
    const satrlar = resSatrlariBarchaManbadan();
    if (!satrlar.length) return;
    setResIndex(resNarxIndeksiQur(satrlar));
    setResIndexSize(satrlar.length);
    setKatKorib(resKategoriyaNomzodlariniOl(satrlar));
  }

  /** Ro'yxatdagi kategoriyalarni registrga yozadi -- best-effort,
   *  muvaffaqiyatsizlik importni to'xtatmaydi.
   *
   *  ⚠️ Avval bu yerda `!== 'МАТ'` filtri bor edi. Endi ro'yxatning O'ZI
   *  faqat serverning zaxira mantiqidan farq qiladigan qatorlardan iborat
   *  (resNarxlarniUlash ga qarang), va ular orasida МАТ ham bo'lishi
   *  mumkin: masalan birligi «МАШ.-Ч» bo'lgani uchun server МАШ deydi,
   *  RES bo'limi esa МАТЕРИАЛЬНЫЕ РЕСУРСЫ. Shuning uchun filtr olib
   *  tashlandi -- aks holda aynan shunday tuzatishlar yo'qolardi. */
  async function katNomzodlariniSaqla(nomzodlar: ResKategoriyaNomzodi[]) {
    if (!nomzodlar.length) return;
    setKatSaqlanmoqda(true);
    try {
      await Promise.all(nomzodlar.map(k =>
        sbT2ResursKategoriyaBelgila({ kompaniyaId: companyId, nom: k.nom, birlik: k.birlik, kategoriya: k.tanlangan }).catch(() => null)));
    } finally { setKatSaqlanmoqda(false); }
  }

  async function importQil() {
    if (!book || !cols || !objectId) return;
    setError(''); setResult(null); const token = generation.current; setBusy(true); setPhase('Import qilinmoqda');
    setImportQadamlari([]);
    const jonli = () => generation.current === token;
    /** Yangi qadam boshlanganini ko'rsatadi -- ro'yxatga qo'shiladi, holati "ishlamoqda". */
    const qadam = (nom: string) => { if (jonli()) setImportQadamlari(prev => [...prev, { kalit: String(prev.length), nom, holat: 'ishlamoqda' }]); };
    /** Hozir ishlayotgan qadamning tafsilotini yangilaydi (uni yakunlamasdan)
     *  -- bo'laklar yuborilayotganda «7/13 bo'lak» kabi jonli hisob uchun. */
    const tafsilotYangila = (tafsilot: string) => {
      if (!jonli()) return;
      setImportQadamlari(prev => {
        if (!prev.length) return prev;
        const c = prev.slice();
        c[c.length - 1] = { ...c[c.length - 1], tafsilot };
        return c;
      });
    };
    /** Oxirgi (hozir ishlayotgan) qadamni yakunlaydi -- muvaffaqiyat yoki xato, tafsilot bilan. */
    const yakunla = (holat: 'tayyor' | 'xato', tafsilot?: string) => {
      if (!jonli()) return;
      setImportQadamlari(prev => {
        if (!prev.length) return prev;
        const c = prev.slice();
        c[c.length - 1] = { ...c[c.length - 1], holat, tafsilot };
        return c;
      });
    };
    try {
      // Kategoriya tuzatishlar importdan OLDIN registrga yoziladi. Agar
      // operator "Narxlarni ulash" tugmasini bosmagan bo'lsa ham, tanlangan
      // RES varaqlari importning o'zida qayta o'qiladi -- narx/kategoriya
      // manbasi vaqtinchalik UI holatiga bog'liq bo'lib qolmaydi.
      const resSatrlar = resSatrlariBarchaManbadan();
      const avtomatikKatNomzodlari = resKategoriyaNomzodlariniOl(resSatrlar);
      const saqlanadiganKatNomzodlari = katKorib.length ? katKorib : avtomatikKatNomzodlari;
      if (saqlanadiganKatNomzodlari.length) {
        qadam('Resurs kategoriyalari saqlanmoqda');
        await katNomzodlariniSaqla(saqlanadiganKatNomzodlari);
        yakunla('tayyor', saqlanadiganKatNomzodlari.length + ' ta resurs turi registrga yozildi');
      }

      qadam('Fayl tuzilishi (bo‘lim/ish/resurs) qurilmoqda');
      const lrvManbalar = book.sheets.flatMap((s) => {
        if (varaqTeglari[s.name] !== 'lrv') return [];
        const sheet = book.sheet(s.name);
        const lrvCols = inFileLrvCols[s.name] || (s.name === sheetName ? cols : null);
        return sheet && lrvCols ? [{ name: s.name, rows: sheet.rows, cols: lrvCols }] : [];
      });
      const ierHisobot: AnatomiyaHisobot[] = [];
      const lrvTree = tanlanganLrvVaraqlaridanDaraxtQur(lrvManbalar, { hisobot: (h) => ierHisobot.push(h) });
      if (!lrvTree.length) {
        yakunla('xato', 'daraxt bo‘sh chiqdi');
        throw new Error('Kamida bitta LRV varag‘i va uning ustunlari tanlangan bo‘lishi kerak.');
      }
      yakunla('tayyor', lrvManbalar.length + ' ta LRV varag‘i, ' + lrvTree.length + ' ta yuqori bo‘lim topildi');
      for (const h of ierHisobot) {
        qadam(`RZ ierarxiyasi — ${h.manba}`);
        yakunla('tayyor', h.ierarxiya
          ? `ichma-ich RZ, ${h.rzChuqurlik} daraja${h.vedomostChiqarildi ? `; «ВЕДОМОСТЬ РЕСУРСОВ» bo‘limidan ${h.vedomostChiqarildi} ta qator ish sifatida qo‘shilmadi (ikki marta sanalmasin)` : ''}`
          : `tekis RZ: ${h.sabab}`);
      }

      // RES tanlangan bo'lsa, indeks aynan HOZIRGI varaqlardan quriladi.
      // Shuning uchun ichki RES + alohida RES ko'p varaqda tanlangan holatda
      // ham "Narxlarni ulash" tugmasini avval bosish talab qilinmaydi.
      let importTree = lrvTree;
      const importResIndex = resSatrlar.length ? resNarxIndeksiQur(resSatrlar) : null;
      if (importResIndex) {
        qadam('RES narxlari LRV daraxtiga ulanmoqda');
        const qollangan = narxlarniDaraxtgaQoll(lrvTree, importResIndex);
        importTree = qollangan.tree;
        setNarxsizlar(qollangan.narxsizlar);
        yakunla('tayyor', qollangan.mosSoni + ' ta mos, ' + qollangan.mosEmasSoni + ' ta narxsiz qoldi');
      }

      if (!rawFile.current) throw new Error('Smeta manba fayli topilmadi. XLSX faylni qayta tanlang.');
      qadam('Manba fayl R2 saqlashga yuklanmoqda');
      const sourceDocumentId = await sourceniR2gaYukla(rawFile.current, Number(objectId));
      if (!jonli()) return;
      yakunla('tayyor', 'hujjat №' + sourceDocumentId);

      /* ══ BO'LAKLI IMPORT (T2-SMETA-IMPORT-50K-003) ══════════════════
         50 000 qatorli smeta bitta so'rovga sig'maydi (~10 MB JSON, va
         Pages Function izolyati 128 MB xotira bilan cheklangan). Shuning
         uchun daraxt SHU YERDA yoyiladi va bo'laklab yuboriladi: har
         so'rov kichik va tez, oxirida bitta «yakunla» hammasini birdan
         bazaga yozadi. Ota-bola aloqasi bo'lak chegarasidan o'tsa ham
         buziladigan joyi yo'q -- bog'lash yakunlashda, to'liq to'plam
         ustida bajariladi. */
      const flatRows = smetaDaraxtniYoy(importTree);
      const opId = importOperationId.current || (importOperationId.current = yangiOperationId());

      qadam('Import sessiyasi ochilmoqda');
      const bosh = await smetaSorov({
        amal: 'import_boshla', kompaniyaId: companyId, obyektId: Number(objectId),
        operationId: opId, sourceDocumentId,
      });
      if (!jonli()) return;
      if (!bosh.ok) {
        if (bosh.code === 'SMETA_ALREADY_EXISTS') {
          yakunla('xato', 'smeta allaqachon mavjud');
          throw new Error('Bu obyektda smeta allaqachon mavjud — ustidan yozilmaydi (xavfsizlik uchun).');
        }
        yakunla('xato', bosh.xato || bosh.code || 'noma’lum xato');
        throw new Error('Import boshlanmadi (' + (bosh.code || 'xato') + ')' + (bosh.xato ? ': ' + bosh.xato : '') + '.');
      }
      /* Allaqachon yakunlangan sessiya (masalan tarmoq uzilib, javob
         yetib kelmagan holat) -- ikkinchi smeta yaratilmaydi. */
      if (bosh.qator_soni != null && bosh.sessiya_id == null) {
        yakunla('tayyor', bosh.qator_soni + ' qator (avval yozilgan)');
        setResult({ qator_soni: bosh.qator_soni }); setPhase('Tayyor');
        onImportlandi?.();
        return;
      }
      const sessiyaId = Number(bosh.sessiya_id);
      yakunla('tayyor', 'sessiya №' + sessiyaId);

      const bolaklar = bolaklarga(flatRows, BOLAK_HAJMI);
      qadam(`Qatorlar yuborilmoqda (${flatRows.length} ta, ${bolaklar.length} bo‘lak)`);
      for (let i = 0; i < bolaklar.length; i++) {
        const b = await bolakniQaytaUrinibYubor({
          amal: 'import_bolak', kompaniyaId: companyId, sessiyaId, bolak: i, qatorlar: bolaklar[i],
        }, (n, jami) => tafsilotYangila(`${i + 1}/${bolaklar.length} bo‘lak — tarmoq uzildi, qayta urinish ${n}/${jami}…`));
        if (!jonli()) return;
        if (!b.ok) {
          yakunla('xato', `${i + 1}-bo‘lak: ` + (b.xato || b.code || 'noma’lum xato'));
          throw new Error('Bo‘lak yuborilmadi (' + (b.code || 'xato') + ').');
        }
        tafsilotYangila(`${i + 1}/${bolaklar.length} bo‘lak — ${b.jami ?? 0} qator qabul qilindi`);
      }
      yakunla('tayyor', `${bolaklar.length} bo‘lak, ${flatRows.length} qator qabul qilindi`);

      qadam('Kanonik bazaga yozilmoqda');
      const j = await smetaSorov({ amal: 'import_yakunla', kompaniyaId: companyId, sessiyaId });
      if (!jonli()) return;
      if (!j.ok) {
        if (j.code === 'SMETA_ALREADY_EXISTS') {
          yakunla('xato', 'smeta allaqachon mavjud');
          throw new Error('Bu obyektda smeta allaqachon mavjud — ustidan yozilmaydi (xavfsizlik uchun).');
        }
        yakunla('xato', j.xato || j.code || 'noma’lum xato');
        throw new Error('Import bajarilmadi (' + (j.code || 'xato') + ')' + (j.xato ? ': ' + j.xato : '') + '.');
      }
      yakunla('tayyor', (j.qator_soni || 0) + ' qator yozildi');
      setResult({ qator_soni: j.qator_soni || 0 }); setPhase('Tayyor');
      setObjects(prev => prev.map(o => o.id === Number(objectId) ? { ...o, qator_soni: j.qator_soni ?? o.qator_soni } : o));
      // Bu sahifa ko'pincha boshqa "asosiy" sahifa (masalan HolatNative)
      // ichida kichik panel sifatida ochiladi -- import muvaffaqiyatli
      // bo'lgach o'sha tashqi sahifa o'z daraxtini/summasini avtomatik
      // qayta yuklashi kerak, aks holda foydalanuvchi qo'lda "restart"
      // qilishga majbur bo'ladi (owner: shuni topib berdi).
      onImportlandi?.();
    } catch (e) {
      if (jonli()) {
        // Agar biror qadam "ishlamoqda" holatida to'xtab qolgan bo'lsa
        // (masalan kutilmagan istisno, yuqoridagi yakunla() chaqirilmagan
        // joyda) -- uni ham "xato" deb yakunlaymiz, osilib qolmasin.
        setImportQadamlari(prev => {
          if (!prev.length || prev[prev.length - 1].holat !== 'ishlamoqda') return prev;
          const c = prev.slice(); c[c.length - 1] = { ...c[c.length - 1], holat: 'xato' }; return c;
        });
        setError(e instanceof Error ? e.message : 'Import bajarilmadi.');
      }
    }
    finally { setBusy(false); }
  }

  const selectedObject = objects.find(o => o.id === Number(objectId));
  const alreadyHasSmeta = !!selectedObject?.qator_soni;

  /* C5: LRV ↔ RES solishtirish manbalari (bitta fayl oqimi). Belgi qo'yilmagan
     yagona varaqli faylda tanlangan varaq — LRV. */
  const sverkaLrvlar = useMemo<SverkaManba[]>(() => {
    if (!book) return [];
    const tegli = Object.keys(varaqTeglari).length > 0;
    return book.sheets.flatMap((s) => {
      if (tegli ? varaqTeglari[s.name] !== 'lrv' : s.name !== sheetName) return [];
      const sheet = book.sheet(s.name);
      return sheet ? [{ nom: s.name, rows: sheet.rows as SverkaManba['rows'] }] : [];
    });
  }, [book, varaqTeglari, sheetName]);
  const sverkaReslar = useMemo<SverkaManba[]>(() => {
    const out: SverkaManba[] = [];
    for (const s of book?.sheets ?? []) {
      if (varaqTeglari[s.name] !== 'res') continue;
      const sheet = book!.sheet(s.name);
      if (sheet) out.push({ nom: s.name, rows: sheet.rows as SverkaManba['rows'] });
    }
    for (const name of resBook ? resSheetNames : []) {
      const sheet = resBook!.sheet(name);
      if (sheet) out.push({ nom: name, rows: sheet.rows as SverkaManba['rows'] });
    }
    return out;
  }, [book, varaqTeglari, resBook, resSheetNames]);
  const paketSverka = useMemo(() => ({
    lrvlar: paketVaraqlar.filter((v) => v.selectedRole === 'lrv').map((v) => ({ nom: `${v.file.name} / ${v.sheetName}`, rows: v.rows as SverkaManba['rows'] })),
    reslar: paketVaraqlar.filter((v) => v.selectedRole === 'res').map((v) => ({ nom: `${v.file.name} / ${v.sheetName}`, rows: v.rows as SverkaManba['rows'] })),
  }), [paketVaraqlar]);

  return (
    <div className="space-y-3 p-1">
      {!fixedObjectId && <label className="block text-sm">Obyekt
        <select aria-label="Obyekt" className="ml-2 border rounded px-2 py-1"
          value={objectId} onChange={e => {
            setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); reset(); rawFile.current = null;
            sourceDocumentId.current = undefined; sourceOperationId.current = ''; importOperationId.current = '';
          }}>
          <option value="">Tanlang</option>
          {objects.map(o => <option key={o.id} value={o.id}>{o.nom}{o.qator_soni ? ` (${o.qator_soni} qator bor)` : ' (bo‘sh)'}</option>)}
        </select>
      </label>}
      {objectId && alreadyHasSmeta && (
        <div className="space-y-2">
          <p role="alert" className="text-warn text-sm">Bu obyektda allaqachon {selectedObject?.qator_soni} qatorlik smeta bor. Eski qatorlar o‘zgarmaydi; yangi fayl faqat non-destructive diff preview sifatida tekshiriladi.</p>
          <label className="block text-sm">Smeta yangi revisioni (preview)
            <input aria-label="Smeta revision fayli" type="file" accept=".xlsx,.xlsm,.xls" className="ml-2"
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </label>
          {reimportDiff && <section className="karta space-y-2 p-3 text-[13px]" aria-label="Smeta qayta import diff">
            <p className="font-semibold">Diff tayyor — hech qanday yozish bajarilmadi</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <span>O‘zgarmagan: <b>{reimportDiff.same.length}</b></span>
              <span>Qo‘shilgan: <b>{reimportDiff.added.length}</b></span>
              <span>Yo‘qolgan: <b className={reimportDiff.removed.length ? 'text-danger' : ''}>{reimportDiff.removed.length}</b></span>
              <span>Tarix candidate: <b>{reimportDiff.history.length}</b></span>
            </div>
            {reimportDiff.history.length > 0 && <ul className="list-disc space-y-1 pl-5 text-text-dim">
              {reimportDiff.history.slice(0, 8).map((row) => <li key={`${row.kind}:${row.identity}`}>{row.kind}: {row.reason}</li>)}
            </ul>}
            {reimportDiff.history.length > 8 && <p className="text-text-mute">Yana {reimportDiff.history.length - 8} ta candidate mavjud — operator review va yangi revision RPC talab qilinadi.</p>}
          </section>}
        </div>
      )}
      {objectId && !alreadyHasSmeta && (
        <>
          <label className="block text-sm">Bitta smeta fayli (XLSX)
            <input aria-label="Smeta fayli" type="file" accept=".xlsx,.xlsm,.xls" className="ml-2"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </label>
          <section className="karta mt-3 space-y-3 p-3" aria-label="Ko‘p faylli smeta paketi">
            <div>
              <p className="text-[13px] font-semibold">Ko‘p faylli smeta paketi — 4 uchastka + EO kabi</p>
              <p className="mt-1 text-[11px] text-text-mute">
                Avval har bir XLSX ichidagi har bir varaq tahlil qilinadi. So‘ng LRV, RES yoki e’tiborsiz rolini
                tasdiqlaysiz. Har LRV alohida RZ ildizi sifatida saqlanadi. RES hech qachon boshqa LRVga avtomatik
                tarqatilmaydi; papka va fayl nomi faqat ko‘rinish uchun.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">Paket XLSX fayllari (bir nechtasini tanlang)
                <input aria-label="Paket XLSX fayllari" type="file" multiple accept=".xlsx,.xlsm,.xls" className="ml-2"
                  disabled={paketBand}
                  onChange={e => { if (e.target.files?.length) void paketFayllariniTahlilQil(e.target.files); e.currentTarget.value = ''; }} />
              </label>
              <label className="text-sm">Obyekt papkasini birdan tahlil qilish
                <input aria-label="Paket papkasi" type="file" multiple className="ml-2"
                  ref={(node) => { node?.setAttribute('webkitdirectory', ''); node?.setAttribute('directory', ''); }}
                  disabled={paketBand}
                  onChange={e => { if (e.target.files?.length) void paketPapkasiniTahlilQil(e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>
            {paketBand && <p role="status" className="text-[12px] text-text-mute">{phase}…</p>}
            {paketVaraqlar.length > 0 && (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-[12px]">Paket nomi
                    <input aria-label="Smeta paketi nomi" className="ml-2 w-[min(100%,20rem)] border rounded px-2 py-1"
                      value={paketNom} onChange={e => { setPaketNom(e.target.value); setPaketTasdiqImzosi(null); paketImportOperationId.current = ''; }} disabled={paketBand} />
                  </label>
                  <span className="text-[11px] text-text-mute self-end">{paketVaraqlar.length} ta varaq tahlil qilindi</span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-text-mute"><th className="pb-1 font-normal">Fayl / varaq</th><th className="pb-1 font-normal">Tahlil</th><th className="pb-1 font-normal">Rol</th><th className="pb-1 font-normal">RES qaysi LRVga</th><th className="pb-1 font-normal">Amal</th></tr></thead>
                    <tbody>{paketVaraqlar.map((sheet) => {
                      const allLrvs = paketVaraqlar.filter((item) => item.selectedRole === 'lrv');
                      const ownLrvs = allLrvs.filter((item) => item.workbookId === sheet.workbookId);
                      const targets = ownLrvs.length ? ownLrvs : allLrvs;
                      const internal = ownLrvs.length > 0;
                      return <tr key={sheet.id} className="border-t border-border/40">
                        <td className="py-1 pr-2">{sheet.file.name}<br /><span className="text-text-mute">{sheet.sheetName}</span></td>
                        <td className="py-1 pr-2"><span className="capitalize">{sheet.selectedRole === 'ignore' ? 'e’tiborsiz' : sheet.analysis.detectedRole}</span> · {sheet.analysis.confidence}<br /><span className="text-text-mute">{sheet.analysis.ignoreReason || sheet.analysis.evidence[0] || 'signal yo‘q'}</span>{sheet.embeddedResBoundaryRow && <><br /><span className="text-warn">LRV yakunidan keyingi RES ilovasi {sheet.embeddedResBoundaryRow}-qatordan ajratiladi</span></>}</td>
                        <td className="py-1 pr-2"><select aria-label={`${sheet.file.name} ${sheet.sheetName} roli`} className="border rounded px-1" value={sheet.selectedRole || ''} disabled={paketBand}
                          onChange={e => paketVaraqniYangila(sheet.id, { selectedRole: (e.target.value || undefined) as PaketVaraq['selectedRole'], targetLrvSourceKeys: e.target.value === 'res' ? sheet.targetLrvSourceKeys : undefined })}>
                          <option value="">Tanlang</option><option value="lrv">LRV</option><option value="res">RES</option><option value="ignore">E’tiborsiz</option>
                        </select></td>
                        <td className="py-1 pr-2">{sheet.selectedRole === 'res' ? <>
                          <fieldset aria-label={`${sheet.file.name} ${sheet.sheetName} RES qaysi LRVlarga`} className="space-y-0.5" disabled={paketBand}>
                            {targets.map(target => {
                              const belgi = sheet.targetLrvSourceKeys?.includes(target.sourceKey) ?? false;
                              return <label key={target.id} className="flex items-center gap-1.5">
                                <input type="checkbox" checked={belgi}
                                  onChange={() => {
                                    const joriy = sheet.targetLrvSourceKeys ?? [];
                                    const yangi = belgi ? joriy.filter(k => k !== target.sourceKey) : [...joriy, target.sourceKey];
                                    paketVaraqniYangila(sheet.id, { targetLrvSourceKeys: yangi.length ? yangi : undefined });
                                  }} />
                                <span>{target.file.name} / {target.sheetName}</span>
                              </label>;
                            })}
                            {!targets.length && <span className="text-warn">Avval kamida bitta varaqni LRV deb belgilang</span>}
                          </fieldset>
                          <span className="text-text-mute">{internal ? 'Ichki RES: faqat shu XLSX LRV(lar)i' : 'Tashqi RES: belgilangan har LRV ga — boshqasiga avtomatik tarqatilmaydi'}</span></> : '—'}</td>
                        <td className="py-1"><button type="button" className="text-danger underline disabled:opacity-50" disabled={paketBand}
                          onClick={() => { setPaketVaraqlar(prev => prev.filter(item => item.id !== sheet.id)); setPaketTasdiqImzosi(null); paketImportOperationId.current = ''; }}>Olib tashlash</button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                <LrvResSverkaPanel lrvlar={paketSverka.lrvlar} reslar={paketSverka.reslar} obyektNomi={selectedObject?.nom ?? ''} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="tugma disabled:opacity-50" disabled={paketBand || busy} onClick={paketTahliliniTasdiqla}>Tahlil va manba bog‘lanishini tasdiqlash</button>
                  <span className={paketTasdiqImzosi === smetaPaketTasdiqImzosi(paketVaraqlar) ? 'text-success text-[12px]' : 'text-warn text-[12px]'}>
                    {paketTasdiqImzosi === smetaPaketTasdiqImzosi(paketVaraqlar) ? 'Tasdiqlandi' : 'Importdan oldin tasdiq kerak'}
                  </span>
                </div>
                <button type="button" className="tugma-asosiy disabled:opacity-50" disabled={paketBand || busy || !paketVaraqlar.some((sheet) => sheet.selectedRole === 'lrv') || paketTasdiqImzosi !== smetaPaketTasdiqImzosi(paketVaraqlar)}
                  onClick={() => void paketImportQil()}>
                  {paketBand ? 'Paket tayyorlanmoqda…' : 'Tasdiqlangan paketni kanonik import qilish'}
                </button>
              </>
            )}
          </section>
        </>
      )}
      {busy && importQadamlari.length === 0 && <p role="status">{phase}…</p>}
      {importQadamlari.length > 0 && <ImportQadamlarPaneli qadamlar={importQadamlari} />}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {book && cols && !result && (
        <>
          {book.sheets.length > 1 && (
            <div className="karta p-3 space-y-1.5">
              <p className="text-[12px] font-semibold text-text">
                Varaqlar — har biri LRV yoki RES sifatida taxmin qilindi, kerak bo‘lsa tuzating
              </p>
              <p className="text-[11px] text-text-mute">
                Bitta faylda ham LRV (ish/hajm ierarxiyasi), ham RES (narx katalogi) varaqlari bo‘lishi mumkin.
                Bir obyekt ichidagi bir nechta uchastka uchun bir nechta LRV varag‘ini belgilang: ular alohida
                manba ildizlari ostida bitta kanonik importga tushadi. RES belgilangan varaq(lar)ning narxlari
                hammasidan birlashtirib qo‘llanadi.
              </p>
              <table className="w-full text-[12.5px]">
                <thead><tr className="text-text-mute text-left"><th className="font-normal pb-1">Varaq</th><th className="font-normal pb-1">LRV</th><th className="font-normal pb-1">RES</th></tr></thead>
                <tbody>
                  {book.sheets.map(s => (
                    <tr key={s.name} className="border-t border-border/40">
                      <td className="py-1 pr-2">{s.name}</td>
                      <td className="py-1 pr-2">
                        <input type="checkbox" aria-label={`${s.name} — LRV`}
                          checked={varaqTeglari[s.name] === 'lrv'}
                          onChange={e => varaqTegBelgila(book, s.name, e.target.checked ? 'lrv' : 'etibor_bermaslik')} />
                      </td>
                      <td className="py-1">
                        <input type="checkbox" aria-label={`${s.name} — RES`}
                          checked={varaqTeglari[s.name] === 'res'}
                          onChange={e => varaqTegBelgila(book, s.name, e.target.checked ? 'res' : 'etibor_bermaslik')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {book.sheets.filter(s => varaqTeglari[s.name] === 'lrv').map(s => {
                const c = inFileLrvCols[s.name];
                if (!c) return null;
                return (
                  <fieldset key={s.name} className="flex flex-wrap gap-3 items-end pt-1 border-t border-border/40">
                    <legend className="text-[11px] text-text-mute">«{s.name}» LRV ustunlari (1 dan boshlab)</legend>
                    {(['kod', 'nom', 'bir', 'norma', 'obyom', 'narx', 'sum'] as const).map(k => (
                      <label key={k} className="text-[12px]">{k}
                        <input className="w-16 border rounded px-1 ml-1" type="number" min="0"
                          value={c[k] + 1}
                          onChange={e => setInFileLrvCols(prev => ({ ...prev, [s.name]: { ...c, [k]: Number(e.target.value) - 1 } }))} />
                      </label>
                    ))}
                  </fieldset>
                );
              })}
              {book.sheets.filter(s => varaqTeglari[s.name] === 'res').map(s => {
                const c = inFileResCols[s.name];
                if (!c) return null;
                return (
                  <fieldset key={s.name} className="flex flex-wrap gap-3 items-end pt-1 border-t border-border/40">
                    <legend className="text-[11px] text-text-mute">«{s.name}» RES ustunlari (1 dan boshlab)</legend>
                    {(['kod', 'nom', 'bir', 'narx'] as const).map(k => (
                      <label key={k} className="text-[12px]">{k}
                        <input className="w-16 border rounded px-1 ml-1" type="number" min="1"
                          value={c[k] + 1}
                          onChange={e => { setResIndex(null); setResIndexSize(0); setInFileResCols(prev => ({ ...prev, [s.name]: { ...c, [k]: Number(e.target.value) - 1 } })); }} />
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>
          )}
          <div className="karta p-3 text-[12px] overflow-auto max-h-64">
            <p className="mb-1 text-[11px] text-text-mute">Tekshirilayotgan LRV varag‘i: <b>{sheetName}</b></p>
            <table className="w-full">
              <tbody>
                {preview.slice(0, 12).map(row => (
                  <tr key={row.r} className="border-t border-border/60">
                    <td className="text-text-mute pr-2">{row.r}</td>
                    {row.cells.map((c, ci) => <td key={ci} className="px-1">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="karta p-3 space-y-2">
            <p className="text-[12px] font-semibold text-text">
              Resurs vedomosti (RES) — narxlarni ulash (ixtiyoriy)
            </p>
            <p className="text-[11px] text-text-mute">
              Real smeta odatda 2 hujjat: LRV (ish/hajm — yuqorida) va RES (kod/nom/birlik bo‘yicha resurs narxlari).
              Agar RES yuqoridagi bir varaqqa BELGILANGAN bo‘lsa, alohida fayl shart emas — shu yerdagi tugma
              bilan ulang. Alohida RES fayli bo‘lsa, shu yerga ham yuklashingiz mumkin (ikkalasi ham birlashtiriladi).
              LRV faylida allaqachon narxi bor qatorlar ustidan yozilmaydi.
            </p>
            <label className="block text-sm">Alohida RES fayli (XLSX, ixtiyoriy)
              <input aria-label="RES fayli" type="file" accept=".xlsx,.xlsm,.xls" className="ml-2"
                onChange={e => { const f = e.target.files?.[0]; if (f) void uploadRes(f); }} />
            </label>
            {resBusy && <p role="status" className="text-[12px]">RES fayli o‘qilmoqda…</p>}
            {resError && <p role="alert" className="text-danger text-[12px]">{resError}</p>}
            {resBook && (
              <>
                {/* Owner (2026-09-10): "res ni yuklash vaqtida listlarini xuddi
                    lrv day boshlang'ich ko'rsata olishi kerak edi. hozir shu
                    yerda listni ko'rmay tavakkal belgilanayapdi" -- avval bu
                    yerda faqat varaq NOMLARI bo'lgan tanlov (select) turardi:
                    qaysi varaqda nima borligi ko'rinmasdi. Endi asosiy fayl
                    varaqlari kabi jadval: nomi, qator soni va tizim taxmini. */}
                <div className="karta p-2 space-y-1.5" data-testid="res-varaq-royxat">
                  <p className="text-[12px] font-semibold text-text">
                    RES faylining varaqlari — narx o‘qiladigan hamma varaqlarni belgilang
                  </p>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-text-mute text-left text-[11px]">
                        <th className="font-normal pb-1">Tanlash</th>
                        <th className="font-normal pb-1">Varaq</th>
                        <th className="font-normal pb-1">Qator</th>
                        <th className="font-normal pb-1">Tizim taxmini</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resBook.sheets.map(s => {
                        const taxmin = varaqTuriTaxmin(s.rows, s.name);
                        return (
                          <tr key={s.name} className="border-t border-border/40">
                            <td className="py-1 pr-2">
                              <input type="checkbox" aria-label={`${s.name} — RES varag‘i`}
                                checked={resSheetNames.includes(s.name)}
                                onChange={e => resVaraqBelgila(resBook, s.name, e.target.checked)} />
                            </td>
                            <td className="py-1 pr-2">{s.name}</td>
                            <td className="py-1 pr-2 text-text-mute">{s.rows.length}</td>
                            <td className="py-1">
                              {taxmin === 'res' ? <span className="text-success">RES (narx katalogi)</span>
                                : taxmin === 'lrv' ? <span className="text-warn">LRV (ish/hajm) — narx katalogi emas</span>
                                : <span className="text-text-mute">aniqlanmadi</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {resSheetNames.length === 0 && <p className="text-[11px] text-warn">Narx manbasi uchun kamida bitta RES varag‘ini belgilang.</p>}
                {resSheetNames.map(name => {
                  const c = resColsBySheet[name];
                  const sheet = resBook.sheet(name);
                  if (!c || !sheet) return null;
                  return (
                    <div key={name} className="space-y-1 border-t border-border/40 pt-2">
                      <fieldset className="flex flex-wrap gap-3 items-end">
                        <legend className="text-[11px] text-text-mute">«{name}» RES ustunlari (1 dan boshlab)</legend>
                        {(['kod', 'nom', 'bir', 'narx'] as const).map(k => (
                          <label key={k} className="text-[12px]">{k}
                            <input className="w-16 border rounded px-1 ml-1" type="number" min="0"
                              value={c[k] + 1}
                              onChange={e => { setResIndex(null); setResIndexSize(0); setKatKorib([]); setResColsBySheet(prev => ({ ...prev, [name]: { ...c, [k]: Number(e.target.value) - 1 } })); }} />
                          </label>
                        ))}
                      </fieldset>
                      <p className="text-[11px] text-text-mute">«{name}» varag‘ining boshlang‘ich qatorlari:</p>
                      <VaraqKorinishi rows={sheet.rows} cols={c} />
                    </div>
                  );
                })}
              </>
            )}
            {(book?.sheets.some(s => varaqTeglari[s.name] === 'res') || (resBook && resSheetNames.length > 0)) && (
              <button type="button" className="tugma" onClick={resNarxlarniUlash}>Narxlarni tekshirib ulash</button>
            )}
            {resIndex && (
              <p className="text-[12px] text-success">
                {resIndexSize} ta resurs narxi o‘qildi ({resIndex.byNomBir.size} ta nom+birlik bo‘yicha, shundan {resIndex.byKodNomBir.size} tasi kod bilan aniqlashtirilgan).
                Import bosilganda hozir tanlangan barcha ichki va alohida RES varaqlaridan narxlar yana yig‘ilib, mos keluvchi narxsiz qatorlarga qo‘llanadi.
              </p>
            )}
            {katKorib.length > 0 && (
              <div className="karta p-2 space-y-1.5 border-amber-500/30">
                <p className="text-[11px] text-text-mute">
                  <b>{katKorib.length} ta</b> resursning turi aniqlandi. Tartib: <b>birlik eng ustun</b> —
                  ЧЕЛ-Ч → ЧЕЛ, МАШ-Ч → МАШ (mashinist mehnati МАШ, chunki u mashina stavkasi ichida).
                  <b>КАБ</b> — kabel/provod oilasi, nomi bo‘yicha. <b>М/К</b> — nomi tayyor
                  konstruksiyani bildirsa <b>va</b> birligi og‘irlikda (кг/т) bo‘lsa, shuning uchun
                  armatura va prokat unga tushmaydi (ular xomashyo). <b>БЕЗСКЛАД</b> faqat товарный бетон,
                  beton qorishmasi, rastvor va asfaltobeton kabi tayyor aralashmalar uchun ishlatiladi;
                  beton blok/konstruksiya ombor materiali bo'lib qoladi. <b>МАТ va ОБ</b> farqi esa faqat
                  RES faylining bo‘lim sarlavhasidan yoki podvaldagi nakrutka foizidan olinadi
                  (ОБ: {'«'}ЗАГОТ-СКЛАДСКИЕ=1,2%{'»'}, МАТ: {'«'}…=2% И М/К=0,75%{'»'}) — buni
                  birlikdan (шт, м2, компл) topib bo‘lmaydi. Noto‘g‘ri bo‘lsa shu yerda tuzating;
                  belgilangan tur registrga yozilib, keyingi importlarda ham eslab qolinadi.
                </p>
                <p className="text-[11px] text-text-mute">
                  {(['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К', 'БЕЗСКЛАД'] as const)
                    .map(k => ({ k, n: katKorib.filter(x => x.tanlangan === k).length }))
                    .filter(x => x.n > 0)
                    .map(x => `${x.k}: ${x.n}`).join(' · ')}
                </p>
                <div className="overflow-auto max-h-48 text-[12px]">
                  <table className="w-full">
                    <tbody>
                      {katKorib.slice(0, 300).map((k, i) => (
                        <tr key={k.nom + '|' + k.birlik} className="border-t border-border/40">
                          <td className="py-0.5 pr-2">{k.nom} <span className="text-text-mute">({k.birlik})</span></td>
                          <td className="py-0.5 text-right">
                            <select className="border rounded px-1 py-0.5" value={k.tanlangan}
                              aria-label={`${k.nom} kategoriyasi`}
                              onChange={e => setKatKorib(prev => prev.map((p, pi) => pi === i ? { ...p, tanlangan: e.target.value as T2ResursKategoriya } : p))}>
                              <option value="ЧЕЛ">ЧЕЛ</option>
                              <option value="МАШ">МАШ</option>
                              <option value="МАТ">МАТ</option>
                              <option value="ОБ">ОБ</option>
                              <option value="КАБ">КАБ</option>
                            <option value="М/К">М/К</option>
                            <option value="БЕЗСКЛАД">БЕЗСКЛАД</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {katKorib.length > 300 && (
                  <p className="text-[11px] text-text-mute">
                    …va yana {katKorib.length - 300} ta (hammasi saqlanadi, ro‘yxatda faqat birinchi 300 tasi ko‘rsatilgan).
                  </p>
                )}
                {katSaqlanmoqda && <p role="status" className="text-[11px]">Kategoriyalar saqlanmoqda…</p>}
              </div>
            )}

            <LrvResSverkaPanel lrvlar={sverkaLrvlar} reslar={sverkaReslar} obyektNomi={selectedObject?.nom ?? ''} />

            {/* Owner (2026-09-10): "narxlanmagan rs mat ob kabi har bir
                qatorlarni bildirishi va sababini keltirib bera olishi kerak" --
                avval faqat "N ta narxsiz qoldi" degan SON chiqardi. */}
            {narxsizlar.length > 0 && (
              <div className="karta p-2 space-y-1.5 border-danger/40" data-testid="narxsiz-royxat">
                <p className="text-[12px]">
                  <b className="text-danger">{narxsizlar.length} ta qator narxsiz qoldi.</b>{' '}
                  Bu qatorlar smetaga <b>narxsiz</b> yozildi — obyekt jami summasi shu qadar to‘liq emas.
                </p>
                <p className="text-[11px] text-text-mute">
                  {(Object.keys(NARXSIZ_SABAB_MATN) as NarxsizSabab[])
                    .map(s => ({ s, n: narxsizlar.filter(x => x.sabab === s).length }))
                    .filter(x => x.n > 0)
                    .map(x => `${NARXSIZ_SABAB_MATN[x.s]}: ${x.n} ta`)
                    .join(' · ')}
                </p>
                <div className="overflow-auto max-h-48 text-[12px]">
                  <table className="w-full">
                    <thead>
                      <tr className="text-text-mute text-[11px]">
                        <th className="text-left py-0.5 pr-2">Kod</th>
                        <th className="text-left py-0.5 pr-2">Nom</th>
                        <th className="text-left py-0.5 pr-2">Birlik</th>
                        <th className="text-left py-0.5">Nega narxsiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {narxsizlar.slice(0, 300).map((r, i) => (
                        <tr key={(r.uid || '') + i} className="border-t border-border/40">
                          <td className="py-0.5 pr-2 text-text-mute">{r.kod || '—'}</td>
                          <td className="py-0.5 pr-2">{r.nom || '(nomsiz)'}</td>
                          <td className="py-0.5 pr-2 text-text-mute">{r.bir || '—'}</td>
                          <td className="py-0.5">{NARXSIZ_SABAB_MATN[r.sabab]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {narxsizlar.length > 300 && (
                  <p className="text-[11px] text-text-mute">
                    …va yana {narxsizlar.length - 300} ta (ro‘yxatda birinchi 300 tasi ko‘rsatilgan).
                  </p>
                )}
              </div>
            )}
          </div>
          <button type="button" className="tugma tugma-asosiy" disabled={busy} onClick={() => void importQil()}>
            Ushbu ustunlar bilan import qilish
          </button>
        </>
      )}
      {result && (
        <p role="status" className="text-success">Tayyor: {result.qator_soni} qator canonical Supabase’ga yozildi.</p>
      )}
    </div>
  );
}

export default function SmetaYuklaNative({ obyektId, onImportlandi }: { obyektId?: number; onImportlandi?: () => void } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={`${joriy.id}:${obyektId ?? 'all'}`} companyId={joriy.id} fixedObjectId={obyektId} onImportlandi={onImportlandi} />;
}
