/**
 * Bosqichma-bosqich vaqt o'lchovi (unumdorlik, 2026-10-24): prod da «F2 qoralamani ochish» 36 s — qaysi bosqich
 * ekanini taxmin bilan emas, o'lchov bilan bilish uchun. Natija brauzer konsoliga bitta qator bo'lib yoziladi
 * (`[F2 ochish] {...}`), foydalanuvchi ekraniga chiqmaydi. Ma'lumot (smeta qatorlari, summalar) yozilmaydi — faqat ms.
 */
export interface Olchov {
  qadam<T>(kalit: string, p: Promise<T>): Promise<T>;
  belgi(kalit: string): void;
  yoz(): Record<string, number>;
}

export function olchov(nom: string): Olchov {
  const t0 = performance.now();
  const b: Record<string, number> = {};
  return {
    qadam(kalit, p) {
      const s = performance.now();
      return p.finally(() => { b[kalit] = Math.round(performance.now() - s); });
    },
    belgi(kalit) { b[kalit] = Math.round(performance.now() - t0); },
    yoz() {
      b.jami = Math.round(performance.now() - t0);
      // eslint-disable-next-line no-console
      console.info(`[${nom}]`, JSON.stringify(b));
      return b;
    },
  };
}
