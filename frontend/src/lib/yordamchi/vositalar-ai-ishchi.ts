/**
 * AI ISHCHILAR vositalari (fon AI ishchilari, migratsiya 20261218500000): Jarvis ularni sahifa bilan ochadi — «kunlik xulosani ko'rsat»,
 * «hujjatni tekshir». Hech narsa yozilmaydi: ishchini yoqish va «Hozir ishga tushir» — sahifada, qo'lda (boss); natija inbox'da.
 * Alohida fayl: vositalar-reestr.ts dagi barchaVositalar() shu ro'yxatni qo'shadi (bitta import).
 */
import type { YordamchiVosita } from './vositalar-reestr';

export const AI_ISHCHI_VOSITALARI: readonly YordamchiVosita[] = [
  { id: 'oqish.ai_kunlik_xulosa', tur: 'navigatsiya', nom: 'Kunlik xulosa (AI nazoratchi): fakt kiritilmagan obyektlar, javob kutayotgan hujjatlar, muddati o‘tayotgan ishlar — AI ishchilar inbox‘ini ochadi', misol: ['kunlik xulosani ko‘rsat', 'bugun nima kutyapti', 'сводка за день', 'daily summary'], tasdiq: 'yoq', manba: '/admin/ai-agentlar -> t2_ai_ol_v1(inbox) — ishchini yoqish va ishga tushirish sahifada, qo‘lda' },
  { id: 'qoralama.ai_hujjat_tekshir', tur: 'navigatsiya', nom: 'F2 qoralamasini yuborishdan oldin tekshirish (AI hujjat tekshiruvchi): narxsiz, hajmi oshgan, asosi yo‘q qatorlar — bloklamaydi; AI ishchilar sahifasini ochadi', misol: ['hujjatni tekshir', 'F2 ni tekshirib ber', 'проверь документ', 'check the document'], tasdiq: 'yoq', manba: '/admin/ai-agentlar -> «Hujjat tekshiruvchi» -> t2_ai_ish_navbat_v1 (faqat o‘qiydi, hujjatni o‘zgartirmaydi)' },
];