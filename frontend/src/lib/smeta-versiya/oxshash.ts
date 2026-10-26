/**
 * Matn o'xshashligi (Ratcliff–Obershelp, Python `difflib.SequenceMatcher.ratio()` bilan bir xil g'oya, autojunk'siz):
 * 2·M / (|a| + |b|), M — rekursiv eng uzun umumiy bo'laklar yig'indisi. Sun'iy ko'l qo'lda solishtiruvi (compare.py)
 * chegaralari (0,6 / 0,5 / 0,9) shu o'lchovga moslangan.
 */
function engUzun(a: string, b: string, alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
  let bi = alo, bj = blo, bk = 0;
  let oldin = new Int32Array(bhi - blo + 1);
  for (let i = alo; i < ahi; i++) {
    const hozir = new Int32Array(bhi - blo + 1);
    for (let j = blo; j < bhi; j++) {
      if (a.charCodeAt(i) !== b.charCodeAt(j)) continue;
      const k = oldin[j - blo] + 1;
      hozir[j - blo + 1] = k;
      if (k > bk) { bi = i - k + 1; bj = j - k + 1; bk = k; }
    }
    oldin = hozir;
  }
  return [bi, bj, bk];
}

function mosBolaklar(a: string, b: string): number {
  let jami = 0;
  const navbat: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  while (navbat.length) {
    const [alo, ahi, blo, bhi] = navbat.pop()!;
    if (alo >= ahi || blo >= bhi) continue;
    const [i, j, k] = engUzun(a, b, alo, ahi, blo, bhi);
    if (!k) continue;
    jami += k;
    navbat.push([alo, i, blo, j], [i + k, ahi, j + k, bhi]);
  }
  return jami;
}

/** 0..1. Ikkalasi bo'sh — 1. */
export function oxshashlik(a: string, b: string): number {
  const t = a.length + b.length;
  if (!t) return 1;
  if (a === b) return 1;
  return (2 * mosBolaklar(a, b)) / t;
}

/** Tez yuqori chegara: uzunliklar nisbati bo'yicha ratio bundan oshmaydi (keraksiz hisobni kesish uchun). */
export function oxshashlikChegarasi(a: string, b: string): number {
  const t = a.length + b.length;
  return t ? (2 * Math.min(a.length, b.length)) / t : 1;
}
