import type { UstamaNatija } from '../../lib/ustamali-summa';
import { t } from '../../i18n/til';

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/**
 * «F2 ni yozish» tasdig'idagi bog'lanmagan qatorlar summasi (egasi 2026-10-24: har summa USTAMALI + ustamasiz).
 * Hisob yangi emas: `u` — `useUstamaliSumma().hisobla(katKesim)` natijasi (SummaJuft bilan aynan bir yo'l).
 * Kat noma'lum qism ustamasiz qiymati bilan qo'shiladi va «≈» (taxminiy) deb belgilanadi — 0 emas, o'ylab topilmaydi.
 * Hech bir qatorning kategoriyasi ma'lum bo'lmasa yoki ustama o'qilmagan bo'lsa — «ustamali noma'lum».
 */
export function qolganSummaMatni(soni: number, ustamasiz: number, u: UstamaNatija | null): string {
  const nomalumBor = !!u && (u.nomalum.soni > 0 || u.nomalum.summa !== 0);
  const hechBiriYoq = nomalumBor && u!.ustamasiz === 0;
  if (!u || u.ustamali == null || hechBiriYoq) {
    return t('{n} ta qator — ustamali noma’lum, {pul} so‘m ustamasiz', { n: soni, pul: fmt(ustamasiz) });
  }
  const ustamali = nomalumBor ? u.ustamali + u.nomalum.summa : u.ustamali;
  const asos = t('{n} ta qator — {ust} so‘m (nakrutka bilan), {pul} so‘m ustamasiz', { n: soni, ust: `${nomalumBor ? '≈ ' : ''}${fmt(ustamali)}`, pul: fmt(ustamasiz) });
  return nomalumBor ? `${asos} ${t('(taxminiy, kat noma’lum: {pul} so‘m)', { pul: fmt(u.nomalum.summa) })}` : asos;
}
