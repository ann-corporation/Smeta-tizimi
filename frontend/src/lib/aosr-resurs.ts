/**
 * Resurs (material/uskuna) kategoriyasi belgisi. Bazadagi `t2_aosr_coverage.kat` — resurs kategoriyasi KIRILLCHA («МАТ», «ОБ»),
 * eski testlarda esa lotincha ('mat', 'ob'). Ikkalasi ham resurs: ikkalasini tanish shart, aks holda real obyektda
 * АОСР materiallari, hajm hisobi va laboratoriya ilovasi jim bo'sh qoladi (Stella 152 sinovida topildi).
 */
export const resursKatmi = (kat: string | null | undefined): boolean => {
  const k = String(kat ?? '').trim().toLowerCase();
  return k === 'mat' || k === 'ob' || k === 'мат' || k === 'об';
};
/**
 * `t2_aosr_coverage.kat` — resurs KATEGORIYASI: kategoriyasiz material (masalan «БЕТОН ТЯЖЕЛЫЙ») uchun NULL bo'ladi va ish bilan
 * adashadi. Smeta daraxtidagi `tur` (mat/ob) ishonchli: shu bo'yicha kat to'ldiriladi (asl qator o'zgarmaydi — nusxa).
 */
export function coverageTurBilan<T extends { qator_id: number; kat: string | null }>(coverage: readonly T[], meta: readonly { id: number; tur: string | null }[]): T[] {
  if (!meta.length) return coverage as T[];
  const tur = new Map(meta.map((m) => [m.id, String(m.tur ?? '').toLowerCase()] as const));
  return coverage.map((c) => {
    const t = tur.get(c.qator_id);
    return (t === 'mat' || t === 'ob') && !resursKatmi(c.kat) ? { ...c, kat: t } : c;
  });
}