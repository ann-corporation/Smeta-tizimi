import { useMemo, useState } from 'react';
import { kitobniTekshir, type KitobTekshiruv } from '../../lib/hujjat-tekshir';
import type { XlsxWorkbook } from '../../lib/f2-import-parse/xlsxReader';

const fmt = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

/**
 * Hujjatni o'zi tekshirish: yuklangan fayldagi har bir formula hujjatning o'z qiymatlari bilan qayta bajariladi va
 * hujjatdagi natija bilan tiyingacha solishtiriladi; summalarga ta'sir qiladigan har bir foiz izohlanadi.
 * Faqat o'qiydi — hujjat o'zgarmaydi.
 */
export function HujjatTekshiruvPanel({ book, faylNomi }: { book: XlsxWorkbook | null; faylNomi: string }) {
  const [ochiq, setOchiq] = useState(false);
  const t: KitobTekshiruv | null = useMemo(() => {
    if (!book) return null;
    try {
      return kitobniTekshir({ fayl: faylNomi, varaqlar: book.sheets.map((s) => ({ nom: s.name, rows: s.rows, formulalar: s.formulalar })) });
    } catch { return null; }
  }, [book, faylNomi]);
  if (!t) return null;
  if (!t.jami.formulalar) {
    return <div className="karta p-2 text-xs text-text-mute" data-testid="hujjat-tekshiruv">
      Hujjat tekshiruvi: faylda formula yo‘q (qiymatlar eksporti) — summalar qator bo‘yicha tekshiriladi.
    </div>;
  }
  const muammolar = t.varaqlar.flatMap((v) => v.muammolar);
  const foizlar = t.varaqlar.flatMap((v) => v.foizlar);
  const rang = t.toliqMos ? 'border-success/40' : t.deyarliMos ? 'border-amber-500/40' : 'border-danger/40';
  return <div className={`karta p-2 space-y-1.5 text-xs ${rang}`} data-testid="hujjat-tekshiruv">
    <div className="flex flex-wrap items-center gap-2">
      <b>Hujjat o‘zini tekshirish:</b>
      <span>{t.jami.formulalar.toLocaleString('ru-RU')} formula qayta hisoblandi —</span>
      {t.toliqMos
        ? <span className="font-semibold text-success">hammasi hujjatdagi natija bilan tiyingacha mos ✓</span>
        : <span className="font-semibold">
            {t.jami.mos.toLocaleString('ru-RU')} mos
            {t.jami.yaxlitlash ? `, ${t.jami.yaxlitlash} yaxlitlash (≤ 0,05)` : ''}
            {t.jami.farq ? <span className="text-danger">, {t.jami.farq} farq</span> : ''}
            {t.jami.tushunilmadi ? `, ${t.jami.tushunilmadi} tushunilmadi` : ''}
          </span>}
      {foizlar.length > 0 && <span className="text-text-mute">· {foizlar.length} ta foiz aniqlandi</span>}
      {(foizlar.length > 0 || muammolar.length > 0) && <button type="button" className="underline" onClick={() => setOchiq((x) => !x)}>{ochiq ? 'yopish' : 'batafsil'}</button>}
    </div>
    {ochiq && foizlar.length > 0 && <div>
      <div className="font-semibold">Summalarga ta’sir qiladigan foizlar</div>
      <ul className="space-y-0.5">{foizlar.slice(0, 200).map((f) => <li key={`${f.varaq}!${f.manzil}`}>
        <span className="font-mono">{f.varaq}!{f.manzil}</span> {f.yorliq || '—'} = <b>{f.foiz}%</b> × {f.baza} [{fmt(f.bazaQiymat)}] → <b>{fmt(f.natija)}</b>
      </li>)}</ul>
    </div>}
    {ochiq && muammolar.length > 0 && <div>
      <div className="font-semibold">Mos kelmagan yoki tushunilmagan kataklar</div>
      <ul className="space-y-0.5">{muammolar.slice(0, 300).map((m) => <li key={`${m.varaq}!${m.manzil}`} className={m.holat === 'farq' ? 'text-danger' : ''}>
        <span className="font-mono">{m.varaq}!{m.manzil}</span> {m.yorliq || '—'}: hujjatda {fmt(m.hujjatda)}, hisob {fmt(m.hisoblandi)} — {m.holat === 'tushunilmadi' ? 'formula hali tushunilmadi' : m.izoh}
      </li>)}</ul>
      {muammolar.length > 300 && <p className="text-text-mute">…va yana {muammolar.length - 300} ta</p>}
    </div>}
  </div>;
}
