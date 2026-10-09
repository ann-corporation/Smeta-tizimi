import { useMemo, useState } from 'react';
import { kitobniTekshir, kitobQiymatTekshir, type KitobTekshiruv, type QiymatNatija } from '../../lib/hujjat-tekshir';
import type { XlsxWorkbook } from '../../lib/f2-import-parse/xlsxReader';
import type { KirishKitob } from '../../lib/smeta-anatomiya/turlar';

const fmt = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
const son = (x: number) => x.toLocaleString('ru-RU');

/**
 * Hujjatni o'zi tekshirish: (1) har formula hujjatning o'z qiymatlari bilan qayta bajariladi va hujjatdagi natija bilan
 * tiyingacha solishtiriladi; (2) formulasiz eksportda — qiymat isboti (hajm × narx = summa, ish = Σ resurs, har ИТОГО
 * oraliq/foiz bilan). Summalarga ta'sir qiladigan har foiz izohlanadi. Faqat o'qiydi — hujjat o'zgarmaydi.
 */
export function HujjatTekshiruvPanel({ book, faylNomi }: { book: XlsxWorkbook | null; faylNomi: string }) {
  const [ochiq, setOchiq] = useState(false);
  const natija = useMemo((): { f: KitobTekshiruv; q: QiymatNatija[] } | null => {
    if (!book) return null;
    const kitob: KirishKitob = { fayl: faylNomi, varaqlar: book.sheets.map((s) => ({ nom: s.name, rows: s.rows, formulalar: s.formulalar })) };
    try { return { f: kitobniTekshir(kitob), q: kitobQiymatTekshir(kitob) }; } catch { return null; }
  }, [book, faylNomi]);
  if (!natija) return null;
  const { f: t, q } = natija;
  const qq = q.reduce((s, x) => ({
    qator: s.qator + x.qatorlar.jami, qatorFarq: s.qatorFarq + x.qatorlar.farq, ish: s.ish + x.ishlar.jami, ishFarq: s.ishFarq + x.ishlar.farq,
    jami: s.jami + x.jamilar.jami, jamiYoq: s.jamiYoq + x.jamilar.isbotlanmadi,
  }), { qator: 0, qatorFarq: 0, ish: 0, ishFarq: 0, jami: 0, jamiYoq: 0 });
  if (!t.jami.formulalar && !qq.qator && !qq.jami) return null;
  const formulaFoizlar = t.varaqlar.flatMap((v) => v.foizlar.map((x) => ({ k: `${v.varaq}!${x.manzil}`, joy: `${v.varaq}!${x.manzil}`, yorliq: x.yorliq, foiz: x.foiz, baza: x.baza, bazaQiymat: x.bazaQiymat, natija: x.natija })));
  const qiymatFoizlar = q.flatMap((v) => v.foizlar.map((x) => ({ k: `${v.varaq}:${x.qator}`, joy: `${v.varaq}, ${x.qator}-qator`, yorliq: x.yorliq, foiz: x.foiz, baza: x.baza, bazaQiymat: x.bazaQiymat as number | null, natija: x.natija as number | null })));
  const foizlar = t.jami.formulalar ? formulaFoizlar : qiymatFoizlar;
  const formulaMuammo = t.varaqlar.flatMap((v) => v.muammolar);
  const qiymatMuammo = q.flatMap((v) => v.muammolar.map((m) => ({ ...m, varaq: v.varaq })));
  const hammasiMos = (t.jami.formulalar ? t.toliqMos : true) && qq.qatorFarq === 0 && qq.ishFarq === 0 && (t.jami.formulalar ? true : qq.jamiYoq === 0);
  const rang = hammasiMos ? 'border-success/40' : t.deyarliMos && qq.qatorFarq === 0 ? 'border-amber-500/40' : 'border-danger/40';
  return <div className={`karta p-2 space-y-1.5 text-xs ${rang}`} data-testid="hujjat-tekshiruv">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <b>Hujjat o‘zini tekshirish:</b>
      {t.jami.formulalar > 0 && <span>
        {son(t.jami.formulalar)} formula qayta hisoblandi —{' '}
        {t.toliqMos ? <span className="font-semibold text-success">hammasi tiyingacha mos ✓</span>
          : <span className="font-semibold">{son(t.jami.mos)} mos{t.jami.yaxlitlash ? `, ${t.jami.yaxlitlash} yaxlitlash (≤ 0,05)` : ''}{t.jami.farq ? <span className="text-danger">, {t.jami.farq} farq</span> : ''}{t.jami.tushunilmadi ? `, ${t.jami.tushunilmadi} tushunilmadi` : ''}</span>}
      </span>}
      {qq.qator > 0 && <span>· {son(qq.qator)} qator hajm × narx = summa{qq.qatorFarq ? <span className="text-danger"> ({qq.qatorFarq} farq)</span> : ' ✓'}</span>}
      {qq.ish > 0 && <span>· {son(qq.ish)} ish = Σ resurs{qq.ishFarq ? <span className="text-danger"> ({qq.ishFarq} farq)</span> : ' ✓'}</span>}
      {qq.jami > 0 && !t.jami.formulalar && <span>· {son(qq.jami - qq.jamiYoq)}/{son(qq.jami)} jami isbotlandi</span>}
      {foizlar.length > 0 && <span className="text-text-mute">· {foizlar.length} ta foiz aniqlandi</span>}
      <button type="button" className="underline" onClick={() => setOchiq((x) => !x)}>{ochiq ? 'yopish' : 'batafsil'}</button>
    </div>
    {ochiq && foizlar.length > 0 && <div>
      <div className="font-semibold">Summalarga ta’sir qiladigan foizlar</div>
      <ul className="space-y-0.5">{foizlar.slice(0, 200).map((f) => <li key={f.k}>
        <span className="font-mono">{f.joy}</span> {f.yorliq || '—'} = <b>{f.foiz}%</b> × {f.baza} [{fmt(f.bazaQiymat)}] → <b>{fmt(f.natija)}</b>
      </li>)}</ul>
    </div>}
    {ochiq && formulaMuammo.length > 0 && <div>
      <div className="font-semibold">Formulasi mos kelmagan yoki tushunilmagan kataklar</div>
      <ul className="space-y-0.5">{formulaMuammo.slice(0, 300).map((m) => <li key={`${m.varaq}!${m.manzil}`} className={m.holat === 'farq' ? 'text-danger' : ''}>
        <span className="font-mono">{m.varaq}!{m.manzil}</span> {m.yorliq || '—'}: hujjatda {fmt(m.hujjatda)}, hisob {fmt(m.hisoblandi)} — {m.holat === 'tushunilmadi' ? 'formula hali tushunilmadi' : m.izoh}
      </li>)}</ul>
    </div>}
    {ochiq && qiymatMuammo.length > 0 && <div>
      <div className="font-semibold">Qiymat bo‘yicha mos kelmagan qatorlar</div>
      <ul className="space-y-0.5">{qiymatMuammo.slice(0, 300).map((m) => <li key={`${m.varaq}:${m.tur}:${m.qator}`} className={m.holat === 'farq' ? 'text-danger' : ''}>
        <span className="font-mono">{m.varaq}, {m.qator}-qator</span> {m.yorliq.slice(0, 80)}: hujjatda {fmt(m.hujjatda)}, hisob {fmt(m.hisoblandi)} ({m.isbot})
      </li>)}</ul>
    </div>}
  </div>;
}
