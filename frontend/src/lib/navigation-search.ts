/** Faqat oldindan ruxsat bo‘yicha filtrlangan menyuni qidiradi. */
export function searchNavigation<T extends { nom: string; menyular: { nom: string; yol: string }[] }>(groups: T[], query: string): T[] {
  const norm = (s: string) => s.toLocaleLowerCase().replace(/[‘’ʻʼ`']/g, '').trim();
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return groups;
  return groups.map(g => ({ ...g, menyular: g.menyular.filter(m => terms.every(t => norm(`${g.nom} ${m.nom} ${m.yol}`).includes(t))) }))
    .filter(g => g.menyular.length > 0);
}
