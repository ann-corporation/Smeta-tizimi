/**
 * Smeta yuklash ustasi (wizard) uchun sof yordamchilar: daraxt sanog'i, muammolar ro'yxati,
 * versiya nomi va qayta yuklash matni. UI yo'q, hisob-kitob (summa/podval) mantig'i yo'q —
 * faqat mavjud tahlil natijalarini oddiy o'zbekcha ko'rinishga keltiradi.
 */
import { t } from '../../../i18n/til';

export type DaraxtTuguni = { type: string; children?: DaraxtTuguni[] };

export type YuklashSanoq = { bolim: number; ish: number; resurs: number };

/** Bo'lim (rz) / ish (bl) / resurs (rs, mat, ob) soni. */
export function daraxtSanoq(tree: readonly DaraxtTuguni[]): YuklashSanoq {
  const s = { bolim: 0, ish: 0, resurs: 0 };
  const yur = (n: DaraxtTuguni) => {
    if (n.type === 'rz') s.bolim++;
    else if (n.type === 'bl') s.ish++;
    else if (n.type === 'rs' || n.type === 'mat' || n.type === 'ob') s.resurs++;
    n.children?.forEach(yur);
  };
  tree.forEach(yur);
  return s;
}

export type MuammoTon = 'xato' | 'ogoh' | 'info';
export type Muammo = { kalit: string; ton: MuammoTon; matn: string; tafsilot?: string[] };

export type MuammoKirish = {
  lrvTanlanmagan: boolean;
  narxsiz: number;
  resursJami: number;
  vedomostChiqarildi: number;
  tekisVaraqlar: ReadonlyArray<{ manba: string; sabab?: string | null }>;
  tushunilmadiVaraq: number;
  /** Excel jami ↔ tizim jami (lib/nakrutka-smetadan.excelBilanTizim natijasi; bu yerda faqat matnga o'giriladi). */
  excelTizim?: ExcelTizimXulosa | null;
  /** Narxsiz resurslar nomlari (tafsilot: qatorga bosib ko‘rish). */
  narxsizQatorlar?: ReadonlyArray<string>;
  /** Shifri yo‘q ish qatorlari soni. */
  kodsizIsh?: number;
  /** Faylda ustama podvali topilmadi (oldindan ko‘rishda ogohlantirish). */
  podvalYoq?: boolean;
};
export type ExcelTizimXulosa = {
  excelVsego: number | null; tizimVsego: number | null; farq: number | null; mos: boolean; taxminiy: boolean;
  qatorlar: ReadonlyArray<{ nom: string; excel: number | null; tizim: number | null; farq: number | null; izoh: string }>;
};
const pulMatn = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Tekshiruv natijasi — oddiy o'zbekcha muammolar ro'yxati (texnik atamasiz), har biri «tafsilot» bilan. */
export function muammolarRoyxati(k: MuammoKirish): Muammo[] {
  const out: Muammo[] = [];
  if (k.lrvTanlanmagan) {
    out.push({ kalit: 'lrv', ton: 'xato', matn: t('Ish va hajmlar varag‘i topilmadi — kamida bitta varaqni «Ish va hajm» deb belgilang.') });
  }
  if (k.narxsiz > 0) {
    out.push({
      kalit: 'narxsiz', ton: 'ogoh',
      matn: t('{n} ta resursda narx yo‘q ({jami} dan). Ular smetaga narxsiz yoziladi, jami to‘liq bo‘lmaydi.', { n: k.narxsiz, jami: k.resursJami }),
      tafsilot: [t('Narxlar fayldagi «RES» varag‘idan olinadi. Alohida narx faylingiz bo‘lsa, «Qo‘shimcha sozlamalar» ichida yuklang.'), ...(k.narxsizQatorlar ?? []).slice(0, 25)],
    });
  }
  if ((k.kodsizIsh ?? 0) > 0) {
    out.push({ kalit: 'kodsiz', ton: 'info', matn: t('{n} ta ish qatorida shifr (kod) yo‘q — ular nomi bo‘yicha saqlanadi.', { n: k.kodsizIsh ?? 0 }) });
  }
  if (k.podvalYoq) {
    out.push({
      kalit: 'podval-yoq', ton: 'info',
      matn: t('Faylda ustama (nakrutka) podvali topilmadi. Foizlar kompaniya sozlamasidan olinadi — jami taxminiy bo‘ladi.'),
    });
  }
  if (k.vedomostChiqarildi > 0) {
    out.push({
      kalit: 'vedomost', ton: 'info',
      matn: t('Resurs vedomosti qatorlari ({n} ta) ish sifatida qo‘shilmaydi — ikki marta sanalmasligi uchun.', { n: k.vedomostChiqarildi }),
    });
  }
  if (k.tushunilmadiVaraq > 0) {
    out.push({
      kalit: 'tushunilmadi', ton: 'ogoh',
      matn: t('{n} ta varaq tushunilmadi. Kerak bo‘lsa, varaq turini yuqorida o‘zingiz tanlang.', { n: k.tushunilmadiVaraq }),
    });
  }
  const ex = k.excelTizim;
  if (ex && ex.excelVsego != null) {
    out.push({
      kalit: 'excel-tizim', ton: ex.mos ? 'info' : 'ogoh',
      matn: ex.mos
        ? t('Excel jami tizim jamiga teng: {jami} (QQS bilan).', { jami: pulMatn(ex.excelVsego) })
        : t('Excel jami {excel}, tizim jami {tizim} (farq {farq}).', { excel: pulMatn(ex.excelVsego), tizim: pulMatn(ex.tizimVsego), farq: pulMatn(ex.farq) }),
      tafsilot: [
        ...(ex.taxminiy ? [t('Faylda ustama podvali yo‘q — tizim jami kompaniya foizlari bilan, taxminiy.')] : []),
        ...ex.qatorlar.filter((q) => q.farq != null && Math.abs(q.farq) > 1).map((q) => `${q.nom}: Excel ${pulMatn(q.excel)} · tizim ${pulMatn(q.tizim)}${q.izoh ? ` — ${q.izoh}` : ''}`),
      ],
    });
  }
  if (k.tekisVaraqlar.length > 0) {
    out.push({
      kalit: 'tekis', ton: 'info',
      matn: t('{n} ta varaqda bo‘limlar ichma-ich emas — tekis tuzilma ishlatildi.', { n: k.tekisVaraqlar.length }),
      tafsilot: k.tekisVaraqlar.map((x) => `${x.manba}: ${x.sabab ?? '—'}`),
    });
  }
  return out;
}

/** Versiya nomi: foydalanuvchi yozgan yorliq, bo'sh bo'lsa sana (fayl nomi bilan aralashtirilmaydi). */
export function versiyaNomi(yorliq: string, sana: Date = new Date()): string {
  const toza = yorliq.trim();
  if (toza) return toza;
  const p = (x: number) => String(x).padStart(2, '0');
  return t('Versiya {sana}', { sana: `${sana.getFullYear()}-${p(sana.getMonth() + 1)}-${p(sana.getDate())}` });
}

/** Mavjud smeta bor — qayta yuklash haqiqatan nima qilishini aytadi (ustiga yozilmaydi, versiya sifatida saqlanadi). */
export function qaytaYuklashMatni(qatorSoni: number | null | undefined): string {
  return t('Bu obyektda {n} qatorlik smeta bor. Yangi fayl uning ustiga yozilmaydi: u yangi versiya sifatida saqlanadi va joriy smeta bilan solishtiriladi (nima qo‘shildi, nima yo‘qoldi). Joriy smeta o‘zgarmaydi.', { n: qatorSoni ?? 0 });
}

/** Bosqich: 0 fayl tanlash, 1 tekshiruv, 2 ko'rib chiqish, 3 import ketmoqda, 4 natija. */
export function bosqichIndeksi(h: { natija: boolean; band: boolean; kitob: boolean; ustunlar: boolean; tahlil?: boolean }): number {
  if (h.natija) return 4;
  if (h.band && h.kitob) return 3;
  if (h.kitob && h.ustunlar) return h.tahlil ? 2 : 1;
  if (h.kitob) return 1;
  return 0;
}
