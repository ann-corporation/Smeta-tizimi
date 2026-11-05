/**
 * ISH KARTASI — «avto-yig'ish» (egasi 2026-11-05): tanlangan asosiy ish (bl) dan keyin shu bo'limda kelgan va elementga
 * tegishli qo'shni qatorlarni TAKLIF qiladi; foydalanuvchi tasdiqlaydi. Har biriga koeffitsient smetaning o'z nisbatidan:
 * k = kAsos × hajm / hajmAsos (ishora saqlanadi — istisno qatori manfiy).
 *
 * Qoida (deterministik, taxmin yo'q): asosiy qatordan keyin ketma-ket kelgan
 *   - armatura materiali (tur mat, nomi АРМАТУР / КАРКАС / СЕТК) → armatura_mat;
 *   - armatura tayyorlash ishi (shifr Е6-2-11 yoki «ИЗГОТОВЛЕНИЕ … АРМАТУР») → armatura_tayyorlash, bosqich armatura;
 *   - istisno / tuzatish qatori (smeta-anatomiya `tuzatishQatorimi`, «ИСКЛЮЧ…», shifr Е6-1-97, yoki hajm < 0) → istisno;
 *   - zakladnoy (shifr Е6-1-15, «ЗАКЛАДН») → zakladnoy (ixtiyoriy, sukut tanlanmagan);
 * qatorlar olinadi; boshqa birinchi ish yoki boshqa material uchrasa — yig'ish to'xtaydi.
 */
import { tuzatishQatorimi } from '../smeta-anatomiya/tuzatish';
import { nisbatKoef } from './birlik';
import type { BogRol, Bosqich, MatGuruh, SmetaQator } from './hisob';

export type AvtoTaklif = {
  qator: SmetaQator; rol: BogRol; bosqich: Bosqich | null; material_guruh: MatGuruh | null;
  koef: number | null; tanlangan: boolean;
};

const LOTIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
const kalit = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, (c) => LOTIN[c] ?? c).replace(/\s+/g, ' ').trim();

/** Qo'shni qator rolini aniqlaydi; elementga tegishli bo'lmasa null. */
export function qoshniRoli(q: SmetaQator): Pick<AvtoTaklif, 'rol' | 'bosqich' | 'material_guruh' | 'tanlangan'> | null {
  const kod = kalit(q.kod); const nom = kalit(q.nom);
  const ish = q.tur === 'bl';
  if (!ish && /АРМАТУР|КАРКАС|СЕТК/.test(nom)) return { rol: 'armatura_mat', bosqich: null, material_guruh: 'armatura', tanlangan: true };
  if (!ish) return null;
  if (/^Е6-2-11/.test(kod) || /ИЗГОТОВЛЕНИЕ.*АРМАТУР/.test(nom)) return { rol: 'armatura_tayyorlash', bosqich: 'armatura', material_guruh: null, tanlangan: true };
  const istisno = tuzatishQatorimi({ tur: q.tur, kod: q.kod, nom: q.nom, qoshimcha: q.qoshimcha, zamena: q.zamena })
    || /ИСКЛЮЧ/.test(nom) || /^Е6-1-97/.test(kod) || (q.hajm != null && q.hajm < 0);
  if (istisno) return { rol: 'istisno', bosqich: /АРМАТУР/.test(nom) ? 'armatura' : null, material_guruh: null, tanlangan: true };
  if (/^Е6-1-15/.test(kod) || /ЗАКЛАДН/.test(nom)) return { rol: 'zakladnoy', bosqich: 'armatura', material_guruh: null, tanlangan: false };
  return null;
}

export function avtoYigish(asos: SmetaQator, qoshnilar: readonly SmetaQator[], kAsos: number | null): AvtoTaklif[] {
  const out: AvtoTaklif[] = [];
  const tartibli = qoshnilar
    .filter((q) => q.id !== asos.id && q.obyekt_id === asos.obyekt_id && (q.ota_id ?? null) === (asos.ota_id ?? null) && (q.tartib ?? 0) > (asos.tartib ?? 0))
    .sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  for (const q of tartibli) {
    const r = qoshniRoli(q);
    if (!r) break;
    out.push({ qator: q, ...r, koef: nisbatKoef(kAsos, asos.hajm, q.hajm) });
  }
  return out;
}
