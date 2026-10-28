import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, PackageSearch, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import type { M29Diqqat, M29Material, M29Natija } from '../../lib/m29';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { m29DiqqatXaritasi, m29FarqHolat, m29GuruhKesim, m29EngKopChetlanish, m29MaterialNisbat, m29PulKesim, m29Xulosa } from '../../lib/m29-korinish';
import { M29NormaChiziq } from './M29NormaChiziq';
import { M29ChetlanishDiagramma } from './M29Chetlanish';

/**
 * M-29 natijasining KO'RINISHI (egasi 2026-10-25): xulosa (tejash / ortiqcha — ustamali + ustamasiz, normadan oshgan
 * materiallar soni, holat taqsimoti), har material qatorida «norma = 100%» chizig'i va so'z bilan holat, diqqat
 * belgilari shu qatorning o'zida; sklad ma'lumoti yo'q bo'lsa — bitta aniq bo'sh holat. Hisob — faqat lib/m29 natijasi.
 */
const fmt = (x: number | null | undefined, d = 3) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: d }));
const pul = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Diqqat turlari — muhimlari (pulga bevosita ta'sir, "qayerga ishlatildi?") birinchi. `qisqa` — qator ichidagi belgi. */
const DIQQAT_TURLARI = [
  { tur: 'SMETADA_YOQ', nom: 'Smetada yo‘q material skladdan chiqarilgan — qayerga ishlatildi?', qisqa: 'smetada yo‘q', muhim: true },
  { tur: 'ASOSSIZ_CHIQIM', nom: 'Tasdiqlangan F2 da ishi yo‘q, lekin skladdan chiqarilgan — qayerga ishlatildi?', qisqa: 'F2 da ishi yo‘q — qayerga ishlatildi?', muhim: true },
  { tur: 'PERERASXOD', nom: 'Normadan ortiq sarf', qisqa: 'normadan ortiq sarf', muhim: true },
  { tur: 'SKLAD_KIRITILMAGAN', nom: 'Norma bo‘yicha sarflangan, sklad chiqimi kiritilmagan (haqiqiy sarf noma’lum)', qisqa: 'sklad chiqimi kiritilmagan', muhim: false },
  { tur: 'NORMA_YOQ', nom: 'Smetada norma yo‘q', qisqa: 'smetada norma yo‘q', muhim: false },
  { tur: 'NARX_FARQLI', nom: 'Smetada narxlar farqli', qisqa: 'narxlar farqli', muhim: false },
] as const;
const DIQQAT_TUR = new Map<M29Diqqat['tur'], (typeof DIQQAT_TURLARI)[number]>(DIQQAT_TURLARI.map((d) => [d.tur, d]));

function muammoli(m: M29Material): boolean {
  return (m.faktJami == null && m.normaJami > 0) || (m.farqJami != null && m.farqJami > 1e-9);
}

/** Imzoli farq → modul + so'z («ortiqcha» / «tejaldi»), rang bilan. Belgi (+/−) ko'rsatilmaydi. */
function Farq({ x, pulda = false }: { x: number | null | undefined; pulda?: boolean }) {
  const h = m29FarqHolat(x);
  if (h == null) return <span className="text-text-mute">—</span>;
  const qiymat = pulda ? pul(Math.abs(x!)) : fmt(Math.abs(x!));
  if (h === 'mos') return <span className="text-text-dim">{qiymat}</span>;
  const soz = h === 'ortiqcha' ? t('ortiqcha') : t('tejaldi');
  return (
    <span className={h === 'ortiqcha' ? 'text-danger' : 'text-ok'}>
      {qiymat}<small className="ml-1 text-[10.5px] font-medium opacity-80">{soz}</small>
    </span>
  );
}

/** Pul farqi jami: so'z + ustamali/ustamasiz juftlik. Noma'lum — «—». */
function PulFarq({ obyektId, summa, kesim, kichik = false }: { obyektId: number; summa: number | null | undefined; kesim: Parameters<typeof SummaJuft>[0]['katKesim']; kichik?: boolean }) {
  const h = m29FarqHolat(summa);
  if (h == null) return <span className="text-text-mute">—</span>;
  const soz = h === 'ortiqcha' ? t('ortiqcha sarf') : h === 'tejaldi' ? t('tejaldi') : t('normada');
  const rang = h === 'ortiqcha' ? 'text-danger' : h === 'tejaldi' ? 'text-ok' : 'text-text-dim';
  return (
    <span className="inline-flex flex-col items-end">
      <small className={`text-[10.5px] font-semibold uppercase tracking-wide ${rang}`}>{soz}</small>
      <SummaJuft rejim={kichik ? 'ustamali' : 'qqs'} obyektId={obyektId} ustamasiz={Math.abs(summa!)} katKesim={kesim} kichik={kichik} className="items-end text-right" />
    </span>
  );
}

function Korsatkich({ nom, ikon, rang, children, ost }: { nom: string; ikon: ReactNode; rang?: string; children: ReactNode; ost?: ReactNode }) {
  return (
    <div className="fz-panel">
      <div className="fz-panel__h"><span>{nom}</span><span style={{ color: rang }}>{ikon}</span></div>
      <div className="text-[18px] font-semibold tabular-nums">{children}</div>
      {ost && <div className="text-[11.5px] text-text-mute">{ost}</div>}
    </div>
  );
}


export function M29Korinish({ natija, obyektId }: { natija: M29Natija; obyektId: number }) {
  const [ochiq, setOchiq] = useState<Set<string>>(new Set());
  const [faqatMuammo, setFaqatMuammo] = useState(false);
  const [oyna, setOyna] = useState<'jadval' | 'diqqat' | 'yoq'>('jadval');
  useEffect(() => { setOchiq(new Set(natija.guruhlar.map((g) => 'g:' + g.kat))); }, [natija]);
  const xulosa = useMemo(() => m29Xulosa(natija), [natija]);
  const diqqatXarita = useMemo(() => m29DiqqatXaritasi(natija), [natija]);
  const chetlanish = useMemo(() => m29EngKopChetlanish(natija), [natija]);
  const kesim = useMemo(() => ({ tejash: m29PulKesim(natija, 'tejash'), ortiqcha: m29PulKesim(natija, 'ortiqcha'), sof: m29PulKesim(natija, 'sof') }), [natija]);
  const almashtir = (k: string) => setOchiq((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hammasiniOch = (on: boolean) => {
    if (!on) { setOchiq(new Set()); return; }
    const s = new Set<string>();
    for (const g of natija.guruhlar) { s.add('g:' + g.kat); for (const m of g.materiallar) s.add('m:' + m.kalit); }
    setOchiq(s);
  };

  const muhimDiqqat = natija.diqqat.filter((d) => d.tur === 'SMETADA_YOQ' || d.tur === 'ASOSSIZ_CHIQIM' || d.tur === 'PERERASXOD').length;
  const Son = ({ x, d = 3, cls = '' }: { x: number | null | undefined; d?: number; cls?: string }) =>
    x == null ? <span className="text-text-mute">—</span> : <span className={cls}>{fmt(x, d)}</span>;
  /** Uzun material nomi: farqlovchi qism (diametr, sinf, o'lcham) oxirida — bosh + … + oxir. */
  const qisqaNom = (n: string) => { if (n.length > 70) return n.slice(0, 28).trimEnd() + ' … ' + n.slice(-40).trimStart(); return n; };
  const faktBor = xulosa.faktBor;
  const oid = obyektId;
  const oyNomi = (o: string) => davrNomi(o, tilLocale()) || o;
  const ustunSoni = faktBor ? 10 : 5;

  const diqqatBelgilari = (m: M29Material) => {
    const list = (diqqatXarita.get(m.kalit) ?? []).filter((d: M29Diqqat) => faktBor || d.tur !== 'SKLAD_KIRITILMAGAN');
    if (!list.length) return null;
    return (
      <span className="mt-0.5 flex flex-wrap gap-1">
        {list.map((d, i) => {
          const tur = DIQQAT_TUR.get(d.tur);
          const cls = tur?.muhim ? 'fz-chip--danger' : d.tur === 'NARX_FARQLI' ? '' : 'fz-chip--warn';
          return <span key={d.tur + i} className={`fz-chip ${cls}`} title={d.sabab}><AlertTriangle size={11} aria-hidden="true" />{t(tur?.qisqa ?? d.tur)}</span>;
        })}
      </span>
    );
  };

  const tablar: Array<[typeof oyna, string]> = [['jadval', t('Jadval')], ['diqqat', t('Diqqat ({n})', { n: natija.diqqat.length })], ['yoq', t('Smetada yo‘q ({n})', { n: natija.smetadaYoq.length })]];

  return (
    <>
        {faktBor ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("Ko'rsatkichlar")}>
            <Korsatkich nom={t('Materiallar')} ikon={<Scale size={15} />} ost={t('{oy} · boshidan beri', { oy: oyNomi(natija.davr) })}>
              {xulosa.materialSoni}
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
                {xulosa.ortiqchaSoni > 0 && <span className="fz-chip fz-chip--danger">{t('{n} ta normadan oshgan', { n: xulosa.ortiqchaSoni + xulosa.normasizSoni })}</span>}
                {xulosa.tejaldiSoni > 0 && <span className="fz-chip fz-chip--accent">{t('{n} ta tejalgan', { n: xulosa.tejaldiSoni })}</span>}
                {xulosa.faktYoqSoni > 0 && <span className="fz-chip fz-chip--warn">{t('{n} ta fakti noma’lum', { n: xulosa.faktYoqSoni })}</span>}
              </div>
            </Korsatkich>
            <Korsatkich nom={t('Tejash (normadan kam)')} ikon={<TrendingDown size={15} />} rang="var(--ok)" ost={t('smeta narxida')}>
              <SummaJuft obyektId={oid} ustamasiz={natija.jami.tejashSumma} katKesim={kesim.tejash} />
            </Korsatkich>
            <Korsatkich nom={t('Ortiqcha sarf (normadan ko‘p)')} ikon={<TrendingUp size={15} />} rang="var(--danger)" ost={t('smeta narxida')}>
              <SummaJuft obyektId={oid} ustamasiz={natija.jami.ortiqchaSumma} katKesim={kesim.ortiqcha} />
            </Korsatkich>
            <Korsatkich nom={t('Sof natija')} ikon={<Scale size={15} />} ost={t('ortiqcha sarf − tejash')}>
              {natija.jami.farqSummaJami == null
                ? <span className="text-text-mute" title={t('Ayrim materiallar narxi noma’lum')}>—</span>
                : <span className="flex flex-col gap-0.5">
                  <span className={`text-[12px] font-semibold ${natija.jami.farqSummaJami > 0 ? 'text-danger' : 'text-ok'}`}>{natija.jami.farqSummaJami > 0 ? t('Zarar — normadan ortiq sarflangan') : t('Foyda — normadan kam sarflangan')}</span>
                  <SummaJuft obyektId={oid} ustamasiz={Math.abs(natija.jami.farqSummaJami)} katKesim={kesim.sof} />
                </span>}
            </Korsatkich>
            <M29ChetlanishDiagramma royxat={chetlanish} />
            <div className="fz-panel sm:col-span-2 xl:col-span-4">
              <div className="fz-panel__h"><span>{t('Materiallar holati')}</span><span>{t('{n} ta material', { n: xulosa.materialSoni })}</span></div>
              <div className="fz-split" role="img" aria-label={t('Normadan oshgan: {o} · normada: {m} · tejalgan: {t} · fakt noma’lum: {f}', { o: xulosa.ortiqchaSoni + xulosa.normasizSoni, m: xulosa.mosSoni, t: xulosa.tejaldiSoni, f: xulosa.faktYoqSoni })}>
                {([['var(--danger)', xulosa.ortiqchaSoni + xulosa.normasizSoni], ['var(--text-mute)', xulosa.mosSoni], ['var(--ok)', xulosa.tejaldiSoni], ['var(--warn)', xulosa.faktYoqSoni]] as const)
                  .filter(([, n]) => n > 0).map(([c, n]) => <i key={c} style={{ background: c, flexGrow: n }} />)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-dim">
                {([['var(--danger)', t('normadan oshgan'), xulosa.ortiqchaSoni + xulosa.normasizSoni], ['var(--text-mute)', t('normada'), xulosa.mosSoni], ['var(--ok)', t('tejalgan'), xulosa.tejaldiSoni], ['var(--warn)', t('fakt noma’lum'), xulosa.faktYoqSoni]] as const).map(([c, nom, n]) => (
                  <span key={nom} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{nom}<b className="tabular-nums text-text">{n}</b></span>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="fz-card" aria-label={t("Ko'rsatkichlar")} data-testid="m29-sklad-bosh">
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
              <PackageSearch size={36} strokeWidth={1.5} className="shrink-0 text-warn" />
              <div className="min-w-0 space-y-2">
                <p className="text-[15px] font-semibold text-text">{t('Sklad ma’lumoti yo‘q — haqiqiy sarf noma’lum')}</p>
                <p className="text-[12.5px] text-text-dim">{t('Norma bo‘yicha sarf {n} ta material uchun hisoblandi (tasdiqlangan F2 dan), lekin obyekt skladidan bitta ham chiqim yozilmagan. Shuning uchun tejash, ortiqcha sarf va sof natija hozircha aniqlanmaydi — nol emas, noma’lum.', { n: xulosa.materialSoni })}</p>
                <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px] text-text">
                  <li>{t('Obyekt skladiga kirim va chiqimlarni kiriting (Sklad bo‘limi).')}</li>
                  <li>{t('Yoki yuqoridagi «Ombordan chiqim qilish» bilan shu davr M-29 ni bajaring.')}</li>
                  <li>{t('Shundan keyin har material bo‘yicha norma ↔ fakt chizig‘i, tejash va ortiqcha sarf shu yerda ko‘rinadi.')}</li>
                </ol>
              </div>
            </div>
          </section>
        )}
    
        <div className="flex flex-wrap items-center gap-2 border-b border-border" role="tablist">
          {tablar.map(([k, nom]) => (
            <button key={k} type="button" role="tab" aria-selected={oyna === k} onClick={() => setOyna(k)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium ${oyna === k ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
              {nom}{k === 'diqqat' && muhimDiqqat ? <span className="fz-chip fz-chip--danger">{muhimDiqqat}</span> : null}
            </button>
          ))}
          {oyna === 'jadval' && (
            <div className="ml-auto flex items-center gap-2 pb-1 text-[12px]">
              <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" onClick={() => hammasiniOch(true)}>{t('Hammasini ochish')}</button>
              <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" onClick={() => hammasiniOch(false)}>{t('Yopish')}</button>
              <label className="inline-flex items-center gap-1.5 text-text-dim"><input type="checkbox" checked={faqatMuammo} onChange={(e) => setFaqatMuammo(e.target.checked)} /> {t('faqat muammolilar')}</label>
            </div>
          )}
        </div>
    
        {oyna === 'jadval' && (
          <div className="fz-table-wrap max-h-[70vh]">
            <table className="fz-table min-w-[1120px]">
              <thead>
                <tr>
                  <th rowSpan={2}>{t('Material / ish')}</th>
                  <th rowSpan={2}>{t('Ед.')}</th>
                  <th colSpan={faktBor ? 2 : 1} className="text-center" style={{ borderLeft: '1px solid var(--border)' }}>{oyNomi(natija.davr)}</th>
                  <th colSpan={faktBor ? 4 : 1} className="text-center" style={{ borderLeft: '1px solid var(--border)' }}>{t('Boshidan beri')}</th>
                  {faktBor && <th rowSpan={2} className="fz-c-num">{t('Farq, so‘m')}</th>}
                  <th rowSpan={2} className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}>{t('Skladda qoldiq')}</th>
                </tr>
                <tr>
                  <th className="fz-c-num" style={{ top: 34, borderLeft: '1px solid var(--border)' }}>{t('Norma')}</th>
                  {faktBor && <th className="fz-c-num" style={{ top: 34 }}>{t('Haqiqiy')}</th>}
                  <th className="fz-c-num" style={{ top: 34, borderLeft: '1px solid var(--border)' }}>{t('Norma')}</th>
                  {faktBor && <>
                    <th className="fz-c-num" style={{ top: 34 }}>{t('Haqiqiy')}</th>
                    <th style={{ top: 34 }}>{t('Norma = 100% ↔ fakt')}</th>
                    <th className="fz-c-num" style={{ top: 34 }}>{t('Farq')}</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {natija.guruhlar.map((g) => {
                  const ms = g.materiallar.filter((m) => !faqatMuammo || muammoli(m));
                  if (!ms.length) return null;
                  const gOchiq = ochiq.has('g:' + g.kat);
                  const gOrtiqcha = ms.filter((m) => { const h = m29MaterialNisbat(m).holat; return h === 'ortiqcha' || h === 'normasiz'; }).length;
                  return (
                    <Fragment key={'g' + g.kat}>
                      <tr className="fz-row-rz cursor-pointer" onClick={() => almashtir('g:' + g.kat)}>
                        <td colSpan={2}>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {gOchiq ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{g.nom}
                            <span className="fz-chip">{t('{n} ta', { n: ms.length })}</span>
                            {faktBor && gOrtiqcha > 0 && <span className="fz-chip fz-chip--danger">{t('{n} ta normadan oshgan', { n: gOrtiqcha })}</span>}
                          </span>
                        </td>
                        <td colSpan={faktBor ? 6 : 2} className="text-right text-[11.5px] font-normal text-text-dim">{g.normaSummaJami != null ? t('norma bo‘yicha: {s} so‘m (ustamasiz)', { s: pul(g.normaSummaJami) }) : ''}</td>
                        {faktBor && <td className="fz-c-num"><PulFarq obyektId={oid} summa={g.farqSummaJami} kesim={m29GuruhKesim(g)} kichik /></td>}
                        <td />
                      </tr>
                      {gOchiq && ms.map((m) => {
                        const mOchiq = ochiq.has('m:' + m.kalit);
                        const nis = m29MaterialNisbat(m);
                        const yomon = nis.holat === 'ortiqcha' || nis.holat === 'normasiz';
                        const izoh = t('Norma: {n} · fakt: {f} {b}', { n: fmt(m.normaJami), f: fmt(m.faktJami), b: m.birlik ?? '' });
                        return (
                          <Fragment key={'m' + m.kalit}>
                            <tr className={m.ishlar.length ? 'cursor-pointer' : ''} onClick={() => m.ishlar.length && almashtir('m:' + m.kalit)} data-holat={nis.holat}>
                              <td title={m.nom} style={{ paddingLeft: 28, boxShadow: yomon ? 'inset 3px 0 0 var(--danger)' : undefined }}>
                                <div className="flex items-start gap-1">
                                  {m.ishlar.length ? (mOchiq ? <ChevronDown size={13} className="mt-0.5 shrink-0 text-text-mute" /> : <ChevronRight size={13} className="mt-0.5 shrink-0 text-text-mute" />) : <span className="w-[13px] shrink-0" />}
                                  <span className="min-w-0">
                                    <span className="block">{qisqaNom(m.nom)}</span>
                                    {diqqatBelgilari(m)}
                                  </span>
                                </div>
                              </td>
                              <td className="fz-c-unit">{m.birlik}</td>
                              <td className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}><Son x={m.normaOy} /></td>
                              {faktBor && <td className="fz-c-num"><Son x={m.faktOy} /></td>}
                              <td className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}><Son x={m.normaJami} /></td>
                              {faktBor && <>
                                <td className="fz-c-num"><Son x={m.faktJami} cls="font-semibold" /></td>
                                <td><M29NormaChiziq n={nis} izoh={izoh} /></td>
                                <td className="fz-c-num"><Farq x={m.farqJami} /></td>
                                <td className="fz-c-num"><Farq x={m.farqSummaJami} pulda /></td>
                              </>}
                              <td className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}><Son x={m.skladQoldiq} /></td>
                            </tr>
                            {mOchiq && m.ishlar.map((ish) => (
                              <tr key={'i' + m.kalit + ish.blId} className="fz-row-res">
                                <td style={{ paddingLeft: 52 }} title={ish.nom}>
                                  <span className="line-clamp-1">{ish.kod && <span className="fz-c-shifr mr-1.5">{ish.kod}</span>}{ish.nom}</span>
                                  <span className="mt-0.5 block text-[12px] tabular-nums text-text-dim">
                                    {ish.toGridan
                                      ? <span className="fz-chip fz-chip--accent">{t('miqdor F2 aktidan')}</span>
                                      : ish.norma != null
                                        ? <span>{t('norma {n} × hajm {h} {b}', { n: fmt(ish.norma, 6), h: fmt(ish.hajmJami), b: ish.birlik ?? '' })} = <b className="text-text">{fmt(ish.normaJami)} {m.birlik ?? ''}</b></span>
                                        : <span className="fz-chip fz-chip--warn">{t('norma noma’lum')}</span>}
                                  </span>
                                </td>
                                <td className="fz-c-unit">{ish.birlik}</td>
                                <td className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}><Son x={ish.normaOy} /></td>
                                {faktBor && <td />}
                                <td className="fz-c-num" style={{ borderLeft: '1px solid var(--border)' }}><Son x={ish.normaJami} /></td>
                                {faktBor && <td colSpan={4} />}
                                <td style={{ borderLeft: '1px solid var(--border)' }} />
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {faktBor && (
                  <tr className="fz-row-total">
                    <td colSpan={ustunSoni - 2}>{t('Jami sof natija (ortiqcha sarf − tejash)')}</td>
                    <td className="fz-c-num"><PulFarq obyektId={oid} summa={natija.jami.farqSummaJami} kesim={kesim.sof} /></td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    
        {oyna === 'diqqat' && (
          <section className="space-y-2" aria-label={t('Diqqat')}>
            {!natija.diqqat.length && <p className="fz-note fz-note--info">{t('Diqqat talab qiladigan holat yo‘q.')}</p>}
            {DIQQAT_TURLARI.map((tur) => {
              const list = natija.diqqat.filter((d) => d.tur === tur.tur);
              if (!list.length) return null;
              const summa = list.reduce((s, d) => s + (d.summa ?? 0), 0);
              return (
                <details key={tur.tur} className="fz-card text-[12.5px]" open={tur.muhim}>
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
                    <AlertTriangle size={14} className={tur.muhim ? 'text-danger' : 'text-warn'} />
                    <span className={tur.muhim ? 'font-semibold text-text' : 'text-text-dim'}>{t(tur.nom)}</span>
                    <span className="fz-chip">{list.length}</span>
                    {summa ? <span className="ml-auto tabular-nums text-danger">{t('{s} so‘m', { s: pul(summa) })}</span> : null}
                  </summary>
                  <ul className="max-h-80 divide-y divide-border overflow-auto border-t border-border px-4">
                    {list.map((d, i) => (
                      <li key={i} className="flex gap-3 py-1.5">
                        <span className="min-w-0 flex-1"><b className="font-medium">{d.nom}</b><span className="block text-[11.5px] text-text-dim">{d.sabab}</span></span>
                        {d.summa != null && <span className="shrink-0 tabular-nums text-danger">{pul(d.summa)}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        )}
    
        {oyna === 'yoq' && (
          <section className="fz-table-wrap">
            {!natija.smetadaYoq.length ? <p className="fz-note fz-note--info m-3">{t('Skladdan chiqarilgan barcha materiallar smetada bor.')}</p> : (
              <table className="fz-table">
                <thead><tr>
                  <th>{t('Material (skladdan) — qayerga ishlatildi?')}</th><th>{t('Ед.')}</th>
                  <th className="fz-c-num">{t('Kirim')}</th><th className="fz-c-num">{t('Chiqim (oy)')}</th><th className="fz-c-num">{t('Chiqim (boshidan)')}</th>
                </tr></thead>
                <tbody>{natija.smetadaYoq.map((s, i) => (
                  <tr key={i}><td>{s.nomi}</td><td className="fz-c-unit">{s.birligi ?? '—'}</td>
                    <td className="fz-c-num">{fmt(s.kirimJami)}</td><td className="fz-c-num">{fmt(s.chiqimOy)}</td><td className="fz-c-num text-danger">{fmt(s.chiqimJami)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>
        )}
      </>
  );
}
