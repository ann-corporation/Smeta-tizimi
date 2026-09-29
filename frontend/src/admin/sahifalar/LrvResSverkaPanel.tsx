import { useEffect, useMemo, useState } from 'react';
import { sverkaManbalardan, SVERKA_KAT_NOMI, type SverkaManba, type SverkaNatija, type SverkaHolat } from '../../lib/smeta-anatomiya/sverka';
import { SVERKA_HOLAT_NOMI, sverkaHujjatXlsx } from '../../lib/lrv-res-sverka-export';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';

/**
 * Smeta yuklanganda LRV ↔ RES farqlari (egasi, C5). Avtomatik hisoblanadi,
 * importni to'xtatmaydi: farq — ogohlantirish va «Сверка ЛРВ и РС» hujjati.
 */
const HOLAT_RANG: Record<SverkaHolat, string> = {
  mos: 'text-success', farq: 'text-danger', faqat_lrv: 'text-warn', faqat_res: 'text-warn', noaniq: 'text-warn', mashinist: 'text-text-mute',
};
const HOLAT_UZ: Record<SverkaHolat, string> = {
  mos: 'mos', farq: 'farq bor', faqat_lrv: 'faqat LRV da', faqat_res: 'faqat RES da', noaniq: 'miqdor yo‘q', mashinist: 'ma’lumot uchun',
};
const fmt = (x: number | null, kasr = 3) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: kasr }));

export function LrvResSverkaPanel({ lrvlar, reslar, obyektNomi }: {
  lrvlar: readonly SverkaManba[];
  reslar: readonly SverkaManba[];
  obyektNomi: string;
}) {
  const [natija, setNatija] = useState<SverkaNatija | null>(null);
  const [xato, setXato] = useState('');
  const [faqatFarq, setFaqatFarq] = useState(true);
  const korinish = useHujjatKorinish();
  const kalit = useMemo(() => [...lrvlar, ...reslar].map((m) => `${m.nom}:${m.rows.length}`).join('|'), [lrvlar, reslar]);

  useEffect(() => {
    if (!lrvlar.length) { setNatija(null); return; }
    setNatija(null); setXato('');
    // Katta smetada render qotmasin — keyingi tick'da hisoblanadi.
    const t = setTimeout(() => {
      try { setNatija(sverkaManbalardan(lrvlar, reslar)); } catch { setXato('LRV va RES solishtirilmadi — fayl tuzilmasini tekshiring.'); }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalit]);

  if (!lrvlar.length) return null;
  if (xato) return <p className="text-[12px] text-danger">{xato}</p>;
  if (!natija) return <p role="status" className="text-[12px] text-text-mute">LRV va RES solishtirilmoqda…</p>;

  const lrvManba = lrvlar.map((m) => m.nom).join('; ');
  const resManba = reslar.length ? reslar.map((m) => m.nom).join('; ') : 'ресурсная ведомость в составе ЛРВ';
  const hujjat = (korish: boolean) => {
    const { bytes, faylNomi } = sverkaHujjatXlsx(natija, { obyektNomi: obyektNomi || 'Объект', lrvManba, resManba, faqatFarq });
    if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi);
  };
  const c = natija.soni;
  const korinadi = natija.pozitsiyalar.filter((p) => !faqatFarq || (p.holat !== 'mos' && p.holat !== 'mashinist'));

  return (
    <div className={`karta p-2 space-y-1.5 ${natija.muammo ? 'border-amber-500/40' : 'border-success/40'}`} data-testid="lrv-res-sverka">
      <p className="text-[12px] font-semibold text-text">LRV ↔ RES solishtirish (Сверка ЛРВ и РС)</p>
      {natija.resYoq ? (
        <p className="text-[12px] text-warn">RES topilmadi — na alohida RES varag‘i, na LRV ichidagi resurs vedomosti. Solishtirish uchun RES varag‘ini belgilang yoki RES faylini yuklang.</p>
      ) : (
        <p className="text-[12px]">
          {natija.pozitsiyalar.length} ta resurs: <b className="text-success">{c.mos} mos</b>
          {c.farq > 0 && <> · <b className="text-danger">{c.farq} farq bor</b></>}
          {c.faqat_lrv > 0 && <> · <b className="text-warn">{c.faqat_lrv} faqat LRV da</b></>}
          {c.faqat_res > 0 && <> · <b className="text-warn">{c.faqat_res} faqat RES da</b></>}
          {c.noaniq > 0 && <> · <b className="text-warn">{c.noaniq} miqdori yo‘q</b></>}
          {c.mashinist > 0 && <span className="text-text-mute"> · {c.mashinist} mashinist mehnati (ma’lumot uchun)</span>}
          {natija.muammo === 0 && <span className="text-success"> — LRV va RES to‘liq mos.</span>}
        </p>
      )}
      {natija.muammo > 0 && (
        <p className="text-[11px] text-text-mute">Import to‘xtatilmaydi — bu ogohlantirish. Solishtirish nom + birlik bo‘yicha; kod bir xil, nomi farqli pozitsiyalar birlashtirilmaydi, izohda ko‘rsatiladi.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] flex items-center gap-1">
          <input type="checkbox" checked={faqatFarq} onChange={(e) => setFaqatFarq(e.target.checked)} /> faqat farqlilar
        </label>
        <button type="button" className="tugma" onClick={() => hujjat(true)}>👁 Hujjatni ko‘rish</button>
        <button type="button" className="tugma" onClick={() => hujjat(false)}>«Сверка ЛРВ и РС» Excel</button>
      </div>
      {korinadi.length > 0 && (
        <div className="overflow-auto max-h-72 text-[12px]">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-text-mute">
                <th className="font-normal px-1">Tur</th><th className="font-normal px-1">Resurs</th><th className="font-normal px-1">Birlik</th>
                <th className="font-normal px-1 text-right">LRV</th><th className="font-normal px-1 text-right">RES</th><th className="font-normal px-1 text-right">Farq</th>
                <th className="font-normal px-1">Holat</th>
              </tr>
            </thead>
            <tbody>
              {korinadi.slice(0, 500).map((p, i) => (
                <tr key={i} className="border-t border-border/40 align-top">
                  <td className="px-1 text-text-mute" title={SVERKA_KAT_NOMI[p.kat]}>{p.kat}</td>
                  <td className="px-1">{p.nom}{p.kod ? <span className="text-text-mute"> ({p.kod})</span> : null}
                    {p.lrvManzil && <span className="block text-[11px] text-text-mute">LRV: {p.lrvManzil.varaq}, {p.lrvManzil.qator}-qator{p.lrvSoni > 1 ? ` (+${p.lrvSoni - 1} ta ishda)` : ''}{p.resManzil ? ` · RES: ${p.resManzil.varaq}, ${p.resManzil.qator}-qator` : ''}</span>}
                    {!p.lrvManzil && p.resManzil && <span className="block text-[11px] text-text-mute">RES: {p.resManzil.varaq}, {p.resManzil.qator}-qator</span>}
                  </td>
                  <td className="px-1 whitespace-nowrap">{p.birlik}</td>
                  <td className="px-1 text-right whitespace-nowrap">{fmt(p.lrvHajm)}</td>
                  <td className="px-1 text-right whitespace-nowrap">{fmt(p.resHajm)}</td>
                  <td className={`px-1 text-right whitespace-nowrap ${p.farqHajm ? 'text-danger' : ''}`}>{fmt(p.farqHajm)}</td>
                  <td className={`px-1 ${HOLAT_RANG[p.holat]}`} title={`${SVERKA_HOLAT_NOMI[p.holat]}${p.izoh ? `: ${p.izoh}` : ''}`}>{HOLAT_UZ[p.holat]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {korinadi.length > 500 && <p className="text-[11px] text-text-mute">…va yana {korinadi.length - 500} ta — to‘liq ro‘yxat Excel hujjatida.</p>}
        </div>
      )}
      {korinish.oyna}
    </div>
  );
}
