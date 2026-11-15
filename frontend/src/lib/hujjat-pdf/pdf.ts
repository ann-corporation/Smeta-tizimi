/**
 * hujjat-pdf/pdf.ts — YAGONA PDF dvigateli (egasi 2026-11-16: hujjatni bitta dvigatel yasaydi, har ilova faqat so'raydi va ko'rsatadi).
 *
 * Manba — tayyor .xlsx (`f2Hujjat` / `forma3Hujjat` natijasi) dan `hujjatKorinishi` (saytdagi ko'rinish modeli): ya'ni PDF
 * har doim Excel faylning AYNAN o'zidan chiqadi (bir xil sonlar, bir xil formatlash, yashirin «Тип» ustuni yo'q, BL/MAT/OB qalin,
 * RS kursiv, birlashgan kataklar, qatorlarning katta harfi — hammasi Excel yozuvchisidan). Ikkinchi shablon YO'Q.
 * Kutubxona: jsPDF + autotable (sof JS, Cloudflare Worker va brauzerda ishlaydi); shrift: LiberationSans (kirill).
 * Sahifa: A4; keng jadval — albom, tor — kitob; jadval sarlavhasi har sahifada takrorlanadi; pastda fayl nomi va «N / M».
 */
import type { KorinishVaraq, KorinishQator } from '../hujjat-yozuvchi/korinish';
import { BREND_HUJJAT_MATN } from '../brend';
import { qrPng } from '../imzo/qr';
import { BREND_LOGO_PNG_B64 } from './brend-logo.generated';
import { SHRIFT_BOLD, SHRIFT_BOLDITALIC, SHRIFT_ITALIC, SHRIFT_NORMAL } from './shriftlar.generated';

export type PdfOpsiya = { faylNomi: string; sarlavha?: string; /** Hujjat tekshirish kodi (XXXXX-XXXXX) — kolontitul matni uchun. */ kod?: string; /** QR manzili (<BREND_URL yoki joriy origin>/t/<token>); berilmasa QR chiqmaydi — domen qattiq yozilmaydi. */ tekshirHavola?: string };

const SHRIFT = 'LiberationSans';
const NBSP = ' ';
/** ru-RU formati tor probel (U+202F) ishlatadi — shriftda glif bo'lmasligi mumkin; ko'rinishi bir xil NBSP ga almashtiriladi. */
const tozaMatn = (s: string) => s.replace(/[  ]/g, NBSP);

type JsPdfDoc = import('jspdf').jsPDF;

function shriftlarniQosh(doc: JsPdfDoc): void {
  const qosh = (b64: string, nom: string, uslub: string) => { doc.addFileToVFS(nom, b64); doc.addFont(nom, SHRIFT, uslub, undefined, 'Identity-H'); };
  qosh(SHRIFT_NORMAL, 'LS-Regular.ttf', 'normal');
  qosh(SHRIFT_BOLD, 'LS-Bold.ttf', 'bold');
  qosh(SHRIFT_ITALIC, 'LS-Italic.ttf', 'italic');
  qosh(SHRIFT_BOLDITALIC, 'LS-BoldItalic.ttf', 'bolditalic');
}

type Hujayra = { content: string; colSpan?: number; styles: Record<string, unknown> };

function qatorHujayralari(v: KorinishVaraq, q: KorinishQator): Hujayra[] {
  const out: Hujayra[] = [];
  const bor = new Map(q.kataklar.map((k) => [k.c, k] as const));
  for (let i = 0; i < v.ustunlar.length;) {
    const k = bor.get(v.ustunlar[i].c);
    if (!k) { out.push({ content: '', styles: {} }); i++; continue; }
    const span = Math.max(1, Math.min(k.span, v.ustunlar.length - i));
    const uslub = k.qalin && k.kursiv ? 'bolditalic' : k.qalin ? 'bold' : k.kursiv ? 'italic' : 'normal';
    const st: Record<string, unknown> = { fontStyle: uslub, halign: k.tekis };
    if (k.fon) st.fillColor = [parseInt(k.fon.slice(0, 2), 16), parseInt(k.fon.slice(2, 4), 16), parseInt(k.fon.slice(4, 6), 16)];
    out.push({ content: tozaMatn(k.matn), ...(span > 1 ? { colSpan: span } : {}), styles: st });
    i += span;
  }
  return out;
}

/** Sarlavha bloki (jadvalgacha) va ustun sarlavhasi: raqamlash qatori (1 | 2 | 3 …) gacha — ustun sarlavhalari BU qator bilan tugaydi. */
export function varaqBolinishi(v: KorinishVaraq): { titul: KorinishQator[]; bosh: KorinishQator[]; tana: KorinishQator[] } {
  if (v.raqamQatori == null) return { titul: [], bosh: [], tana: v.qatorlar.filter((q) => q.turi !== 'bosh') };
  const oldin = v.qatorlar.filter((q) => q.r <= v.raqamQatori! && q.turi !== 'bosh');
  const birinchiJadval = oldin.findIndex((q) => q.kataklar.length >= 3);
  const bosh = birinchiJadval < 0 ? [] : oldin.slice(birinchiJadval);
  const titul = birinchiJadval < 0 ? oldin : oldin.slice(0, birinchiJadval);
  return { titul, bosh, tana: v.qatorlar.filter((q) => q.r > v.raqamQatori! && q.turi !== 'bosh') };
}

export async function korinishdanPdf(varaqlar: readonly KorinishVaraq[], o: PdfOpsiya): Promise<Uint8Array> {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (atMod as unknown as { default?: unknown; autoTable?: unknown }).autoTable ?? (atMod as unknown as { default: unknown }).default;
  const jadval = autoTable as (d: JsPdfDoc, opt: Record<string, unknown>) => void;
  const korinadigan = varaqlar.filter((v) => v.qatorlar.some((q) => q.kataklar.length));
  const albom = (v: KorinishVaraq) => v.ustunlar.length >= 6;
  const birinchi = korinadigan[0];
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: birinchi && !albom(birinchi) ? 'portrait' : 'landscape', compress: true });
  doc.setProperties({ title: o.sarlavha ?? o.faylNomi });
  shriftlarniQosh(doc);
  doc.setFont(SHRIFT, 'normal');
  const MARGIN = 10;

  korinadigan.forEach((v, vi) => {
    const yon = albom(v) ? 'landscape' : 'portrait';
    if (vi > 0) doc.addPage('a4', yon);
    const kenglik = doc.internal.pageSize.getWidth() - 2 * MARGIN;
    const jamiW = v.ustunlar.reduce((s, u) => s + Math.max(u.kenglik, 2), 0) || 1;
    const ustunUslub: Record<number, { cellWidth: number }> = {};
    v.ustunlar.forEach((u, i) => { ustunUslub[i] = { cellWidth: (Math.max(u.kenglik, 2) / jamiW) * kenglik }; });
    const { titul, bosh, tana } = varaqBolinishi(v);
    const asos = { font: SHRIFT, fontSize: v.ustunlar.length > 9 ? 6.5 : 8, cellPadding: 0.9, overflow: 'linebreak', valign: 'middle', lineColor: [120, 120, 120], lineWidth: 0.1, textColor: 0 };
    let y = MARGIN;
    if (titul.length) {
      jadval(doc, {
        startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'plain', tableWidth: kenglik, columnStyles: ustunUslub,
        styles: { ...asos, lineWidth: 0, fontSize: 8.5 }, body: titul.map((q) => qatorHujayralari(v, q)),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 1.5;
    }
    jadval(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN, bottom: 17 }, theme: 'grid', tableWidth: kenglik, columnStyles: ustunUslub,
      styles: asos, headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [235, 235, 235], textColor: 0 },
      head: bosh.map((q) => qatorHujayralari(v, q)), body: tana.map((q) => qatorHujayralari(v, q)),
      showHead: 'everyPage', rowPageBreak: 'avoid',
    });
  });

  // QURAI kolontituli (egasi 2026-11-16): logo + «QURAI · qurai.uz orqali tayyorlandi», sahifa raqami, markazida QURAI belgisi bor tekshirish QR i.
  // Faqat sahifa pastki chetida; hujjat tanasi (jadval, summalar) tegilmaydi.
  const n = doc.getNumberOfPages();
  
  const qr = o.tekshirHavola ? qrPng(o.tekshirHavola, 4, true).png : null;
  const logoUrl = 'data:image/png;base64,' + BREND_LOGO_PNG_B64;
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setFont(SHRIFT, 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.addImage(logoUrl, 'PNG', MARGIN, H - 9.2, 4.6, 4.6);
    doc.text(BREND_HUJJAT_MATN, MARGIN + 6, H - 6.2, { maxWidth: W - 2 * MARGIN - 45 });
    doc.text(o.faylNomi.replace(/\.xlsx$/i, '') + (o.kod ? ` · ${o.kod}` : ''), MARGIN + 6, H - 3.4, { maxWidth: W - 2 * MARGIN - 45 });
    doc.text(`${i} / ${n}`, W - MARGIN - 13, H - 5, { align: 'right' });
    if (qr) doc.addImage(qr, 'PNG', W - MARGIN - 11, H - 15.5, 11, 11);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}