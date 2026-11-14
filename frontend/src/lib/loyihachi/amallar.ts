/**
 * LOYIHACHI amallari — «AI birinchi» (owner qoidasi): har sahifa va amal Jarvis (AI yordamchi) reyestriga shu ro'yxatdan kiradi.
 * Shakl `lib/reestr/amal.ts` (`Amal`) bilan bir xil; reestr main ga tushganda bu massiv to'g'ridan-to'g'ri AMALLAR ga qo'shiladi.
 * Yozuvchi amal AI dan faqat TAKLIF (dryRun) bo'lib o'tadi — foydalanuvchi «Bajarish» ni bosadi; pul ta'siri yo'q (taklifda narx yo'q).
 * Hozir AI buyruq satrida ishlaydigani — `chizma` o'qish vositasi (lib/ai-yordamchi/buyruq-vositalar.ts); qolganlari sahifa havolasi bilan.
 */
export type LoyihaAmal = {
  kalit: string; turi: 'oqish' | 'yozish'; rpc: string; capability: string; ilova: 'hujjat'; sahifa: string;
  ai: { tavsif: string; kirish: string; xavf: 'past' | 'orta' | 'yuqori'; dryRun: boolean };
};

const A = (kalit: string, turi: 'oqish' | 'yozish', rpc: string, capability: string, tavsif: string, kirish: string, xavf: 'past' | 'orta' | 'yuqori' = 'past'): LoyihaAmal =>
  ({ kalit, turi, rpc, capability, ilova: 'hujjat', sahifa: 'chizmalar', ai: { tavsif, kirish, xavf, dryRun: turi === 'yozish' } });

export const LOYIHACHI_AMALLAR: readonly LoyihaAmal[] = [
  A('chizma.royxat', 'oqish', 't2_chizma_royxat_v1', 'design.read', 'Obyekt bo‘yicha chizmalar, joriy revizya va qaror holati', 'obyekt_id?'),
  A('chizma.bugun', 'oqish', 't2_loyihachi_bugun_v1', 'design.read', 'Bugungi ishlar: qoralama revizya, savol, remark, taklif sanoqlari', '—'),
  A('chizma.taasir', 'oqish', 't2_chizma_taasir_v1', 'design.read', 'Qaysi smeta qatori / АОСР eskirgan chizmaga tayangan', 'obyekt_id?'),
  A('chizma.taklif_royxat', 'oqish', 't2_chizma_taklif_royxat_v1', 'design.read', 'Revizyadagi smeta o‘zgarish takliflari', 'revizya_id'),
  A('chizma.toplam_saqla', 'yozish', 't2_chizma_toplam_saqla_v1', 'design.write', 'Yangi chizma varag‘ini ochish', 'aloqa_id, obyekt_id, bosqich, marka, varaq', 'past'),
  A('chizma.revizya_yarat', 'yozish', 't2_chizma_revizya_yarat_v1', 'design.write', 'Chizmaga yangi revizya qoralamasi', 'toplam_id, fayl, ozgarish_izohi', 'past'),
  A('chizma.taklif_yoz', 'yozish', 't2_chizma_taklif_yoz_v1', 'design.write', 'Loyiha o‘zgarishidan smeta taklifi (qo‘shimcha/zamena/hajm/olib tashlash), narxsiz', 'revizya_id, tur, nom, hajm?', 'past'),
  A('chizma.chiqar', 'yozish', 't2_chizma_chiqar_v1', 'design.issue', 'Revizyani ishga chiqarish: pudratchi va texnadzorga taqdim + xabar', 'revizya_id, aloqa_idlar', 'orta'),
  A('chizma.bekor', 'yozish', 't2_chizma_bekor_v1', 'design.issue', 'Revizyani bekor qilish (sabab bilan)', 'revizya_id, sabab', 'orta'),
  A('chizma.qaror', 'yozish', 't2_chizma_qaror_v1', 'document.write', 'Qabul qiluvchi: revizyani qabul qilish / tuzatish so‘rash / rad etish', 'taqdim_id, qaror, izoh', 'orta'),
  A('chizma.boglash', 'yozish', 't2_chizma_boglash_v1', 'document.write', 'Smeta qatori yoki АОСР ni chizma revizyasiga bog‘lash', 'toplam_id, revizya, obyekt_id, qator_id|aosr_id', 'past'),
  A('chizma.taklif_pto', 'yozish', 't2_chizma_taklif_pto_v1', 'document.write', 'PTO: loyihachi taklifini smeta o‘zgarishi qoralamasiga aylantirish yoki rad etish', 'taklif_id, qaror, obyekt_id, qator_id?', 'orta'),
];
