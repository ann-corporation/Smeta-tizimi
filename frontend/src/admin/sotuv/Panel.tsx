/**
 * Sotuv paneli: KPI (zaxira, sotuv, tushum, muddati o'tgan qarz), qarz «aging», kechikkanlar (qo'ng'iroq ro'yxati),
 * 12 oylik tushum prognozi, voronka konversiyasi, manbalar, menejerlar, binolar. Diagrammalar — oddiy CSS ustunlar.
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { SotuvPanel } from '../../api/t2-sotuv';
import { agingQur, manbaKonversiya, prognoz12, ustunUlush, voronkaQur } from '../../lib/sotuv/panel-korinish';
import { telefonKorinish } from '../../lib/sotuv/bitim-korinish';
import { Ixcham, Pul } from './umumiy';
import { BOSQICH_NOMI, kirit, manbaNomi } from './sotuv-umumiy';

const Kpi = ({ nom, children, izoh }: { nom: string; children: ReactNode; izoh?: ReactNode }) => (
  <div className="fz-kpi">
    <div className="fz-kpi__label">{nom}</div>
    <div className="fz-kpi__value">{children}</div>
    {izoh && <div className="fz-kpi__sub">{izoh}</div>}
  </div>
);
const Blok = ({ nom, children }: { nom: string; children: ReactNode }) => (
  <section className="rounded-md border border-border bg-surface p-3">
    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-mute">{nom}</h3>
    {children}
  </section>
);
const Ustun = ({ ulush, rang = 'bg-accent' }: { ulush: number; rang?: string }) => (
  <div className="h-2.5 w-full overflow-hidden rounded bg-surface-2"><div className={`h-full rounded ${rang}`} style={{ width: `${Math.max(0, Math.min(1, ulush)) * 100}%` }} /></div>
);

export function Panel({ p, loyihaId, setLoyihaId, bitimOch }: {
  p: SotuvPanel; loyihaId: number | null; setLoyihaId: (id: number | null) => void; bitimOch: (id: number) => void;
}) {
  const aging = agingQur(p.qarz);
  const AGING_NOM = { k0_30: t('0–30 kun'), k31_90: t('31–90 kun'), k90: t('90+ kun'), kelajak: t('Muddati kelmagan') } as const;
  const prog = prognoz12(p.prognoz);
  const progUlush = ustunUlush(prog.map((x) => x.summa));
  const vor = voronkaQur(p.voronka);
  const vorUlush = ustunUlush(vor.qadamlar.map((q) => q.yetdi));
  const z = p.zaxira;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px]">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute">{t('Loyiha')}</span>
          <select className={kirit} value={loyihaId ?? ''} onChange={(e) => setLoyihaId(Number(e.target.value) || null)} aria-label={t('Loyiha')}>
            <option value="">{t('Barcha loyihalar')}</option>
            {p.loyihalar.map((l) => <option key={l.loyiha_id} value={l.loyiha_id}>{l.nom}</option>)}
          </select>
        </label>
        <span className="text-[11.5px] text-text-mute">{t('Yangilangan: {s}', { s: String(p.generated_at).slice(0, 16).replace('T', ' ') })}</span>
      </div>

      <div className="fz-kpis">
        <Kpi nom={t('Zaxira (jami birlik)')} izoh={t('bo‘sh {b} · bron {r} · sotilgan {s}', { b: z.bosh, r: z.bron, s: z.sotilgan })}>{z.jami}</Kpi>
        <Kpi nom={t('Bo‘sh birliklar qiymati')} izoh={z.narxsiz_soni > 0 ? t('Narxsiz: {n}', { n: z.narxsiz_soni }) : undefined}><Ixcham val={z.qiymat_bosh} /></Kpi>
        <Kpi nom={t('Sotildi')} izoh={<>{t('o‘rtacha m²')}: <Ixcham val={p.sotuv.ortacha_m2} /></>}>{p.sotuv.soni} · <Ixcham val={p.sotuv.summa} /></Kpi>
        <Kpi nom={t('Tushum')}><Ixcham val={p.tushum} /></Kpi>
        <Kpi nom={t('Muddati o‘tgan qarz')}><span className={p.qarz.muddati_otgan > 0 ? 'text-danger' : ''}><Ixcham val={p.qarz.muddati_otgan} /></span></Kpi>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Blok nom={t('Qarz muddati bo‘yicha')}>
          <div className="space-y-1.5 text-[12.5px]">
            {aging.map((a) => (
              <div key={a.kalit} className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
                <span className="text-text-dim">{AGING_NOM[a.kalit]}</span>
                <Ustun ulush={a.ulush} rang={a.kalit === 'kelajak' ? 'bg-info' : a.kalit === 'k0_30' ? 'bg-warn' : 'bg-danger'} />
                <Ixcham val={a.summa} />
              </div>
            ))}
          </div>
        </Blok>

        <Blok nom={t('Tushum prognozi (12 oy)')}>
          <div className="flex h-32 items-end gap-1" role="img" aria-label={t('Tushum prognozi (12 oy)')}>
            {prog.map((x, i) => (
              <div key={x.oy} className="flex h-full flex-1 flex-col justify-end" title={`${x.oy}: ${x.summa}`}>
                <div className="w-full rounded-t bg-accent/70" style={{ height: `${progUlush[i] * 100}%`, minHeight: x.summa > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-[9.5px] text-text-mute">{prog.map((x) => <span key={x.oy} className="flex-1 text-center tabular-nums">{x.oy.slice(5)}</span>)}</div>
        </Blok>

        <Blok nom={t('Voronka')}>
          <div className="space-y-1.5 text-[12.5px]">
            {vor.qadamlar.map((q, i) => (
              <div key={q.bosqich} className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                <span className="text-text-dim">{BOSQICH_NOMI[q.bosqich]()}</span>
                <Ustun ulush={vorUlush[i]} />
                <span className="tabular-nums">{q.yetdi}{q.oldingidanFoiz != null ? ` · ${q.oldingidanFoiz}%` : ''}</span>
              </div>
            ))}
            <p className="text-[11.5px] text-text-mute">{t('Bekor qilingan: {n}', { n: vor.bekor })}</p>
          </div>
        </Blok>

        <Blok nom={t('Manbalar')}>
          <Jadval ustunlar={[t('Manba'), t('Lid'), t('Sotildi'), t('Konversiya')]} qatorlar={manbaKonversiya(p.manbalar).map((m) => [
            manbaNomi(m.manba), m.lid, m.sotildi, m.foiz != null ? `${m.foiz}%` : '—'])} />
        </Blok>
      </div>

      <Blok nom={t('Kechikkan to‘lovlar (qo‘ng‘iroq ro‘yxati)')}>
        {!p.kechikkanlar.length ? <p className="text-[12px] text-text-mute">{t('Kechikkan to‘lov yo‘q')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-text-mute"><tr><th className="px-1">{t('Mijoz')}</th><th className="px-1">{t('Telefon')}</th><th className="px-1 text-right">{t('Qarz')}</th><th className="px-1 text-right">{t('Kun')}</th></tr></thead>
              <tbody>
                {p.kechikkanlar.map((k) => (
                  <tr key={k.bitim_id} className="border-t border-border/50">
                    <td className="px-1"><button type="button" className="text-left text-accent" onClick={() => bitimOch(k.bitim_id)}>{k.mijoz}</button></td>
                    <td className="px-1 tabular-nums"><a href={`tel:+${k.telefon.replace(/\D/g, '')}`}>{telefonKorinish(k.telefon)}</a></td>
                    <td className="px-1 text-right"><Pul val={k.qarz} cl="text-danger" /></td>
                    <td className="px-1 text-right tabular-nums">{k.kun}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Blok>

      <div className="grid gap-3 lg:grid-cols-2">
        <Blok nom={t('Menejerlar')}>
          <Jadval ustunlar={[t('Menejer'), t('Bitimlar'), t('Sotildi'), t('Summa')]} qatorlar={p.menejerlar.map((m) => [
            m.ism ?? (m.actor_id != null ? `#${m.actor_id}` : '—'), m.bitim, m.sotildi, <Ixcham key="s" val={m.summa} />])} />
        </Blok>
        <Blok nom={t('Binolar')}>
          <Jadval ustunlar={[t('Bino'), t('Jami'), t('Bo‘sh'), t('Sotilgan')]} qatorlar={p.binolar.map((b) => [b.nom, b.jami, b.bosh, b.sotilgan])} />
        </Blok>
      </div>
    </div>
  );
}

function Jadval({ ustunlar, qatorlar }: { ustunlar: string[]; qatorlar: ReactNode[][] }) {
  if (!qatorlar.length) return <p className="text-[12px] text-text-mute">{t('Ma’lumot yo‘q')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-left text-text-mute"><tr>{ustunlar.map((u, i) => <th key={i} className={`px-1 ${i ? 'text-right' : ''}`}>{u}</th>)}</tr></thead>
        <tbody>
          {qatorlar.map((q, i) => <tr key={i} className="border-t border-border/50">{q.map((c, j) => <td key={j} className={`px-1 ${j ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
