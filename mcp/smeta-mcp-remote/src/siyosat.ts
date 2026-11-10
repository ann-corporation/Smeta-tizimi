/**
 * Masofaviy tool siyosati. Tool mantig'i — mcp/smeta-mcp/src/tools/* (lokal stdio server bilan BIR XIL kod, fork yo'q);
 * bu yerda faqat: qaysi toollar ochiq, tenant doirasi, yozishda dry_run standart + aniq `tasdiq`, javob hajmi chegarasi, audit.
 *
 * Ochilmaganlar (v1): sql_yozish, rpc (xom yozish), sql_oqish (xom SQL — tenant filtrini kafolatlab bo'lmaydi; admin uchun ham
 * v1 da yo'q), sxema, aktor/aktor_tanla (aktor OAuth dan), qator_tahrir/qator_qosh/qator_ochir (asl smeta const — domen
 * toollari bor), f2_import (lokal fayl yo'li), fakt_qamrov.
 */
import { z } from 'zod';
import type { Muhit } from '../../smeta-mcp/src/muhit';
import { toolChaqir, type ToolJavob, type ToolTarif } from '../../smeta-mcp/src/tool';
import { argYashir } from '../../smeta-mcp/src/maxfiy';
import { bajarilmadi, f2Holat, f2QoralamaTahrir, f2QoralamaYarat, faktYoz, narxTuzat, podvalTahrir, qoshimchaIsh, yoyilma } from '../../smeta-mcp/src/tools/ish-oqimi';
import { f2, f2Royxat, obyektHolat, obyektlar, pereraschet, qator, qatorQidir } from '../../smeta-mcp/src/tools/obyekt';
import { aktBekor, f2QoralamaYangila, f2Yarat, faktJurnal, forma3, ishOchir, nakopitelniy, normativQidir, ostatka, shartnomaMoslash, zamenaQosh } from '../../smeta-mcp/src/tools/pto';
import { snapshotFarq, snapshotOl, snapshotQaytar, snapshotRoyxat } from '../../smeta-mcp/src/tools/snapshot';
import { havolaSoni, havolalarYig, kompaniyalargaAylantir } from './doira';
import { oqishMumkin, yozishMumkin, type Vakolat } from './vakolat';

export const OQISH: ToolTarif[] = [obyektlar, obyektHolat, qator, qatorQidir, f2Royxat, f2, pereraschet, nakopitelniy, ostatka, faktJurnal, normativQidir, shartnomaMoslash, yoyilma, snapshotRoyxat, snapshotFarq];
export const YOZISH: ToolTarif[] = [faktYoz, f2QoralamaYarat, f2QoralamaTahrir, f2QoralamaYangila, f2Holat, f2Yarat, zamenaQosh, ishOchir, aktBekor, forma3, bajarilmadi, qoshimchaIsh, narxTuzat, podvalTahrir, snapshotOl, snapshotQaytar];
export const MASOFAVIY_TOOLLAR: ToolTarif[] = [...OQISH, ...YOZISH];

/** Hech qachon masofadan ochilmaydigan toollar (test bilan qo'riqlanadi). */
export const TAQIQLANGAN = ['sql_yozish', 'rpc', 'sql_oqish', 'sxema', 'aktor', 'aktor_tanla', 'qator_tahrir', 'qator_qosh', 'qator_ochir', 'f2_import'];

/** Doirasiz (id siz) chaqirilishi mumkin bo'lgan o'qish toollari — natija `mu.kompaniyaDoira` bilan filtrlanadi. */
const DOIRASIZ = new Set(['obyektlar']);

/** Javob matni chegarasi (LLM konteksti va Worker xotirasi uchun). */
export const JAVOB_MAX = 200_000;

export const tasdiqS = z.boolean().optional().describe('Haqiqiy yozish uchun MAJBURIY: true + dry_run:false. Bo\'lmasa — faqat preview (dry_run, ROLLBACK).');

const dryRunBor = (t: ToolTarif) => Object.prototype.hasOwnProperty.call(t.kirish, 'dry_run');
const tasdiqOzida = (t: ToolTarif) => Object.prototype.hasOwnProperty.call(t.kirish, 'tasdiq');

/** Masofaviy kirish sxemasi: yozuvchilarga `tasdiq` qo'shiladi. */
export function masofaviyKirish(t: ToolTarif): z.ZodRawShape {
  return t.yozadi && !tasdiqOzida(t) ? { ...t.kirish, tasdiq: tasdiqS } : t.kirish;
}

export function masofaviyTavsif(t: ToolTarif): string {
  if (!t.yozadi) return `${t.tavsif} [faqat o'qish]`;
  const qoida = dryRunBor(t)
    ? 'MASOFAVIY QOIDA: standart dry_run:true (preview + ROLLBACK, bazaga yozilmaydi). Haqiqiy yozish — dry_run:false VA tasdiq:true; avval preview ni foydalanuvchiga ko\'rsatib roziligini oling. Yozishdan oldin avtomatik snapshot, audit foydalanuvchi nomidan.'
    : 'MASOFAVIY QOIDA: preview rejimi yo\'q — faqat tasdiq:true bilan bajariladi; foydalanuvchi roziligini oling.';
  return `${t.tavsif} [YOZADI] ${qoida}`;
}

/** Yozish argumentlari: dry_run standart true; haqiqiy yozish faqat dry_run:false + tasdiq:true. */
export function yozishArgs(t: ToolTarif, a: Record<string, unknown>): { args: Record<string, unknown>; haqiqiy: boolean } | { xato: string } {
  const { tasdiq, ...qolgan } = a;
  const out: Record<string, unknown> = tasdiqOzida(t) ? { ...qolgan, tasdiq } : qolgan;
  if (!dryRunBor(t)) {
    if (tasdiq !== true) return { xato: `${t.nom}: preview rejimi yo'q — bajarish uchun tasdiq:true kerak (foydalanuvchi roziligi bilan).` };
    return { args: out, haqiqiy: true };
  }
  if (a.dry_run === false) {
    if (tasdiq !== true) return { xato: `${t.nom}: dry_run:false uchun tasdiq:true majburiy. Avval dry_run bilan preview qiling va foydalanuvchi roziligini oling.` };
    return { args: { ...out, dry_run: false }, haqiqiy: true };
  }
  return { args: { ...out, dry_run: true }, haqiqiy: false };
}

const xato = (text: string): ToolJavob => ({ content: [{ type: 'text', text }], isError: true });

export type ChaqiruvLog = (y: Record<string, unknown>) => void;

/** Masofaviy chaqiruv: sxema → doira (kompaniya) → vakolat → umumiy toolChaqir → hajm chegarasi → audit logi. */
export async function masofaviyChaqir(t: ToolTarif, mu: Muhit, v: Vakolat, xom: unknown, log: ChaqiruvLog = (y) => console.log(JSON.stringify(y))): Promise<ToolJavob> {
  const t0 = Date.now();
  const yoz = (ok: boolean, sabab: string, haqiqiy?: boolean) => log({ tur: 'mcp_remote', tool: t.nom, aktor: v.foydalanuvchiId, ok, sabab, haqiqiy_yozish: haqiqiy ?? false, args: argYashir(xom), ms: Date.now() - t0 });
  const p = z.object(masofaviyKirish(t)).strict().safeParse(xom ?? {});
  if (!p.success) { yoz(false, 'argument'); return xato(`Argument xatosi: ${p.error.issues.map((i) => `${i.path.join('.') || '(ildiz)'}: ${i.message}`).join('; ')}`); }
  let args = p.data as Record<string, unknown>;
  let haqiqiy = false;
  if (t.yozadi) {
    const y = yozishArgs(t, args);
    if ('xato' in y) { yoz(false, 'tasdiq'); return xato(y.xato); }
    args = y.args; haqiqiy = y.haqiqiy;
  }
  const h = havolalarYig(t.nom, args);
  if (havolaSoni(h) === 0 && !(DOIRASIZ.has(t.nom) && !t.yozadi)) { yoz(false, 'doira_yoq'); return xato(`${t.nom}: obyekt/akt/qator id si berilmagan — doira aniqlanmadi.`); }
  let kompaniyalar: number[] = [];
  if (havolaSoni(h) > 0) {
    let r: Awaited<ReturnType<typeof kompaniyalargaAylantir>>;
    try { r = await mu.oqish((m) => kompaniyalargaAylantir(m, h)); }
    catch { yoz(false, 'doira_xato'); return xato('Ruxsat tekshiruvini bajarib bo\'lmadi (baza). Qayta urinib ko\'ring.'); }
    if (r.topilmadi.length) { yoz(false, 'topilmadi'); return xato(`RUXSAT_YOQ — topilmadi yoki ruxsat yo'q: ${r.topilmadi.slice(0, 10).join(', ')}`); }
    kompaniyalar = [...r.kompaniyalar];
    const mumkin = t.yozadi && haqiqiy ? yozishMumkin(v, kompaniyalar) : oqishMumkin(v, kompaniyalar);
    if (!mumkin) { yoz(false, 'ruxsat'); return xato(t.yozadi && haqiqiy ? 'RUXSAT_YOQ — bu kompaniyada yozish huquqingiz yo\'q.' : 'RUXSAT_YOQ — topilmadi yoki ruxsat yo\'q.'); }
  }
  mu.kompaniyaDoira = v.kompaniyalar.map((k) => k.kompaniya_id);
  const j = await toolChaqir(t, mu, args);
  yoz(!j.isError, j.isError ? 'tool_xato' : 'ok', haqiqiy);
  const text = j.content[0]?.text ?? '';
  if (text.length > JAVOB_MAX) {
    return { ...j, content: [{ type: 'text', text: `${text.slice(0, JAVOB_MAX)}\n…[javob ${text.length} belgidan ${JAVOB_MAX} gacha qisqartirildi — limit/offset/korsat yoki filtr bilan toraytiring]` }] };
  }
  return j;
}
