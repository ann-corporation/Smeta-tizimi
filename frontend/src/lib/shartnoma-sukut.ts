/** «Yangi shartnoma» sukut qiymatlari (sof): keyingi shartnoma raqami = mavjud (bekor qilinmagan) raqamlardagi eng katta son + 1. */
export function keyingiShartnomaRaqam(shartnomalar: ReadonlyArray<{ raqam?: string | null; holat?: string | null }>): string {
  let eng = 0;
  for (const s of shartnomalar) {
    if (s.holat === 'bekor') continue;
    const m = /(\d+)\s*$/.exec(String(s.raqam ?? '').trim());
    if (m) eng = Math.max(eng, Number(m[1]));
  }
  return String(eng + 1);
}
