import { useEffect, useMemo, useState } from 'react';
import { sverkaManbalardan, SVERKA_KAT_NOMI, type SverkaManba, type SverkaNatija, type SverkaHolat } from '../../lib/smeta-anatomiya/sverka';
import { SVERKA_HOLAT_NOMI, sverkaHujjatXlsx } from '../../lib/lrv-res-sverka-export';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { AlertTriangle, Eye } from 'lucide-react';

/**
 * Smeta yuklanganda LRV ↔ RES farqlari (egasi, C5). Avtomatik hisoblanadi,
 * importni to'xtatmaydi: farq — ogohlantirish va «Сверка ЛРВ и РС» hujjati.
 */
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
  const { joriy } = useKompaniya();
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
  if (xato) return <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{xato}</span></div>;
  if (!natija) return <p role="status" className="text-[12px] text-text-mute">{t('LRV va RES solishtirilmoqda…')}</p>;

  const lrvManba = lrvlar.map((m) => m.nom).join('; ');
  const resManba = reslar.length ? reslar.map((m) => m.nom).join('; ') : 'ресурсная ведомость в составе ЛРВ';
  const hujjat = async (korish: boolean) => {
    if (!joriy?.id) { toast('Hujjat uchun kompaniyani tanlang.', 'danger'); return; }
    const { bytes, faylNomi } = sverkaHujjatXlsx(natija, { obyektNomi: obyektNomi || 'Объект', lrvManba, resManba, faqatFarq });
    const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'SVERKA_LRV_RES', sabab: `Сверка ЛРВ и РС · ${obyektNomi || 'Объект'}` },
      () => { if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi); });
    if (!t.ok) toast(t.xabar, 'danger'); else if (t.xabar) toast(t.xabar, 'ok');
  };
  const c = natija.soni;
  const korinadi = natija.pozitsiyalar.filter((p) => !faqatFarq || (p.holat !== 'mos' && p.holat !== 'mashinist'));

  /* Natija — bir qarashda: har holat o'z rangida kenglik bo'yicha (soni ulushi). Rang — faqat Firuza tokenlari. */
  const BO_LAKLAR: ReadonlyArray<{ id: SverkaHolat; rang: string; soz: string }> = [
    { id: 'mos', rang: 'var(--ok)', soz: 'mos' },
    { id: 'farq', rang: 'var(--danger)', soz: 'farq bor' },
    { id: 'faqat_lrv', rang: 'var(--warn)', soz: 'faqat LRV da' },
    { id: 'faqat_res', rang: 'var(--info)', soz: 'faqat RES da' },
    { id: 'noaniq', rang: 'var(--kat-ob)', soz: 'miqdori yo‘q' },
    { id: 'mashinist', rang: 'var(--border-strong)', soz: 'mashinist mehnati (ma’lumot uchun)' },
  ];
  const jami = BO_LAKLAR.reduce((x, k) => x + c[k.id], 0);
  const HOLAT_MUHR: Record<SverkaHolat, string> = { mos: 'fz-stamp--ok', farq: 'fz-stamp--danger', faqat_lrv: 'fz-stamp--warn', faqat_res: 'fz-stamp--info', noaniq: 'fz-stamp--warn', mashinist: '' };

  return (
    <div className="fz-panel" style={{ borderColor: natija.muammo ? 'color-mix(in srgb, var(--warn) 45%, transparent)' : 'color-mix(in srgb, var(--ok) 45%, transparent)' }} data-testid="lrv-res-sverka">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-text" style={{ fontFamily: 'var(--font-display)' }}>{t('LRV ↔ RES solishtirish')} <span className="font-normal text-text-mute">(Сверка ЛРВ и РС)</span></p>
        {!natija.resYoq && natija.muammo === 0 && <span className="fz-stamp fz-stamp--ok">{t('to‘liq mos')}</span>}
        {!natija.resYoq && natija.muammo > 0 && <span className="fz-stamp fz-stamp--warn">{natija.muammo} {t('ta muammo')}</span>}
      </div>
      {natija.resYoq ? (
        <div className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>RES topilmadi — na alohida RES varag‘i, na LRV ichidagi resurs vedomosti. Solishtirish uchun RES varag‘ini belgilang yoki RES faylini yuklang.</span></div>
      ) : (<>
        <p className="text-[12px] text-text-dim">{natija.pozitsiyalar.length} ta resurs:</p>
        {jami > 0 && <div className="fz-split" role="img" aria-label={t('LRV va RES solishtirish natijasi')} style={{ height: 14 }}>
          {BO_LAKLAR.filter((k) => c[k.id] > 0).map((k) => <i key={k.id} style={{ flex: c[k.id], background: k.rang }} title={`${c[k.id]} ${t(k.soz)}`} />)}
        </div>}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
          {BO_LAKLAR.filter((k) => c[k.id] > 0).map((k) => (
            <span key={k.id} className="inline-flex items-center gap-1.5 tabular-nums text-text-dim"><i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: k.rang, flexShrink: 0 }} />{c[k.id]} {t(k.soz)}</span>
          ))}
        </div>
      </>)}
      {natija.muammo > 0 && (
        <p className="text-[11.5px] text-text-mute">{t('Import to‘xtatilmaydi — bu ogohlantirish. Solishtirish nom + birlik bo‘yicha; kod bir xil, nomi farqli pozitsiyalar birlashtirilmaydi, izohda ko‘rsatiladi.')}</p>
      )}
      {(natija.review ?? []).length > 0 && (
        <details className="text-[11.5px]" data-testid="sverka-review">
          <summary className="cursor-pointer text-warn">{t('Manba xatolari — hujjatdagidek import qilinadi ({n})', { n: natija.review.length })}</summary>
          <ul className="list-disc pl-5 text-text-dim">
            {natija.review.slice(0, 50).map((r, i) => <li key={i}>{r.izoh}</li>)}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim">
          <input type="checkbox" checked={faqatFarq} onChange={(e) => setFaqatFarq(e.target.checked)} /> faqat farqlilar
        </label>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => hujjat(true)}><Eye aria-hidden="true" />{t('Hujjatni ko‘rish')}</button>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => hujjat(false)}>«Сверка ЛРВ и РС» Excel</button>
        </span>
      </div>
      {korinadi.length > 0 && (
        <div className="fz-table-wrap max-h-72">
          <table className="fz-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>{t('Tur')}</th><th>{t('Resurs')}</th><th>{t('Birlik')}</th>
                <th className="fz-c-num">LRV</th><th className="fz-c-num">RES</th><th className="fz-c-num">{t('Farq')}</th>
                <th>{t('Holat')}</th>
              </tr>
            </thead>
            <tbody>
              {korinadi.slice(0, 500).map((p, i) => (
                <tr key={i} style={{ verticalAlign: 'top' }}>
                  <td className="fz-c-unit" title={SVERKA_KAT_NOMI[p.kat]}>{p.kat}</td>
                  <td>{p.nom}{p.kod ? <span className="text-text-mute"> ({p.kod})</span> : null}
                    {p.lrvManzil && <span className="block text-[11px] text-text-mute">LRV: {p.lrvManzil.varaq}, {p.lrvManzil.qator}-qator{p.lrvSoni > 1 ? ` (+${p.lrvSoni - 1} ta ishda)` : ''}{p.resManzil ? ` · RES: ${p.resManzil.varaq}, ${p.resManzil.qator}-qator` : ''}</span>}
                    {!p.lrvManzil && p.resManzil && <span className="block text-[11px] text-text-mute">RES: {p.resManzil.varaq}, {p.resManzil.qator}-qator</span>}
                  </td>
                  <td className="fz-c-unit">{p.birlik}</td>
                  <td className="fz-c-num">{fmt(p.lrvHajm)}</td>
                  <td className="fz-c-num">{fmt(p.resHajm)}</td>
                  <td className={`fz-c-num ${p.farqHajm ? 'fz-over' : ''}`} style={p.farqHajm ? { color: 'var(--danger)' } : undefined}>{fmt(p.farqHajm)}</td>
                  <td title={`${SVERKA_HOLAT_NOMI[p.holat]}${p.izoh ? `: ${p.izoh}` : ''}`}><span className={`fz-stamp ${HOLAT_MUHR[p.holat]}`}>{HOLAT_UZ[p.holat]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {korinadi.length > 500 && <p className="p-2 text-[11px] text-text-mute">…va yana {korinadi.length - 500} ta — to‘liq ro‘yxat Excel hujjatida.</p>}
        </div>
      )}
      {korinish.oyna}
    </div>
  );
}
