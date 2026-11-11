/**
 * Buyurtmachi (debitor) qarzi — `t2_qarz_svod_v1` javobidan (faqat o'qish). Hisob SQL'da: qarz = F3(sotuv, QQS bilan) - to'lov.
 * Qoida: NULL != 0 (noma'lum jamiga kirmaydi, soni alohida); F2 (ustamasiz) ayirilmaydi, yonida ko'rsatiladi.
 */
export type DebitorQator = {
  shartnoma_id: number; raqam: string | null; nom: string | null; yonalish: 'debitor' | 'kreditor';
  kontragent: string | null; shartnoma_summa: number | null; f3_sotuv: number | null; tolangan: number | null;
  f2_nakrutkasiz: number | null; qarz: number | null; oxirgi_tolov_sana: string | null;
  obyektlar: Array<{ id: number; nom: string }>;
};
export type DebitorOgoh = 'f3_yoq' | 'avans' | 'tolov_yoq';
export type DebitorJami = { shartnoma: number | null; f2: number | null; f3: number | null; tolangan: number | null; qarz: number | null; qarzNomalum: number; soni: number };

const son = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);

export function debitorQatorlar(q: ReadonlyArray<DebitorQator>): DebitorQator[] {
  return q.filter((x) => x.yonalish === 'debitor');
}

/** Ustun jami: hammasi noma'lum bo'lsa null (0 emas), aks holda noma'lumlarsiz yig'indi. */
function jamla(v: ReadonlyArray<number | null>): number | null {
  const bor = v.filter((x): x is number => x != null);
  return bor.length === 0 ? null : bor.reduce((a, b) => a + b, 0);
}

export function debitorJami(q: ReadonlyArray<DebitorQator>): DebitorJami {
  return {
    shartnoma: jamla(q.map((x) => son(x.shartnoma_summa))), f2: jamla(q.map((x) => son(x.f2_nakrutkasiz))),
    f3: jamla(q.map((x) => son(x.f3_sotuv))), tolangan: jamla(q.map((x) => son(x.tolangan))),
    qarz: jamla(q.map((x) => son(x.qarz))), qarzNomalum: q.filter((x) => son(x.qarz) == null).length, soni: q.length,
  };
}

/** Pudratchi uchun muhim signallar: F2 tasdiqlangan, lekin F3 (hisob-faktura) chiqarilmagan; avans; hali to'lov yo'q. */
export function debitorOgoh(x: DebitorQator): DebitorOgoh[] {
  const o: DebitorOgoh[] = [];
  const f2 = son(x.f2_nakrutkasiz); const f3 = son(x.f3_sotuv);
  if (f2 != null && f2 > 0 && (f3 == null || f3 === 0)) o.push('f3_yoq');
  const qarz = son(x.qarz);
  if (qarz != null && qarz < -0.5) o.push('avans');
  if (f3 != null && f3 > 0 && (son(x.tolangan) ?? 0) === 0) o.push('tolov_yoq');
  return o;
}