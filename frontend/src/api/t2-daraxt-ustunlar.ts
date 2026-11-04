/** Daraxt yo'li (useT2Daraxt) so'raydigan ustunlar — P7. Alohida faylda: testlar
 *  `api/supabase` ni mock qilganda ham konstantalar mavjud bo'lsin. */
/** P7 (katta obyekt tezligi): LRV/Fakt daraxti, LRV_PLUS/Forma-2, Ostatka va
 *  resurs vedomosti ishlatadigan ustunlargina. Iste'molchilar grep bilan
 *  tekshirilgan (sbT2TreeQur, lrvPlusFaylBaytlari, resursVedomostAoa,
 *  ostatkaHujjatModeli, FaktNative). Olib tashlangan: id, obyekt_id, f2_narx,
 *  fakt_narx, f2_narx_farq_foiz — daraxt yo'lida o'qilmaydi. */
export const T2_HOLAT_DARAXT_USTUNLARI = 'qator_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,qoldiq_hajm,qoldiq_summa,f2_mumkin_hajm,f2_mumkin_summa';

/** Fakt F2 narxida baholanganda F2 summasi NOMA'LUM qatorlarni ajratish uchun (migratsiya 20261117400000 dan KEYIN mavjud).
 *  Paket (ombor/paket.ts) bu ustunni SQL kengaytmasigacha ixtiyoriy qabul qiladi; asosiy ustunlar kontrakti saqlanadi. */
export const T2_HOLAT_F2_YOQ_USTUN = 'f2_summa_yoq';
export const T2_HOLAT_DARAXT_USTUNLARI_YOQ = `${T2_HOLAT_DARAXT_USTUNLARI},${T2_HOLAT_F2_YOQ_USTUN}`;

/** Daraxt yo'li uchun t2_daraxt ustunlari. Olib tashlangan: kompaniya_id, d1–d3,
 *  yangilandi, manba_id, raqam — daraxt/eksport/ostatka/fakt ularni o'qimaydi. */
export const T2_DARAXT_USTUNLARI = 'id,obyekt_id,obyekt,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,narx_usul,qoshimcha,zamena,xom_qator,versiya,norma';
