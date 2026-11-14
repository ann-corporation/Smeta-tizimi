/**
 * AMAL REESTRI (ekotizim V2 §2): yagona amal = capability + (keyinroq) RPC. Universal qidiruv (Ctrl+K) va Jarvis shu ro'yxatdan
 * «amal»larni topadi; natija — amal bajariladigan sahifaga o'tish (`yol`), keyingi qadamda to'g'ridan-to'g'ri bajarish.
 * Yangi amal = shu yerga bitta yozuv (+ RPC migratsiyasi bo'lsa `rpc`).
 */
import type { IlovaKod } from '../ilova/ilovalar';

export type AmalTuri = 'oqish' | 'yozish';

export type Amal = {
  kalit: string;
  turi: AmalTuri;
  /** Server RPC nomi. Hozircha ixtiyoriy: amal sahifa orqali bajariladi, RPC xaritasi 3-qadamda (server) to'ldiriladi. */
  rpc?: string;
  capability: string;
  ilova: IlovaKod;
  /** Amal tegishli sahifa kaliti (Sahifa.kalit). */
  sahifa?: string;
  /** Qidiruvda ko'rinadigan nom va sinonimlar (uz/ru). */
  nom?: string;
  sinonimlar?: readonly string[];
  /** Amal bajariladigan yo'l (odatda `Sahifa.yol`). */
  yol?: string;
  /** AI (Jarvis) uchun tavsif; yozuvchi amalda dryRun majburiy (qo'riqchi test). */
  ai?: { tavsif: string; kirish: string; xavf: 'past' | 'orta' | 'yuqori'; dryRun: boolean };
  /** Token narxi (har ish pul ishlaydi qoidasi). */
  tokenNarx?: number;
  mindmapAmal?: string;
};

export const AMALLAR: readonly Amal[] = [
  { kalit: 'obyekt.yangi', turi: 'yozish', capability: 'smeta.write', ilova: 'pto', sahifa: 'obyektlar', yol: '/admin/obyektlar', nom: 'Yangi obyekt', sinonimlar: ['yangi obyekt', 'obyekt qo‘shish', 'smeta yuklash', 'новый объект', 'загрузить смету'] },
  { kalit: 'smeta.narxlash', turi: 'yozish', capability: 'narx.write', ilova: 'pto', sahifa: 'smeta-narxlash', yol: '/admin/smeta-narxlash', nom: 'Smetani narxlash', sinonimlar: ['narxlash', 'narx qo‘yish', 'расценить смету'] },
  { kalit: 'fakt.kiritish', turi: 'yozish', capability: 'fakt.write', ilova: 'ff', sahifa: 'fakt', yol: '/admin/fakt', nom: 'Fakt kiritish', sinonimlar: ['fakt yozish', 'bajarilgan ish', 'факт', 'выполнено'] },
  { kalit: 'f2.tayyorlash', turi: 'yozish', capability: 'f2.prepare', ilova: 'ff', sahifa: 'f2-tayyorlash', yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', sinonimlar: ['f2 yaratish', 'yangi f2', 'подготовить ф2'] },
  { kalit: 'f2.import', turi: 'yozish', capability: 'f2.import', ilova: 'ff', sahifa: 'f2', yol: '/admin/f2', nom: 'F2 faylini yuklash (Excel)', sinonimlar: ['f2 import', 'f2 yuklash', 'импорт ф2'] },
  { kalit: 'f3.nakopitelniy', turi: 'oqish', capability: 'f2.read', ilova: 'ff', sahifa: 'nakopitelniy', yol: '/admin/nakopitelniy', nom: 'Forma 3 va nakopitelniy', sinonimlar: ['forma 3', 'f3', 'nakopitelniy', 'накопительная', 'счет-фактура'] },
  { kalit: 'moliya.tolov', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'moliya', yol: '/admin/moliya', nom: 'To‘lov yoki xarajat kiritish', sinonimlar: ['tolov kiritish', 'xarajat kiritish', 'оплата', 'расход'] },
  { kalit: 'shartnoma.qosh', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'shartnoma-liniya', yol: '/admin/shartnoma-liniya', nom: 'Shartnoma qo‘shish', sinonimlar: ['yangi shartnoma', 'договор', 'новый договор'] },
  { kalit: 'zayavka.yaratish', turi: 'yozish', capability: 'warehouse.write', ilova: 'xarid', sahifa: 'zayavka', yol: '/admin/zayavka', nom: 'Zayavka yaratish', sinonimlar: ['yangi zayavka', 'material so‘rash', 'заявка'] },
  { kalit: 'aosr.yaratish', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'aosr', yol: '/admin/aosr', nom: 'AOSR (yashirin ish akti) tayyorlash', sinonimlar: ['aosr', 'yashirin ish akti', 'акт скрытых работ'] },
  { kalit: 'hujjat.yuklash', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'documents', yol: '/admin/documents', nom: 'Hujjat yuklash', sinonimlar: ['fayl yuklash', 'hujjat qo‘shish', 'загрузить документ'] },
  { kalit: 'azo.taklif', turi: 'yozish', capability: 'company.member.manage', ilova: 'yadro', sahifa: 'kompaniya', yol: '/admin/kompaniya', nom: 'A‘zo taklif qilish', sinonimlar: ['xodim qo‘shish', 'yangi a‘zo', 'пригласить сотрудника'] },
  { kalit: 'ruxsat.korish', turi: 'oqish', capability: 'control.company.read', ilova: 'yadro', sahifa: 'ruxsatlar-jadvali', yol: '/admin/ruxsatlar-jadvali', nom: 'Kim nimani ko‘radi (ruxsatlar jadvali)', sinonimlar: ['ruxsatlar', 'rollar jadvali', 'права доступа'] },
];