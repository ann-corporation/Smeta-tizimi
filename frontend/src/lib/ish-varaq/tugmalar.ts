/**
 * Ish varag'i klaviatura yordami ro'yxati («?» oynasi): barcha tugmalar, katakdagi yozuv sintaksisi bilan. Statik (yagona manba shu fayl):
 * `useHotkeys` ro'yxati faqat modul tugmalarini ko'rsatadi, katak ichidagi tugmalar (Enter/Tab/Esc) u yerda yo'q.
 */
export const VARAQ_TUGMALAR: ReadonlyArray<{ guruh: string; qatorlar: ReadonlyArray<{ tugma: string; nom: string }> }> = [
  { guruh: 'Navigatsiya', qatorlar: [
    { tugma: '↑ ↓', nom: 'Qatordan qatorga' },
    { tugma: '← →', nom: 'Bo‘lim/ishni yig‘ish va ochish; ota qatorga' },
    { tugma: 'Home / End', nom: 'Birinchi / oxirgi qator' },
    { tugma: '/', nom: 'Qidirish (shifr yoki nom)' },
  ] },
  { guruh: 'Kiritish', qatorlar: [
    { tugma: 'Enter / F2', nom: 'Katakni tahrirlash' },
    { tugma: '0–9', nom: 'Yozishni boshlash (katak almashadi)' },
    { tugma: 'Enter', nom: 'Saqlamay keyingi qatorga (xuddi shu ustun)' },
    { tugma: 'Tab / Shift+Tab', nom: 'Keyingi / oldingi katak' },
    { tugma: 'Esc', nom: 'Katak tahririni bekor qilish; tahrirdan tashqarida — barcha saqlanmaganni bekor qilish' },
    { tugma: 'Delete', nom: 'Qatorning saqlanmagan qiymatini o‘chirish' },
    { tugma: '*', nom: 'Fakt: ochiq qoldiqni to‘liq yozish (F2 rejimida yo‘q)' },
    { tugma: 'Ctrl+Z', nom: 'Fakt: ommaviy kiritmani orqaga' },
    { tugma: 'Ctrl+V', nom: 'Excel ustunini katakdan pastga joylash' },
  ] },
  { guruh: 'Katak yozuvi (Fakt)', qatorlar: [
    { tugma: '+5', nom: 'Bugun 5 bajarildi (qo‘shiladi)' },
    { tugma: '=40', nom: 'Jami fakt 40' },
    { tugma: '50%', nom: 'Smeta hajmining 50 foizi (jami)' },
  ] },
  { guruh: 'Katak yozuvi (F2)', qatorlar: [
    { tugma: '12,5', nom: 'Joriy oy F2 qoralamasidagi hajm; bo‘sh qoldirilsa — qoralamadan olib tashlanadi' },
  ] },
  { guruh: 'Rejim va filtr', qatorlar: [
    { tugma: 'F3', nom: 'Rejim: Fakt ↔ F2 (F2 — faqat qoralama, tasdiqlamaydi)' },
    { tugma: 'Alt+1', nom: 'Filtr: hammasi' },
    { tugma: 'Alt+2', nom: 'Filtr: qoldig‘i bor' },
    { tugma: 'Alt+3', nom: 'Filtr: smetadan oshgan' },
    { tugma: 'Alt+4', nom: 'Filtr: narxsiz' },
  ] },
  { guruh: 'Saqlash', qatorlar: [
    { tugma: 'Ctrl+S / Ctrl+Enter', nom: 'Joriy rejimning saqlanmagan o‘zgarishini saqlash (bitta so‘rov)' },
  ] },
  { guruh: 'Yordam', qatorlar: [
    { tugma: '?', nom: 'Shu ro‘yxatni ochish / yopish' },
  ] },
];
