import { kalit, son, toliqUstunlar, xom } from './matn';
import type { ErkinVaraq, KirishKitob, SvodVaraq, TushunilmaganVaraq, VaraqAnatomiyasi } from './turlar';

/**
 * «Bo'sh import» darvozasi (C4 PR-1, 2026-10-26; «Yo'l 2,5 km — bo'sh import» tashxisi).
 *
 * Varaqda sonli+matnli qatorlar (≥ 5) bor, lekin hech bir shakl (LRV ishlari, RES/vedomost, tn·km qatorlari, svod
 * qatorlari) bitta ham qatorni o'qimagan bo'lsa — natija jim «0 qator» bo'lmaydi: varaq `tushunilmadi` deb qaytadi,
 * yonida eng katta ИТОГО/ВСЕГО summasi (yo'qotilishi mumkin bo'lgan pul) va taklif. Bo'sh bo'lim yaratilmaydi.
 */
const MIN_SONLI = 5;
const JAMI = /^(ИТОГО|ВСЕГО|JAMI|ЖАМИ)/;

/** Varaqdagi sonli + matnli qatorlar soni (korpus o'lchovidagi «sonli qator» ta'rifi). */
export function sonliQatorlar(rows: readonly (readonly unknown[])[]): number {
  let n = 0;
  for (const row of rows) {
    const arr = (row ?? []) as unknown[];
    if (arr.some((c) => typeof c === 'number') && arr.some((c) => typeof c === 'string' && /[А-Яа-яA-Za-z]{3}/.test(c))) n++;
  }
  return n;
}

function engKattaSumma(fayl: string, varaq: string, rows: readonly (readonly unknown[])[]): TushunilmaganVaraq['engKattaSumma'] {
  let jami: TushunilmaganVaraq['engKattaSumma'] = null;
  let umumiy: TushunilmaganVaraq['engKattaSumma'] = null;
  rows.forEach((row0, r) => {
    const row = (row0 ?? []) as Parameters<typeof toliqUstunlar>[0];
    const toliq = toliqUstunlar(row);
    const yorliq = toliq.map((i) => xom(row[i])).find((t) => /[А-Яа-яA-Za-z]{2}/.test(t)) ?? '';
    const jamiQator = toliq.some((i) => JAMI.test(kalit(row[i])));
    for (const i of toliq) {
      if (typeof row[i] !== 'number') continue;
      const q = son(row[i]);
      if (q == null) continue;
      const nomzod = { qiymat: q, yorliq, manzil: { fayl, varaq, qator: r + 1, ustun: i + 1 } };
      if (jamiQator && (!jami || Math.abs(q) > Math.abs(jami.qiymat))) jami = nomzod;
      if (!umumiy || Math.abs(q) > Math.abs(umumiy.qiymat)) umumiy = nomzod;
    }
  });
  return jami ?? umumiy;
}

function taklif(rol: VaraqAnatomiyasi['rol']): string {
  switch (rol) {
    case 'lrv': case 'res':
      return "ustunlar tanildi, lekin bitta ham ish/resurs qatori o'qilmadi — ustunlarni tekshiring yoki varaqni boshqa rol bilan belgilang";
    case 'transport':
      return "tn·km ustunlari (material, грузооборот, summa) tanilmadi — varaqni ko'rib chiqing";
    case 'svod':
      return "svod shakli («Наименование затрат/смет») tanilmadi — qatorlar o'qilmadi";
    default:
      return "smeta shakli tanilmadi: hajm jadvali, narx taqqosi yoki ustama manbasi bo'lishi mumkin — kerak bo'lsa LRV/RES deb qo'lda belgilang, aks holda e'tiborsiz qoldiring";
  }
}

export function tushunilmaganVaraqlar(
  kitob: KirishKitob, anat: readonly VaraqAnatomiyasi[], erkin: readonly ErkinVaraq[], svod: readonly SvodVaraq[],
): TushunilmaganVaraq[] {
  const chiq: TushunilmaganVaraq[] = [];
  kitob.varaqlar.forEach((v, j) => {
    const a = anat[j];
    if (!a || a.rol === 'bosh') return;
    const e = erkin.find((x) => x.varaq === v.nom);
    const s = svod.find((x) => x.varaq === v.nom);
    const tushunilgan = a.ishlar.length + (a.mustaqilResurslar?.length ?? 0) + a.vedomost.length
      + (e?.qatorlar?.length ?? 0) + (s ? (s.shakl === 'obyekt_royxati' ? 1 : s.qatorlar.length) : 0);
    if (tushunilgan > 0) return;
    const sonli = sonliQatorlar(v.rows);
    if (sonli < MIN_SONLI) return;
    chiq.push({ fayl: kitob.fayl, varaq: v.nom, rol: a.rol, sonliQatorlar: sonli, engKattaSumma: engKattaSumma(kitob.fayl, v.nom, v.rows), taklif: taklif(a.rol) });
  });
  return chiq;
}
