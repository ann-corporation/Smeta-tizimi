import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { narxTakliflari as rpcTakliflar, type NarxVariant } from '../../api/t2-ish-abc';
import { sbNarxTakliflarOl, type NarxTaklif } from '../../api/t2-narx-dalil';
import { narxVariantlariTartibla } from '../../lib/fakt-studio';
import { f2ResursYigish, takliflarYigish, type VedomostQator } from '../../lib/f2-resurs-vedomost';
import type { F2Qator } from '../../lib/f2-tayyor';

/**
 * F2 tayyorlashdagi RESURS VEDOMOSTI: tanlangan ishlar resurslari (kat bo'yicha guruh) va shu yerda narxlash.
 * Takliflar mavjud qatlamlardan: api/t2-ish-abc narxTakliflari (shu smeta, shartnoma, boshqa smetalar, katalog) va
 * api/t2-narx-dalil sbNarxTakliflarOl (faktura/KP/katalog, yetkazuvchi narxlari). Narx faqat «Narxni qo'llash» bosilganda
 * F2 qatoriga yoziladi (asl smetaga emas); avtomatik yozish yo'q.
 */
export function F2ResursVedomosti({ qatorlar, kodOl, obyektId, kompaniyaId, onQollash }: {
  qatorlar: readonly F2Qator[]; kodOl: (id: number) => string | null | undefined;
  obyektId: number; kompaniyaId: number | null | undefined;
  onQollash: (qatorIds: number[], narx: number) => void;
}) {
  const guruhlar = useMemo(() => f2ResursYigish(qatorlar, kodOl), [qatorlar, kodOl]);
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [variantlar, setVariantlar] = useState<Map<string, NarxVariant[]>>(new Map());
  const [manbaT, setManbaT] = useState<NarxTaklif[]>([]);
  const [holat, setHolat] = useState<'' | 'yuklanmoqda' | 'xato' | 'tayyor'>('');
  const hammasi = useMemo(() => guruhlar.flatMap((g) => g.qatorlar), [guruhlar]);

  // Takliflar faqat qator ochilganda (birinchi marta) bir yo'la hamma resurslar uchun yuklanadi.
  useEffect(() => {
    if (ochiq == null || holat !== '') return;
    let bekor = false;
    setHolat('yuklanmoqda');
    const noyob = new Map(hammasi.map((x) => [x.guruh, { nom: x.nom, birlik: x.birlik }] as const));
    const kalitlar = [...noyob.keys()];
    void Promise.all([
      rpcTakliflar(obyektId, kalitlar.map((k) => noyob.get(k)!)),
      kompaniyaId ? sbNarxTakliflarOl(kompaniyaId, obyektId) : Promise.resolve({ ok: true as const, qatorlar: [] as NarxTaklif[] }),
    ]).then(([rpc, man]) => {
      if (bekor) return;
      setVariantlar(new Map(kalitlar.map((k, i) => [k, rpc[i] ?? []] as const)));
      setManbaT(man.ok ? man.qatorlar ?? [] : []);
      setHolat(man.ok ? 'tayyor' : 'xato');
    }).catch(() => { if (!bekor) setHolat('xato'); });
    return () => { bekor = true; };
  }, [ochiq, holat, hammasi, obyektId, kompaniyaId]);

  if (!guruhlar.length) return <div className="p-4 text-[12px] text-text-dim">{t('Resurs vedomosti uchun avval ish hajmini kiriting.')}</div>;

  const taklifPaneli = (x: VedomostQator) => {
    if (holat === 'yuklanmoqda' || holat === '') return <div className="px-3 py-2 text-[11px] text-text-mute">{t('Takliflar yuklanmoqda…')}</div>;
    const ids = new Set(x.qatorIds);
    const { takliflar, chetda } = takliflarYigish(narxVariantlariTartibla((variantlar.get(x.guruh) ?? []).map((v) => ({ ...v, narx: Number(v.narx) }))), manbaT, ids);
    return <div className="space-y-1 px-3 py-2" data-testid="narx-takliflar">
      {holat === 'xato' && <div className="text-[11px] text-warn">{t('Ba’zi manbalar o‘qilmadi — mavjud takliflar ko‘rsatilmoqda.')}</div>}
      {takliflar.length === 0 && <div className="text-[11px] text-text-mute">{t('Taklif topilmadi — narx o‘ylab topilmaydi; qo‘lda kiriting.')}</div>}
      {takliflar.map((tk) => <div key={tk.id} className="flex flex-wrap items-center gap-2 text-[11px]">
        <b className="tabular-nums text-text"><FmtN val={tk.narx} /></b>
        <span className="text-text-dim">{tk.manba}</span>
        <span className="text-text-mute">{tk.sana ?? t('sana ko‘rsatilmagan')}</span>
        {tk.izoh && <span className="max-w-[28rem] truncate text-text-mute" title={tk.izoh}>{tk.izoh}</span>}
        {tk.xabar && <span className="text-warn">{t(tk.xabar)}</span>}
        <button type="button" onClick={() => onQollash(x.qatorIds, tk.narx)} className="ml-auto rounded-md border border-accent/40 px-2 py-0.5 font-semibold text-text hover:bg-accent/10">{t('Narxni qo‘llash')}</button>
      </div>)}
      {chetda > 0 && <div className="text-[10px] text-text-mute">{t('NDS bilan/noma’lum narxlar ko‘rsatilmadi: {n}', { n: String(chetda) })}</div>}
    </div>;
  };

  return <div className="space-y-3 p-3" data-testid="resurs-vedomosti">
    {guruhlar.map((g) => <section key={g.kat ?? 'boshqa'} className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-mute">
        <span className="flex-1">{g.kat ?? t('Boshqa resurslar')}</span>
        <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={g.summa} katKesim={g.katKesim} kichik />
      </div>
      <table className="w-full text-[12px]"><tbody>
        {g.qatorlar.map((x) => {
          const ochilgan = ochiq === x.kalit;
          return <Fragment key={x.kalit}>
            <tr className="border-b border-border/50 align-top">
              <td className="w-6 px-1 py-1"><button type="button" aria-label={`${t('Narx takliflari')}: ${x.nom}`} onClick={() => setOchiq(ochilgan ? null : x.kalit)} className="rounded p-0.5 text-text-mute hover:text-text">{ochilgan ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
              <td className="w-28 px-2 py-1 font-mono text-[10px] text-text-mute">{x.kodlar}</td>
              <td className="px-2 py-1 text-text">{x.nom}{x.narxFarqli && <span className="ml-1 rounded bg-warn/10 px-1 text-[10px] text-warn">{t('narx farqli')}</span>}{x.axborot && <span className="ml-1 text-[10px] text-text-mute">{t('ma’lumot qatori (narx mashina narxi ichida)')}</span>}</td>
              <td className="w-16 px-2 py-1 text-text-dim">{x.birlik}</td>
              <td className="w-24 px-2 py-1 text-right tabular-nums"><FmtN val={x.hajm} /></td>
              <td className="w-28 px-2 py-1 text-right tabular-nums">{x.narx != null ? <FmtN val={x.narx} /> : x.axborot ? '' : <span className="text-warn">{t('narx yo‘q')}</span>}</td>
              <td className="w-32 px-2 py-1 text-right tabular-nums font-semibold">{x.summa != null ? <FmtN val={x.summa} /> : ''}</td>
            </tr>
            {ochilgan && <tr key={`${x.kalit}-t`}><td colSpan={7} className="bg-surface-2/40">{taklifPaneli(x)}</td></tr>}
          </Fragment>;
        })}
      </tbody></table>
    </section>)}
    <div className="text-[10px] text-text-mute">{t('Narx NDS siz. Taklif avtomatik yozilmaydi — «Narxni qo‘llash» faqat F2 qatoriga yozadi (asl smeta o‘zgarmaydi).')}</div>
  </div>;
}
