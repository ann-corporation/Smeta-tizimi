/**
 * daraxt-tartibi.ts — smeta qatorlarini DARAXT tartibiga keltirish.
 *
 * Egasi 2026-09-29 (Karting): F2 importda yaratilgan qo'shimcha / zamena qatorlari
 * daraxtda to'g'ri joyda (ota — «ПОЛЫ ИЗ БЕТОН»), lekin `tartib` raqami butun smeta
 * oxiriga berilgan. Qatorni ketma-ket (tartib bo'yicha) o'qiydigan hujjatlar (F3,
 * Rasmiy Ф2, Nakopitelniy, Slichitelniy) ularni OXIRGI razdelga yozib yuborardi
 * (Karting: ПОЛЫ 106,4 mln + «НБШ» 17,2 mln o'rniga ПОЛЫ 123,6 mln).
 *
 * Qoida: har tugun o'z otasi ostida (ichki tartib — `tartib`, teng bo'lsa id), zamena qatori
 * almashtirgan qatoridan KEYIN (xuddi shu ota ostida bo'lsa), qo'shimcha — foydalanuvchi
 * tanlagan langardan keyin (server joylashi). Ota topilmagan / sikl — asl tartibda oxirida (yo'qolmaydi).
 */
export function daraxtTartibida<T extends { qator_id: number; ota_id?: number | null; tartib?: number | null }>(
  rows: readonly T[],
  almashtiradi?: ReadonlyMap<number, number>,
): T[] {
  if (!rows.some((r) => r.ota_id != null)) return [...rows];
  const idx = new Map(rows.map((r, i) => [r.qator_id, i]));
  const bolalar = new Map<number | null, T[]>();
  for (const r of rows) {
    const ota = r.ota_id != null && idx.has(r.ota_id) ? r.ota_id : null;
    const l = bolalar.get(ota);
    if (l) l.push(r); else bolalar.set(ota, [r]);
  }
  // Aka-ukalar: tartib, teng bo'lsa id (server joylash qoidasi: yangi qator langardan keyin).
  if (rows.some((r) => r.tartib != null)) {
    for (const l of bolalar.values()) l.sort((x, y) => (x.tartib ?? idx.get(x.qator_id)!) - (y.tartib ?? idx.get(y.qator_id)!) || x.qator_id - y.qator_id);
  }
  const out: T[] = [];
  const korildi = new Set<number>();
  const tartibla = (list: T[]): T[] => {
    if (!almashtiradi?.size) return list;
    const ichida = new Set(list.map((x) => x.qator_id));
    const zam = list.filter((x) => { const eski = almashtiradi.get(x.qator_id); return eski != null && ichida.has(eski) && eski !== x.qator_id; });
    if (!zam.length) return list;
    const zamSet = new Set(zam.map((x) => x.qator_id));
    const natija: T[] = [];
    const joyla = (x: T) => {
      natija.push(x);
      for (const z of zam) if (almashtiradi.get(z.qator_id) === x.qator_id && !natija.includes(z)) joyla(z);
    };
    for (const x of list) if (!zamSet.has(x.qator_id)) joyla(x);
    for (const z of zam) if (!natija.includes(z)) natija.push(z);
    return natija;
  };
  const yur = (ota: number | null) => {
    for (const r of tartibla(bolalar.get(ota) ?? [])) {
      if (korildi.has(r.qator_id)) continue;
      korildi.add(r.qator_id);
      out.push(r);
      yur(r.qator_id);
    }
  };
  yur(null);
  for (const r of rows) if (!korildi.has(r.qator_id)) out.push(r);
  return out;
}
