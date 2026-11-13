/**
 * Markdown jadvallarini (GFM `| a | b |` + `|---|---|`) oddiy matndan ajratadi: react-markdown'da remark-gfm yo'q (paket qo'shilmagan),
 * shuning uchun jadval bo'laklari alohida chiziladi, qolgan matn — odatdagi markdown. Kod to'siqlari (```) ichidagi jadval tegilmaydi.
 */
export type Tekis = 'l' | 'r' | 'c';
export type MdBolak = { tur: 'md'; matn: string } | { tur: 'jadval'; bosh: string[]; qatorlar: string[][]; tekis: Tekis[] };

const AJRATUVCHI = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function kataklar(qator: string): string[] {
  const s = qator.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = []; let joriy = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { joriy += '|'; i++; } else if (s[i] === '|') { out.push(joriy.trim()); joriy = ''; } else joriy += s[i];
  }
  out.push(joriy.trim());
  return out;
}

export function mdBolaklar(matn: string): MdBolak[] {
  const q = matn.split('\n');
  const natija: MdBolak[] = []; let oddiy: string[] = []; let kod = false;
  const oddiyYop = () => { if (oddiy.length) { natija.push({ tur: 'md', matn: oddiy.join('\n') }); oddiy = []; } };
  for (let i = 0; i < q.length; i++) {
    const s = q[i];
    if (/^\s*```/.test(s)) { kod = !kod; oddiy.push(s); continue; }
    if (!kod && s.includes('|') && i + 1 < q.length && AJRATUVCHI.test(q[i + 1]) && q[i + 1].includes('-')) {
      const bosh = kataklar(s); const ajr = kataklar(q[i + 1]);
      if (bosh.length >= 2 && ajr.length === bosh.length) {
        oddiyYop();
        const tekis: Tekis[] = ajr.map((a) => (a.startsWith(':') && a.endsWith(':') ? 'c' : a.endsWith(':') ? 'r' : 'l'));
        const qatorlar: string[][] = []; let j = i + 2;
        while (j < q.length && q[j].includes('|') && q[j].trim()) { const k = kataklar(q[j]); while (k.length < bosh.length) k.push(''); qatorlar.push(k.slice(0, bosh.length)); j++; }
        natija.push({ tur: 'jadval', bosh, qatorlar, tekis });
        i = j - 1; continue;
      }
    }
    oddiy.push(s);
  }
  oddiyYop();
  return natija;
}
