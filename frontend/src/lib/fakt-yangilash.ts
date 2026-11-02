import type { T2Qator, T2QatorHolat } from '../api/supabase';

/**
 * Fakt saqlangandan keyin qaysi qatorlar holati o'zgaradi: tugunning o'zi,
 * ota-bobolari (yig'indilar) va avlodlari (bl faktidan RS avtomatik).
 *
 * Egasi (2026-09-23): "27000 qatorli smetada sahifada qotishlar" — har fakt
 * saqlanganda butun obyekt (~50 so'rov, ~16 MB) qayta o'qilardi. Endi faqat
 * shu to'plam o'qiladi. `chegara` dan oshsa null — chaqiruvchi to'liq holat
 * jadvalini o'qiydi (t2_daraxt emas: fakt qator tuzilmasini o'zgartirmaydi).
 */
export function faktTaalluqliIdlar(
  rows: ReadonlyArray<Pick<T2Qator, 'id' | 'ota_id'>>,
  qatorId: number,
  chegara = 500,
): number[] | null {
  const otaOf = new Map<number, number | null>();
  const bolalar = new Map<number, number[]>();
  for (const r of rows) {
    otaOf.set(r.id, r.ota_id);
    if (r.ota_id != null) {
      const b = bolalar.get(r.ota_id);
      if (b) b.push(r.id); else bolalar.set(r.ota_id, [r.id]);
    }
  }
  if (!otaOf.has(qatorId)) return null;
  const natija = new Set<number>([qatorId]);
  // Ota-bobolar (sikldan himoya: allaqachon ko'rilgan bo'lsa to'xtaydi).
  let ota = otaOf.get(qatorId) ?? null;
  while (ota != null && !natija.has(ota)) {
    natija.add(ota);
    ota = otaOf.get(ota) ?? null;
  }
  // Avlodlar.
  const navbat = [...(bolalar.get(qatorId) ?? [])];
  while (navbat.length) {
    const id = navbat.pop()!;
    if (natija.has(id)) continue;
    natija.add(id);
    if (natija.size > chegara) return null;
    navbat.push(...(bolalar.get(id) ?? []));
  }
  return natija.size > chegara ? null : [...natija];
}

/**
 * Qator tahriridan keyin qayta o'qilgan `t2_daraxt` qatorlari `id` bo'yicha joyiga qo'yiladi; tartib va
 * boshqa qatorlar o'zgarmaydi. `change_type`/`replaces_line_id` view'da yo'q — eski qatordan saqlanadi
 * (tahrir ularni o'zgartirmaydi). Yangi id (ro'yxatda yo'q) qo'shilmaydi — bu tuzilma o'zgarishi, to'liq yuklash kerak.
 */
export function qatorlarniYamala<T extends { id: number; change_type?: string | null; replaces_line_id?: number | null }>(
  eski: readonly T[], yangi: readonly T[],
): T[] {
  if (!yangi.length) return [...eski];
  const byId = new Map(yangi.map((r) => [r.id, r]));
  return eski.map((r) => {
    const y = byId.get(r.id);
    if (!y) return r;
    const chiq: T = { ...y };
    if ('change_type' in r) chiq.change_type = r.change_type;
    if ('replaces_line_id' in r) chiq.replaces_line_id = r.replaces_line_id;
    return chiq;
  });
}

/** Yangi kelgan holatlar `qator_id` bo'yicha almashtiriladi; qolganlari o'z joyida, tartib saqlanadi. */
export function holatlarniAlmashtir(eski: readonly T2QatorHolat[], yangi: readonly T2QatorHolat[]): T2QatorHolat[] {
  if (!yangi.length) return [...eski];
  const byId = new Map(yangi.map((h) => [h.qator_id, h]));
  const chiq = eski.map((h) => byId.get(h.qator_id) ?? h);
  const bor = new Set(eski.map((h) => h.qator_id));
  for (const h of yangi) if (!bor.has(h.qator_id)) chiq.push(h);
  return chiq;
}
