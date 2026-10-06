import type { AiUmumiy } from '../../api/t2-ai';

const normalize = (s: string) => s.toLocaleLowerCase('uz-UZ').replace(/[‘’ʻʼ'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

/** Faqat ushbu read-only endpointning real imkoniyatlari; yozuv bajarilgan deb aytilmaydi. */
export function jarvisHelp(text: string): string | null {
  const s = normalize(text);
  if (!/^(nima(?:lar)? qila olasan|nima(?:lar)? qila olasiz|imkoniyatlaring|yordam|help|what can you do|что ты умеешь)$/.test(s)) return null;
  return 'Hozir tanlangan kompaniyadagi obyektlarning smeta, fakt va F2 jamlarini ko‘rsataman, narxi yetishmayotgan qatorlar haqida ogohlantiraman.\n\nMasalan: «Amfiteatrda holat qanday?» yoki «Fast Food 1-etaj F2 jami qancha?»\n\nHozirgi Jarvis faqat o‘qiydi: smeta tuzmaydi, narx almashtirmaydi, hujjatni tasdiqlamaydi. Davrlar va alohida qatorlar tafsiloti bu umumiy ma’lumotda bo‘lmasa, uni taxmin qilmayman.';
}

export function jarvisMoney(n: number | null): string {
  return n == null || !Number.isFinite(n) ? 'noma’lum' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' so‘m';
}

/** Faqat yagona aniq nomga tegishli oddiy holat/jami savoli; fuzzy identity YO'Q. */
export function jarvisEvidenceAnswer(text: string, data: AiUmumiy): string | null {
  const s = normalize(text);
  const matches = data.obyektlar.filter(o => {
    const name = normalize(o.nom);
    return !!name && ((` ${s} `).includes(` ${name} `) || (` ${s} `).includes(` ${name}da `));
  });
  if (matches.length !== 1) return null;
  // Davr, taqqoslash, qatorlar va hisoblash talabini aggregate javob bilan almashtirmaymiz.
  if (/\b(oy|davr|iyul|avgust|sentabr|qator|resurs|farq|foiz|qoldiq|ostatka|mumkin|joriy|oldingi|bekor|qancha bajarildi|qachon)\b/.test(s) || /\b20\d{2}\b/.test(s)) return null;
  const o = matches[0];
  const warn = !o.toliq ? `\nSmeta to‘liq emas: ${o.narxsiz} qatorda narx yo‘q. Bu tasdiqlangan F2 summasini almashtirmaydi.` : '';
  if (/\bf2\b|\bф2\b/.test(s) && /\b(jami|qancha|summa)\b/.test(s)) return `${o.nom}: tizimdagi F2 jami **${jarvisMoney(o.f2)}**. Davrlar kesimi bu umumiy ma’lumotda berilmagan.${warn}`;
  if (/\b(holat|ahvol)\b/.test(s)) return `**${o.nom}**\n\n- Smeta: ${jarvisMoney(o.smeta)}\n- Fakt: ${jarvisMoney(o.fakt)}\n- F2: ${jarvisMoney(o.f2)}${warn}`;
  return null;
}
