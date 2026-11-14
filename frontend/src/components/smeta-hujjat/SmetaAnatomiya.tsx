import { Fragment, useMemo, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TreeNode } from '../../api/types';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { katKesimJamiBilan, katKesimYigish } from '../../lib/ustamali-summa';
import { kesimgaQosh, yigindi2 } from '../../lib/hisob-yadro';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { birlikOgohi } from '../../lib/fakt-birlik-ogoh';
import { BirlikOgohBlok } from '../fakt/BirlikOgoh';
import { aslBarglar, aslSmeta, barglar, bolimlarKorinishi, katSmeta, oshganQatorlar, ulushlarniMaxrajgaKeltir, umumiyKesim, type Kesim } from '../../lib/smeta-korinish';
import { bajarilishMaxraji } from '../../lib/f2-reestr/reestr-korinish';
import { SmetaOzgarishQatlam } from './SmetaOzgarishQatlam';
import { useSmetaQatlam } from '../../umumiy/ui/useSmetaQatlam';

/**
 * SMETA ANATOMIYASI (egasi 2026-10-25: «har bir smetani vizual ko'rib tushunish»): smeta qanday tuzilgan va qancha
 * bajarilganini bir ekranda ko'rsatadi — umumiy holat (smeta = 100%: F2 olingan / fakt bajarilgan / qoldiq),
 * kategoriya taqsimoti, bo'limlar kesimi va smetadan oshgan qatorlar. Manba — `useT2Daraxt().tree`, hisob
 * `lib/smeta-korinish` da. Holat sahifasiga (HolatNative) daraxt ustiga qo'yish uchun mo'ljallangan.
 */
function Chiziq({ k, katta = false }: { k: Kesim; katta?: boolean }) {
  const f2u = k.f2Ulush ?? 0, faktu = k.faktUlush ?? 0;
  const faktOrtiq = Math.max(0, faktu - f2u);
  const foiz = k.faktUlush == null ? null : Math.round(k.faktUlush * 100);
  const ulMatn = (x: number | null) => (x == null ? '—' : Math.round(x * 100) + '%');
  return (
    <span className={`fz-meter ${katta ? 'fz-meter--lg' : ''}`} title={t('F2 olingan: {f2} · bajarilgan: {fakt} · smeta: {s}', { f2: ulMatn(k.f2Ulush), fakt: ulMatn(k.faktUlush), s: '100%' })}>
      <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${f2u * 100}%` }} /><i className="fz-meter__fakt" style={{ width: `${faktOrtiq * 100}%` }} /></span>
      <span className="fz-meter__f">{foiz == null ? '—' : `${foiz}%`}</span>
    </span>
  );
}

export function SmetaAnatomiya({ tree, obyektId }: { tree: readonly TreeNode[]; obyektId: number | null }) {
  const umumiy = useMemo(() => umumiyKesim(tree), [tree]);
  const bolimlar = useMemo(() => bolimlarKorinishi(tree), [tree]);
  const kat = useMemo(() => katSmeta(tree), [tree]);
  const diqqat = useMemo(() => oshganQatorlar(tree), [tree]);
  const daraxtKesim = useMemo(() => katKesimYigish([...aslBarglar(tree)].filter((b) => b.type !== 'rz' && b.type !== 'bl'), (b) => b.kat, (b) => b.smeta), [tree]);
  // Svod yaxlit belgili obyektda butun smeta ustamalisi — server kesimi (yaxlit bo'limlar ustamasiz, QQS bir marta).
  const ust = useUstamaliSumma(obyektId);
  const kesim = ust.obyektKesim ?? daraxtKesim;
  const { korinishKesimi, faktKesimi } = ust;
  /** Fakt / F2 / qoldiq kartalari ham QQS bilan (egasi 2026-10-27): barg qatorlar kesimi; jamidan farqi — kat noma'lum (≈). */
  const kartaKesim = useMemo(() => {
    const juft: { id: number; ota_id: number | null }[] = [];
    const yur = (x: TreeNode, ota: number | null) => { if (x.id != null) juft.push({ id: x.id, ota_id: ota }); x.children?.forEach((c) => yur(c, x.id ?? null)); };
    tree.forEach((r) => yur(r, null));
    const bs = [...barglar(tree)].filter((b) => b.type !== 'rz' && b.type !== 'bl');
    const son = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    // Svod bo'limlari eksport bilan bir model: yaxlit × (ko'rinish / smeta); F2 — aynan (masshtablanmaydi).
    const yig = (qs: TreeNode[], summa: (b: TreeNode) => number | null, jami: number | null, masshtab = true, f2 = false) => (korinishKesimi
      ? korinishKesimi(juft, qs, { id: (b) => b.id, kat: (b) => b.kat, summa, smeta: (b) => son(b.smeta) }, { jami, masshtab, f2 })
      : katKesimJamiBilan(qs, (b) => b.kat, summa, jami));
    return {
      /** Bo'lim jami (bo'lim darajasi) — tree[i] ↔ bolimlar[i]. */
      // Bo'lim smetasi — ASL (CONST); qo'shimcha/zamena «O'zgarishlar» qatlamida alohida.
      bolim: tree.map((r) => yig([...aslBarglar([r])].filter((b) => b.type !== 'rz' && b.type !== 'bl'), (b) => son(b.smeta), aslSmeta(r))),
      // Fakt ham F2 bilan BIR XIL usulda (aynan, masshtablanmaydi; svod bo'limida ЧЕЛ/МАШ oddiy kategoriya): egasi qoidasi «F2 bor qatorda fakt
      // summasi F2 narxida» — aks holda bir xil summali fakt va F2 QQS bilan ~2,5% farq qilardi (sinov-fakt 2026-11-14).
      fakt: faktKesimi
        ? faktKesimi(juft, bs, { id: (b) => b.id, kat: (b) => b.kat, summa: (b) => son(b.stFakt), smeta: (b) => son(b.smeta) }, { jami: umumiy.fakt })
        : katKesimJamiBilan(bs, (b) => b.kat, (b) => son(b.stFakt), umumiy.fakt),
      f2: yig(bs, (b) => son(b.stF2), umumiy.f2, false, true),
      // Qoldiq = serverning qator qoldig'i (smeta − F2 − almashtirilgan; fakt ≥ F2 qoidasi yo'q) — «Resurslar» tabi bilan bir xil.
      qoldiq: yig(bs, (b) => son(b.stOst), umumiy.qoldiq),
    };
  }, [tree, umumiy, korinishKesimi]);
  // «Smeta (asl)» — server paketi (barcha sahifalar bilan bir xil manba); paket o'qilmaguncha daraxt hisobi.
  const qatlam = useSmetaQatlam(obyektId);
  const aslPaket = qatlam?.asl.paket ?? null;
  // Qoldiq «bajarilmaydi» deb belgilangan ishlarni chiqarib tashlaydi (ular qolgan ish emas) — «Smeta + o'zgarishlar» bilan bir xil qoida.
  const bajUstamasiz = qatlam?.ozgarish.bajarilmadi ?? 0;
  const qoldiqUstamasiz = umumiy.qoldiq == null ? null : yigindi2([umumiy.qoldiq, bajUstamasiz]);
  const qoldiqKesim = useMemo(() => {
    const b = qatlam?.ozgarish.kesim.bajarilmadi ?? [];
    if (!b.length) return kartaKesim.qoldiq;
    const k = { ...kartaKesim.qoldiq, summalar: { ...kartaKesim.qoldiq.summalar } };
    for (const x of b) kesimgaQosh(k, x.kat, x.summa);
    return k;
  }, [kartaKesim.qoldiq, qatlam]);
  // Obyekt qiymati = smeta + o'zgarishlar (egasi 2026-11-14); foiz/chiziq maxraji ham shu. Server qatlami yo'q bo'lsa — asl smeta (joriy: false, belgi bilan).
  const joriyPaket = qatlam?.joriy.paket ?? null;
  const maxraj = bajarilishMaxraji({ jami: qatlam ? qatlam.asl.ustamasiz : umumiy.smeta, ozgarish: qatlam?.ozgarish.ustamasiz });
  const kor = useMemo(() => ulushlarniMaxrajgaKeltir(umumiy, maxraj.summa), [umumiy, maxraj.summa]);
  if (!tree.length) return null;
  const qiymatSinf = '[&_[data-testid=summa-qqs]]:text-[20px] [&_[data-testid=summa-qqs]]:font-semibold';
  let qiymatSumma: ReactElement;
  if (maxraj.joriy && joriyPaket) qiymatSumma = <SummaJuft paket={joriyPaket} className={qiymatSinf} />;
  else if (maxraj.joriy && qatlam) qiymatSumma = <SummaJuft obyektId={obyektId} ustamasiz={qatlam.joriy.ustamasiz} className={qiymatSinf} />;
  else if (aslPaket) qiymatSumma = <SummaJuft paket={aslPaket} className={qiymatSinf} />;
  else qiymatSumma = <SummaJuft obyektId={obyektId} ustamasiz={umumiy.smeta} katKesim={kesim} className={qiymatSinf} />;
  const aslQQS =aslPaket?.qqs_bilan ?? null, ozQQS = qatlam?.ozgarish.qqs_bilan ?? null;
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const toliqEmas = umumiy.toliq ? null : t('To‘liq emas: {s} bo‘limda smeta, {f} da fakt, {f2} da F2 summasi noma’lum — ko‘rsatilgan qiymat faqat ma’lum qismlar yig‘indisi', { s: umumiy.nomalum.smeta, f: umumiy.nomalum.fakt, f2: umumiy.nomalum.f2 });
  const nomalumBelgi = (soni: number) => (soni > 0 ? <span className="fz-chip fz-chip--warn" title={toliqEmas ?? undefined}>{t('qisman')}</span> : null);

  return (
    <section className="fz-doc" aria-label={t('Smeta anatomiyasi')}>
      <div className="fz-doc__sheet">
        <div className="fz-kpis">
          <div className="fz-kpi" data-testid="obyekt-qiymati"><span className="fz-kpi__label">{maxraj.joriy ? t('Smeta qiymati') : t('Smeta qiymati (asl)')}</span>
            {qiymatSumma}
            {nomalumBelgi(umumiy.nomalum.smeta)}
            {maxraj.joriy
              ? <span className="fz-kpi__sub" data-testid="obyekt-qiymati-tarkib">{t('shundan asl smeta: {a}, o‘zgarishlar: {o} (QQS bilan)', { a: aslQQS == null ? '—' : Math.round(aslQQS).toLocaleString('ru-RU'), o: ozQQS == null ? '—' : Math.round(ozQQS).toLocaleString('ru-RU') })}</span>
              : <span className="fz-kpi__sub fz-note--warn" data-testid="obyekt-qiymati-oqilmadi">{t('o‘zgarishlar o‘qilmadi — faqat asl smeta ko‘rsatilgan')}</span>}
          </div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i className="fz-bg-nomalum" style={{ background: 'var(--info)' }} />{t('Bajarilgan (fakt)')}</span><SummaJuft obyektId={obyektId} ustamasiz={umumiy.fakt} katKesim={kartaKesim.fakt} yorliq={t('Fakt, QQS bilan')} />{nomalumBelgi(umumiy.nomalum.fakt)}<span className="fz-kpi__sub">{pct(kor.faktUlush)} {maxraj.joriy ? t('smeta + o‘zgarishlardan') : t('smetadan')}</span></div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--accent)' }} />{t('F2 bilan topshirilgan')}</span><SummaJuft obyektId={obyektId} ustamasiz={umumiy.f2} katKesim={kartaKesim.f2} yorliq={t('F2, QQS bilan')} />{nomalumBelgi(umumiy.nomalum.f2)}<span className="fz-kpi__sub">{pct(kor.f2Ulush)} {maxraj.joriy ? t('smeta + o‘zgarishlardan') : t('smetadan')}</span></div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />{maxraj.joriy ? t('Qoldiq (smeta + o‘zgarishlar − F2)') : t('Qoldiq (smeta − F2)')}</span><SummaJuft obyektId={obyektId} ustamasiz={qoldiqUstamasiz} katKesim={qoldiqKesim} yorliq={t('Qoldiq, QQS bilan')} />{nomalumBelgi(umumiy.nomalum.smeta + umumiy.nomalum.fakt + umumiy.nomalum.f2)}<span className="fz-kpi__sub">{t('F2 ga hali olinmagan qism («bajarilmaydi» ishlar chiqarilgan); bajarilish foizi emas')}</span></div>
        </div>
        <Chiziq k={kor} katta />
        {toliqEmas && <p className="fz-note fz-note--warn" role="note"><AlertTriangle aria-hidden="true" />{toliqEmas}</p>}
        <div className="fz-doc__meta"><span>{t('{n} bo‘lim', { n: bolimlar.length })}</span><span>{t('{n} ish', { n: bolimlar.reduce((a, b) => a + b.ishSoni, 0) })}</span><span>{t('{n} resurs', { n: bolimlar.reduce((a, b) => a + b.resursSoni, 0) })}</span>{bolimlar.some((b) => b.oshgan > 0) && <span className="fz-chip fz-chip--warn">{t('{n} ish smetadan oshgan', { n: bolimlar.reduce((a, b) => a + b.oshgan, 0) })}</span>}</div>
      </div>

      {/* Egasi 2026-11-06: smeta — const; qo'shimcha / zamena / bajarilmaydi — alohida, asosi bilan. */}
      <SmetaOzgarishQatlam obyektId={obyektId} />

      <div className="fz-doc__panels">
        <section className="fz-panel" aria-label={t('Kategoriyalar')}>
          <div className="fz-panel__h"><span>{t('Smeta tarkibi')}</span><span>{t('ustamasiz')}</span></div>
          <div className="fz-split" role="img" aria-label={kat.qismlar.map((k) => `${t(KAT_GURUH_NOMI[k.guruh])} ${pct(k.ulush)}`).join(', ')}>
            {kat.qismlar.map((k) => <i key={k.guruh} className={`fz-bg-${k.guruh}`} style={{ flexGrow: Math.max(k.ulush, 0.002) }} />)}
          </div>
          <div className="fz-legend">
            {kat.qismlar.map((k) => (<Fragment key={k.guruh}>
              <i className={`fz-bg-${k.guruh}`} style={{ width: 10, height: 10, borderRadius: 2, display: 'block' }} />
              <span>{t(KAT_GURUH_NOMI[k.guruh])}</span>
              <span className="fz-c-num"><FmtN val={k.summa} kasr={0} /></span>
              <small>{pct(k.ulush)}</small>
            </Fragment>))}
          </div>
          {kat.summasiz > 0 && <span className="fz-chip fz-chip--warn">{t('{n} resursda summa yo‘q', { n: kat.summasiz })}</span>}
        </section>

        <section className="fz-panel" aria-label={t('Smetadan oshgan qatorlar')}>
          <div className="fz-panel__h"><span>{t('Diqqat: smetadan oshgan ishlar')}</span><span>{diqqat.length}</span></div>
          {diqqat.length === 0
            ? <div className="fz-check"><div className="fz-check__q fz-check__q--ok"><AlertTriangle aria-hidden="true" style={{ visibility: 'hidden' }} /><span>{t('Hech bir qator smeta hajmidan oshmagan')}</span></div></div>
            : <div className="fz-bars">{diqqat.map((d, i) => (
              <div key={i} className="fz-bars__q" title={d.bolim}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{d.kod && <span className="fz-c-shifr" style={{ marginRight: 6 }}>{d.kod}</span>}{d.nom}</span>
                <b className="text-warn" style={{ whiteSpace: 'nowrap', paddingLeft: 8 }}>{Math.round(d.foiz)}%</b>
                <span style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text-mute)' }}><FmtN val={d.faktHajm} /> / <FmtN val={d.smetaHajm} /> {d.birlik ?? ''}</span>
                {/* Birlik xatosi gumoni (masalan «100М3» ga 300): faqat maslahat, hisob o'zgarmaydi. */}
                {(() => { const og = birlikOgohi({ smeta: d.smetaHajm, joriy: 0, rejim: '=', n: d.faktHajm, birlik: d.birlik }); return og?.gumon ? <div style={{ gridColumn: '1 / -1' }}><BirlikOgohBlok ogoh={og} tur="fakt" /></div> : null; })()}
              </div>))}
            </div>}
        </section>
      </div>

      <section className="fz-panel" aria-label={t('Bo‘limlar')}>
        <div className="fz-panel__h"><span>{t('Bo‘limlar kesimi')}</span><span className="flex gap-3"><span><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} /> F2</span><span><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--info)' }} /> {t('fakt')}</span></span></div>
        <div>
          {bolimlar.map((b, i) => (
            <div key={b.id} className="fz-bolim">
              <div className="fz-bolim__nom"><b title={b.nom}>{b.nom || t('Nomsiz bo‘lim')}</b>
                <small>{t('{n} ish', { n: b.ishSoni })} · {t('{n} resurs', { n: b.resursSoni })}{b.oshgan > 0 && <span className="fz-chip fz-chip--warn">{t('{n} oshgan', { n: b.oshgan })}</span>}{b.zamena > 0 && <span className="fz-chip fz-chip--accent">{t('zamena {n}', { n: b.zamena })}</span>}{b.qoshimcha > 0 && <span className="fz-chip fz-chip--accent">{t('qo‘shimcha {n}', { n: b.qoshimcha })}</span>}</small>
              </div>
              <Chiziq k={b} />
              <div className="fz-bolim__sum"><SummaJuft kichik obyektId={obyektId} ustamasiz={b.smeta} katKesim={kartaKesim.bolim[i]} className="items-end text-right" /><small>{t('qoldiq (ustamasiz)')}: <FmtN val={b.qoldiq} kasr={0} /></small></div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
