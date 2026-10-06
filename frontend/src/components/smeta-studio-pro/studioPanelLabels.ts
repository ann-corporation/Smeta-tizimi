import { t } from '../../i18n/til';
import type { DocumentPanelLabels } from './SmetaDocumentPanel';

/** Runtime locale is read at render time, never frozen in module initialization. */
export function studioPanelLabels(): DocumentPanelLabels {
  return {
    title: t('Smeta qoralamasi'), search: t('Qidirish'), collapse: t('Hammasini yopish'),
    sections: t('Bo‘lim'), works: t('Ishlar'), resources: t('Resurslar'),
    empty: t('Bo‘lim yarating, keyin chapdan ishni tanlab hajmini yozing va smetaga qo‘shing.'),
    invalid: t('Smeta daraxtini ochib bo‘lmadi. Qoralamani tekshiring.'),
    select: t('Tanlash'), expand: t('Papkani ochish'), close: t('Yopish'),
    inspector: t('Tanlangan ish yoki resurs'), choose: t('— tanlang —'),
    quantity: t('Ish hajmi'), amount: t('Jami'), unknown: t('Noma’lum'), save: t('Saqlash'),
    failed: t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.'), name: t('Bo‘lim nomi'),
    price: t('Birlik narxi'), evidence: t('Narx manbasi'), basis: t('Narx turi'),
    priceBases: { CONTRACT_DRAFT: t('Shartnoma (qoralama)'), PROCUREMENT_ACTUAL: t('Haqiqiy xarid'),
      CATALOG_CANDIDATE: t('Katalog nomzodi'), OPERATOR_MANUAL: t('Qo‘lda (operator)') },
    candidates: t('Nomzodlardan tanlash'), noCandidates: t('Katalogda narx nomzodi yo‘q.'),
    source: t('Manba:'), replacement: t('Resurs almashtirish'), reason: t('Almashtirish sababini kiriting.'),
    conversion: t('Birlik koeffitsienti'), conversionEvidence: t('Birlik/asosni tasdiqlovchi hujjat va band'),
    blocked: t('Resurs turi, birlik va almashtirish dalilini tekshiring.'), restore: t('Asl resursga qaytarish'),
    move: t('Boshqa bo‘limga ko‘chirish'), basisScale: t('Norma hisob asosi'),
    basisUnit: t('Birlik'), basisEvidence: t('Asos dalili'), object: t('Smeta obyekti'),
    documentTitle: t('Smeta nomi'), currency: t('Valyuta'), newSection: t('Yangi bo‘lim nomi'),
    subsection: t('Podrazdel qo‘shish'), targetSection: t('Ish qo‘shiladigan bo‘lim'),
    knownAmount: t('ma’lum qismi'), unresolved: t('hal qilinmagan'),
  };
}
