import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { pulBilanYopiladi } from '../../lib/hisob-yadro';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { yigindi2 } from '../../lib/hisob-yadro';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import type { NakopitelniyJami, NakopitelniyQator } from '../../api/t2-nakopitelniy';
import { buildPtoLineLedger } from '../../lib/pto-document-lineage';
import { oylikNuqtalar } from '../../lib/nakopitelniy-grafik';
import { foizOl, nakFaktJami, nakFaktSumma, yashirinIdlar } from '../../lib/nakopitelniy-korinish';
import type { f2OyKesimi } from '../../lib/pto-document-lineage/f3-sources';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';
import type { Daraxt, Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';

/**
 * Kumulyativ reestr jadvali (egasi 2026-10-25): bitta uzluksiz jadval — sticky birinchi ustun va sarlavha, har oy bitta ixcham ustun
 * (summa + ostida hajm), razdel qatori — ajralib turadigan oraliq jami, yig'ish/yoyish; sahifalash o'rniga «yana ko'rsatish».
 * Hisob o'zgarmadi: razdel jami — barg qatorlar yig'indisi (avvalgidek), qoldiq — buildPtoLineLedger.
 */
type OyKesim = ReturnType<typeof f2OyKesimi>;
type RzJami = { smeta: number | null; fakt: number | null; oldingi: number; joriy: number; jami: number; oy: Map<string, number> };

const QADAM = 200;
const jamiHajmSafe = (q: NakopitelniyQator) => q.smeta_hajm ?? 0;
const chap: CSSProperties = { borderLeft: '1px solid var(--border)' };

function Meter({ smeta, oldingi, joriy, jami }: { smeta: number | null | undefined; oldingi: number | null | undefined; joriy: number | null | undefined; jami: number | null | undefined }) {
  const f = foizOl(jami, smeta);
  if (f == null || smeta == null || smeta <= 0) return <span style={{ color: 'var(--text-mute)' }}>—</span>;
  const over = (jami ?? 0) > smeta + 0.005;
  const asos = Math.max(smeta, jami ?? 0);
  const w = (x: number | null | undefined) => `${Math.max(0, Math.min(100, ((x ?? 0) / asos) * 100))}%`;
  return (
    <div className={'fz-meter' + (over ? ' fz-meter--over' : '')} style={{ minWidth: 104 }} title={t('F2 bajarilishi (smeta = 100%): oldingi oylar kulrang, shu davr firuza')}>
      <div className="fz-meter__t"><i className="fz-meter__oldin" style={{ width: w(oldingi) }} /><i className="fz-meter__shu" style={{ width: w(joriy) }} /></div>
      <span className="fz-meter__f">{f}%</span>
    </div>
  );
}

function Pul({ v }: { v: number | null | undefined }) {
  return v == null ? <span style={{ color: 'var(--text-mute)' }}>—</span> : <FmtN val={v} />;
}

/** Katak: asosiy summa + ostida kichik hajm. Qiymat 0/noma'lum — «—». */
function Ikki({ summa, hajm, kasr = 3 }: { summa: number | null | undefined; hajm?: number | null; kasr?: number }) {
  if (!summa) return <span style={{ color: 'var(--text-mute)' }}>—</span>;
  return <>
    <FmtN val={summa} />
    {hajm ? <small style={{ display: 'block', fontSize: 11, lineHeight: '14px', color: 'var(--text-mute)' }}><FmtN val={hajm} kasr={kasr} /></small> : null}
  </>;
}

export function NakopitelniyJadval({ qatorlar, korinadigan, oyKesim, jami, truncated, filtrBor }: {
  qatorlar: NakopitelniyQator[]; korinadigan: NakopitelniyQator[]; oyKesim: OyKesim | null; jami: NakopitelniyJami | null; truncated: boolean; filtrBor: boolean;
}) {
  const [limit, setLimit] = useState(QADAM);
  const [yigilgan, setYigilgan] = useState<Set<number>>(new Set());
  // Qidiruv/ma'lumot almashganda boshiga qaytadi.
  useEffect(() => { setLimit(QADAM); }, [korinadigan]);
  useEffect(() => { setYigilgan(new Set()); }, [qatorlar]);

  /** "Har bir qavatning o'z hisobi" — razdel/blok qatorida smeta / oldingi / joriy / jami summalar (barg qatorlardan yig'iladi). */
  const rzJami = useMemo(() => {
    const otaBor = new Set<number>();
    for (const q of qatorlar) if (q.ota_id != null) otaBor.add(q.ota_id);
    const byId = new Map(qatorlar.map((q) => [q.qator_id, q]));
    const m = new Map<number, RzJami>();
    for (const q of qatorlar) {
      if (q.tur === 'rz' || otaBor.has(q.qator_id)) continue;
      for (let o = q.ota_id != null ? byId.get(q.ota_id) : undefined; o; o = o.ota_id != null ? byId.get(o.ota_id) : undefined) {
        if (o.tur !== 'rz' && o.tur !== 'bl') continue;
        const x = m.get(o.qator_id) ?? { smeta: null, fakt: null, oldingi: 0, joriy: 0, jami: 0, oy: new Map<string, number>() };
        // Yig'indi — yadro ROUND 2 (tiyingacha aynan). Smeta: NULL ≠ 0 (hammasi noma'lum — bo'sh). F2: tasdiqlangan F2 yo'q — 0 (aynan, ishorali).
        if (q.smeta_summa != null) x.smeta = yigindi2([x.smeta, q.smeta_summa]);
        // Fakt pul — yadro narx qoidasi (F2 bor — F2 narxida), sahifadagi boshqa jamilar bilan bir xil. NULL ≠ 0.
        const fs = nakFaktSumma(q); if (fs != null) x.fakt = yigindi2([x.fakt, fs]);
        x.oldingi = yigindi2([x.oldingi, q.oldingi_summa]); x.joriy = yigindi2([x.joriy, q.joriy_summa]); x.jami = yigindi2([x.jami, q.jami_summa]);
        for (const [oy, v] of oyKesim?.qiymat.get(q.qator_id) ?? []) x.oy.set(oy, yigindi2([x.oy.get(oy), v.summa])); // noma'lum (null) — jamiga kirmaydi, qatorning o'zi bo'sh
        m.set(o.qator_id, x);
      }
    }
    return m;
  }, [qatorlar, oyKesim]);

  const oyUstunlar = oyKesim && oyKesim.oylar.length ? oyKesim.oylar : null;
  const oyQ = (id: number, oy: string) => {
    const source = oyKesim?.qiymat.get(id)?.get(oy);
    const sum = rzJami.get(id)?.oy.get(oy);
    return sum == null ? source : { hajm: source?.hajm ?? 0, summa: sum };
  };
  const oyJami = useMemo(() => (oyKesim ? new Map(oylikNuqtalar(oyKesim).map((n) => [n.oy, n])) : null), [oyKesim]);

  const bolalariBor = useMemo(() => { const s = new Set<number>(); for (const q of qatorlar) if (q.ota_id != null) s.add(q.ota_id); return s; }, [qatorlar]);
  const yashirin = useMemo(() => yashirinIdlar(qatorlar, yigilgan), [qatorlar, yigilgan]);

  /* Excel uslubidagi ustun filtrlari (egasi 2026-10-27). Faqat ish/resurs qatorlari filtrlanadi; mos qatorning
   * razdel/bloki ham ko'rinadi (daraxt buzilmaydi). */
  const daraxt = useMemo<Daraxt<NakopitelniyQator>>(() => ({ id: (q) => q.qator_id, ota: (q) => q.ota_id, barg: (q) => q.tur !== 'rz' && !bolalariBor.has(q.qator_id) }), [bolalariBor]);
  const ustunlar = useMemo<Ustun<NakopitelniyQator>[]>(() => {
    const led = (q: NakopitelniyQator) => buildPtoLineLedger({ lineId: q.qator_id, baselineQuantity: q.smeta_hajm, baselineUnitPrice: q.smeta_narx, baselineAmount: q.smeta_summa,
      factQuantity: q.fakt_hajm, factAmount: nakFaktSumma(q), previousApprovedQuantity: q.oldingi_hajm, previousApprovedAmount: q.oldingi_summa,
      currentApprovedQuantity: q.joriy_hajm, currentApprovedAmount: q.joriy_summa, approvedF2Quantity: q.jami_hajm, approvedF2Amount: q.jami_summa });
    const u: Ustun<NakopitelniyQator>[] = [
      { kalit: 'kod', nom: t('Shifr'), tur: 'matn', qiymat: (q) => q.kod },
      { kalit: 'nom', nom: t('Ish'), tur: 'matn', qiymat: (q) => q.nom },
      { kalit: 'birlik', nom: t('Birlik'), tur: 'matn', qiymat: (q) => q.birlik },
      { kalit: 'hajm', nom: t('Smeta hajmi'), tur: 'son', qiymat: (q) => q.smeta_hajm },
      { kalit: 'narx', nom: t('Narx'), tur: 'son', qiymat: (q) => q.smeta_narx },
      { kalit: 'summa', nom: t('Smeta summasi'), tur: 'son', qiymat: (q) => q.smeta_summa },
      { kalit: 'fakt', nom: t('Fakt hajm'), tur: 'son', qiymat: (q) => q.fakt_hajm },
      { kalit: 'f2', nom: t('F2 jami (tasdiqlangan)'), tur: 'son', qiymat: (q) => q.jami_summa },
      { kalit: 'foiz', nom: t('Bajarilish'), tur: 'son', qiymat: (q) => foizOl(q.jami_summa, q.smeta_summa) },
      { kalit: 'qoldi', nom: t('Smetadan qoldi'), tur: 'son', qiymat: (q) => led(q).smetaRemainingQuantity },
      { kalit: 'f2ga', nom: t('F2 ga olish mumkin'), tur: 'son', qiymat: (q) => led(q).f2AvailableQuantity },
      { kalit: 'shartnoma', nom: t('Shartnomadan qoldi'), tur: 'son', qiymat: (q) => led(q).contractualRemainingQuantity },
    ];
    for (const oy of oyKesim?.oylar ?? []) u.push({ kalit: 'oy:' + oy, nom: davrNomi(oy, tilLocale()), tur: 'son', qiymat: (q) => oyKesim?.qiymat.get(q.qator_id)?.get(oy)?.summa });
    if (!oyKesim?.oylar.length) {
      u.push({ kalit: 'oldingi', nom: t('Oldingi F2'), tur: 'son', qiymat: (q) => q.oldingi_summa });
      u.push({ kalit: 'joriy', nom: t('Joriy F2'), tur: 'son', qiymat: (q) => q.joriy_summa });
    }
    return u;
  }, [oyKesim]);
  const f = useJadvalFiltr(korinadigan, ustunlar, daraxt);
  const F = (kalit: string) => <UstunFiltrTugma {...f.tugma(kalit)} />;
  const korinar = useMemo(() => (yigilgan.size ? f.natija.filter((q) => !yashirin.has(q.qator_id)) : f.natija), [f.natija, yashirin, yigilgan]);
  const qatorlarKorinadi = korinar.slice(0, limit);
  const yigiladigan = useMemo(() => qatorlar.filter((q) => q.tur === 'rz' && bolalariBor.has(q.qator_id)).map((q) => q.qator_id), [qatorlar, bolalariBor]);
  const almashtir = (id: number) => setYigilgan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const locale = tilLocale();
  const oyNomi = (oy: string) => davrNomi(oy, locale);
  const oxirgiOy = oyUstunlar ? oyUstunlar[oyUstunlar.length - 1] : null;
  const oyKenglik = 116;
  const thG = (rang: string): CSSProperties => ({ top: 0, height: 26, textAlign: 'center', fontSize: 10.5, borderBottom: `2px solid ${rang}`, ...chap });
  const th2: CSSProperties = { top: 26, height: 30, textAlign: 'right' };
  const stickyTh: CSSProperties = { left: 0, zIndex: 3, minWidth: 'clamp(170px, 18vw, 250px)', textAlign: 'left' };

  const hdr = (matn: string, izoh: string): ReactNode => <span title={izoh}>{matn}</span>;

  const bosh = (q: NakopitelniyQator): CSSProperties => ({ paddingLeft: 12 + Math.max(0, q.daraja ?? 0) * 16 });

  const rowQ = (q: NakopitelniyQator) => {
    const blok = q.tur === 'rz' || q.tur === 'bl';
    const sum = blok ? rzJami.get(q.qator_id) : undefined;
    const amount = sum ? { smeta: sum.smeta, oldingi: sum.oldingi, joriy: sum.joriy, jami: sum.jami } : { smeta: q.smeta_summa, oldingi: q.oldingi_summa, joriy: q.joriy_summa, jami: q.jami_summa };
    const ochiqmi = !yigilgan.has(q.qator_id);
    const tugma = q.tur === 'rz' && bolalariBor.has(q.qator_id) ? (
      <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" style={{ width: 22, height: 22, marginRight: 4 }}
        aria-expanded={ochiqmi} aria-label={ochiqmi ? t('Bo‘limni yig‘ish') : t('Bo‘limni yoyish')} onClick={() => almashtir(q.qator_id)}>
        {ochiqmi ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    ) : null;

    if (q.tur === 'rz') {
      const x = rzJami.get(q.qator_id);
      return (
        <tr key={q.qator_id} className="fz-row-rz" style={{ background: 'var(--surface-2)' }}>
          <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'inherit', ...bosh(q) }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{tugma}{q.nom}</span>
          </td>
          <td /><td style={chap} /><td />
          <td className="fz-c-num"><Pul v={x?.smeta} /></td>
          <td style={chap} />
          <td className="fz-c-num" style={chap}>{x?.jami ? <FmtN val={x.jami} /> : '—'}</td>
          <td><Meter smeta={x?.smeta} oldingi={x?.oldingi} joriy={x?.joriy} jami={x?.jami} /></td>
          <td style={chap} /><td /><td />
          {oyUstunlar ? oyUstunlar.map((oy, i) => <td key={oy} className="fz-c-num" style={i === 0 ? chap : undefined}>{x?.oy.get(oy) ? <FmtN val={x.oy.get(oy)!} /> : '—'}</td>) : <>
            <td className="fz-c-num" style={chap}>{x?.oldingi ? <FmtN val={x.oldingi} /> : '—'}</td>
            <td className="fz-c-num">{x?.joriy ? <FmtN val={x.joriy} /> : '—'}</td>
          </>}
        </tr>
      );
    }
    const ledger = buildPtoLineLedger({
      lineId: q.qator_id,
      baselineQuantity: q.smeta_hajm,
      baselineUnitPrice: q.smeta_narx,
      baselineAmount: amount.smeta,
      factQuantity: q.fakt_hajm,
      factAmount: sum ? sum.fakt : nakFaktSumma(q),
      previousApprovedQuantity: q.oldingi_hajm,
      previousApprovedAmount: amount.oldingi,
      currentApprovedQuantity: q.joriy_hajm,
      currentApprovedAmount: amount.joriy,
      approvedF2Quantity: q.jami_hajm,
      approvedF2Amount: amount.jami,
    });
    const rang = q.tur === 'bl' ? 'fz-row-bl' : 'fz-row-res';
    return (
      <tr key={q.qator_id} className={rang} style={{ background: 'var(--surface)' }}>
        <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'inherit', ...bosh(q), maxWidth: 'clamp(200px, 24vw, 420px)' }} title={q.ozgarish_izoh || q.kod || ''}>
          {q.kod ? <span className="fz-c-shifr" style={{ marginRight: 6 }}>{q.kod}</span> : null}{q.nom}
          {q.ozgarish_izoh && <span className="fz-chip fz-chip--accent" style={{ marginLeft: 6 }}>{q.zamena ? t('zamena') : t('qo‘shimcha')}</span>}
        </td>
        <td className="fz-c-unit" style={{ textAlign: 'center' }}>{q.birlik || '—'}{(q.pul_bilan ?? pulBilanYopiladi(q.birlik, q.smeta_narx)) && <span className="fz-chip fz-chip--accent" style={{ marginLeft: 4 }} data-testid="pul-bilan-belgi" title={t('Pul bo‘yicha yopiladigan ish: hajm va narx farqi qo‘llanmaydi, bajarilish — yopilgan pul foizi')}>{t('Pul bo‘yicha')}</span>}</td>
        <td className="fz-c-num" style={chap}><FmtN val={jamiHajmSafe(q)} kasr={3} /></td>
        <td className="fz-c-num">{q.smeta_narx == null ? '—' : <FmtN val={q.smeta_narx} />}</td>
        <td className="fz-c-num">{amount.smeta == null ? '—' : <FmtN val={amount.smeta} />}</td>
        <td className="fz-c-num" style={chap}>{q.fakt_hajm ? <FmtN val={q.fakt_hajm} kasr={3} /> : '—'}</td>
        <td className="fz-c-num" style={chap}><Ikki summa={amount.jami} hajm={q.jami_hajm} /></td>
        <td><Meter smeta={amount.smeta} oldingi={amount.oldingi} joriy={amount.joriy} jami={amount.jami} /></td>
        <td className="fz-c-num" style={chap}>{ledger.smetaRemainingQuantity == null ? '—' : <FmtN val={ledger.smetaRemainingQuantity} kasr={3} />}</td>
        <td className={'fz-c-num' + (ledger.overCertified ? ' fz-over' : '')} style={ledger.overCertified ? { color: 'var(--danger)' } : undefined}>{ledger.f2AvailableQuantity == null ? '—' : <FmtN val={ledger.f2AvailableQuantity} kasr={3} />}</td>
        <td className="fz-c-num">{ledger.contractualRemainingQuantity == null ? '—' : <FmtN val={ledger.contractualRemainingQuantity} kasr={3} />}</td>
        {oyUstunlar ? oyUstunlar.map((oy, i) => { const x = oyQ(q.qator_id, oy); return (
          <td key={oy} className="fz-c-num" style={i === 0 ? chap : undefined}><Ikki summa={x?.summa} hajm={x?.hajm} /></td>
        ); }) : <>
          <td className="fz-c-num" style={chap}><Ikki summa={amount.oldingi} hajm={q.oldingi_hajm} /></td>
          <td className="fz-c-num"><Ikki summa={amount.joriy} hajm={q.joriy_hajm} /></td>
        </>}
      </tr>
    );
  };

  // Pastki qator fakt jami — KPI va grafik bilan bitta manba (nakFaktJami).
  const faktJami = jami ? nakFaktJami(qatorlar, jami.fakt_summa, truncated) : { summa: 0, taxminiy: false };
  const jamiQator = jami && (
    <tr className="fz-row-total" style={{ background: 'var(--surface-2)' }}>
      <td style={{ position: 'sticky', left: 0, bottom: 0, zIndex: 2, background: 'var(--surface-2)' }}>{t('JAMI — butun smeta (ustamasiz)')}</td>
      <td style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} /><td style={{ ...chap, position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} /><td style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} />
      <td className="fz-c-num" style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}><FmtN val={jami.smeta_summa} /></td>
      <td className="fz-c-num" style={{ ...chap, position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}>{faktJami.taxminiy ? <span title={t('сервер: без пересчёта по цене Ф-2')}>≈ </span> : null}<FmtN val={faktJami.summa} /></td>
      <td className="fz-c-num" style={{ ...chap, position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}><FmtN val={jami.jami_tasdiqlangan_summa} /></td>
      <td style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}><Meter smeta={jami.smeta_summa} oldingi={jami.oldingi_summa} joriy={jami.joriy_tasdiqlangan_summa} jami={jami.jami_tasdiqlangan_summa} /></td>
      <td style={{ ...chap, position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} /><td style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} /><td style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }} />
      {oyUstunlar ? oyUstunlar.map((oy, i) => { const n = oyJami?.get(oy); return (
        <td key={oy} className="fz-c-num" style={{ ...(i === 0 ? chap : {}), position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}>
          {n ? <><FmtN val={n.summa} />{n.nomalum ? <span style={{ color: 'var(--warn)' }} title={t('summasi noma’lum qatorlar bor')}> ?</span> : null}</> : '—'}
        </td>
      ); }) : <>
        <td className="fz-c-num" style={{ ...chap, position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}><FmtN val={jami.oldingi_summa} /></td>
        <td className="fz-c-num" style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)' }}><FmtN val={jami.joriy_tasdiqlangan_summa} /></td>
      </>}
    </tr>
  );

  const izohlar: Array<[string, string]> = [
    [t('Smeta'), t('Shartnoma (smeta) bo‘yicha reja: hajm, narx va summa.')],
    [t('Fakt'), t('Haqiqatda bajarilgan hajm (fakt jurnalidan). Hali F2 ga kirmagan bo‘lishi mumkin.')],
    [t('Oy ustuni'), t('Shu oyda TASDIQLANGAN F2 bo‘yicha summa; ostida hajm. Qoralama F2 bu yerga kirmaydi.')],
    [t('F2 jami'), t('Barcha tasdiqlangan oylar yig‘indisi. Yonidagi chiziq — smetaning necha foizi topshirilgani.')],
    [t('Smetadan qoldi'), t('Smeta hajmi − fakt hajmi: hali bajarilmagan qism.')],
    [t('F2 ga olish mumkin'), t('Fakt hajmi − tasdiqlangan F2 hajmi: bajarilgan, lekin aktga kiritilmagan qism. Qizil — F2 faktdan oshib ketgan.')],
    [t('Shartnomadan qoldi'), t('Shartnoma (tasdiqlangan o‘zgarishlar bilan) hajmi − tasdiqlangan F2 hajmi.')],
  ];

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-label={t('Kumulyativ reestr')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ font: '600 15px/22px var(--font-display)', margin: 0 }}>{t('Kumulyativ reestr — tasdiqlangan F2 oyma-oy')}</h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)' }}>{t('Razdel qatorida — uning ichidagi barcha ishlar jami. Faqat tasdiqlangan F2 hisobga kiradi.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {yigiladigan.length > 0 && <>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => setYigilgan(new Set(yigiladigan))}><ChevronsDownUp />{t('Bo‘limlarni yig‘ish')}</button>
            <button type="button" className="fz-btn fz-btn--sm" disabled={!yigilgan.size} onClick={() => setYigilgan(new Set())}><ChevronsUpDown />{t('Hammasini yoyish')}</button>
          </>}
        </div>
      </div>

      <FiltrHolatQatori soni={f.soni} natija={f.natija.filter(daraxt.barg!).length} jami={korinadigan.filter(daraxt.barg!).length} tozala={f.tozala} />
      <div className="fz-table-wrap" style={{ maxHeight: 'max(320px, calc(100dvh - 150px))' }}>
        <table className="fz-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...stickyTh, top: 0 }}>{t('Shifr')}{F('kod')} · {t('Ish')}{F('nom')}</th>
              <th rowSpan={2} style={{ top: 0, textAlign: 'center' }}>{t('Birlik')}{F('birlik')}</th>
              <th colSpan={3} style={thG('var(--border-strong)')}>{hdr(t('Smeta'), t('Shartnoma (smeta) bo‘yicha reja: hajm, narx va summa.'))}</th>
              <th rowSpan={2} className="fz-c-num" style={{ top: 0, textAlign: 'right', ...chap }}>{hdr(t('Fakt hajm'), t('Haqiqatda bajarilgan hajm (fakt jurnalidan). Hali F2 ga kirmagan bo‘lishi mumkin.'))}{F('fakt')}</th>
              <th colSpan={2} style={thG('var(--accent)')}>{oyUstunlar ? t('F2 jami (barcha oylar)') : t('F2 jami (tasdiqlangan)')}</th>
              <th colSpan={3} style={thG('var(--info)')}>{t('Qoldiq (hajm)')}</th>
              {oyUstunlar
                ? <th colSpan={oyUstunlar.length} style={thG('var(--accent)')}>{t('Tasdiqlangan F2 — oylar bo‘yicha')}</th>
                : <th colSpan={2} style={thG('var(--accent)')}>{t('Tasdiqlangan F2')}</th>}
            </tr>
            <tr>
              <th className="fz-c-num" style={{ ...th2, ...chap }}>{t('Hajm')}{F('hajm')}</th><th className="fz-c-num" style={th2}>{t('Narx')}<SummaYorliq tur="narx" />{F('narx')}</th><th className="fz-c-num" style={th2}>{t('Summa')}{F('summa')}</th>
              <th className="fz-c-num" style={{ ...th2, ...chap }}>{t('Summa')}{F('f2')}</th><th style={{ ...th2, textAlign: 'left' }}>{t('Bajarilish')}{F('foiz')}</th>
              <th className="fz-c-num" style={{ ...th2, ...chap }}>{hdr(t('Smetadan qoldi'), t('Smeta hajmi − fakt hajmi: hali bajarilmagan qism.'))}{F('qoldi')}</th>
              <th className="fz-c-num" style={th2}>{hdr(t('F2 ga olish mumkin'), t('Fakt hajmi − tasdiqlangan F2 hajmi: bajarilgan, lekin aktga kiritilmagan qism. Qizil — F2 faktdan oshib ketgan.'))}{F('f2ga')}</th>
              <th className="fz-c-num" style={th2}>{hdr(t('Shartnomadan qoldi'), t('Shartnoma (tasdiqlangan o‘zgarishlar bilan) hajmi − tasdiqlangan F2 hajmi.'))}{F('shartnoma')}</th>
              {oyUstunlar ? oyUstunlar.map((oy, i) => (
                <th key={oy} className="fz-c-num" style={{ ...th2, minWidth: oyKenglik, ...(i === 0 ? chap : {}), color: oy === oxirgiOy ? 'var(--accent-text)' : undefined }}
                  title={oy === oxirgiOy ? t('hisobot davri') : undefined}>
                  {oyNomi(oy)}{F('oy:' + oy)}
                </th>
              )) : <>
                <th className="fz-c-num" style={{ ...th2, ...chap }}>{t('Oldingi F2')}{F('oldingi')}</th><th className="fz-c-num" style={th2}>{t('Joriy F2')}{F('joriy')}</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {qatorlarKorinadi.map((q) => <Fragment key={q.qator_id}>{rowQ(q)}</Fragment>)}
            {!qatorlarKorinadi.length && <tr><td colSpan={99} style={{ color: 'var(--text-mute)' }}>{filtrBor || f.soni ? t('Qidiruv bo‘yicha qator topilmadi.') : t('Ko‘rsatiladigan qator yo‘q.')}</td></tr>}
            {korinar.length <= limit && !filtrBor && !f.soni && jamiQator}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', fontSize: 12, color: 'var(--text-dim)' }}>
        <span>{truncated ? t('Ekranda {n} ta qator (to‘liq emas); Excel hujjatlari barcha qatorlar bilan tuziladi.', { n: qatorlar.length }) : t('Ko‘rsatilgan: {a} / {b}', { a: Math.min(limit, korinar.length), b: korinar.length })}</span>
        {limit < korinar.length && <>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => setLimit((l) => l + QADAM)}>{t('Yana {n} tasini ko‘rsatish', { n: Math.min(QADAM, korinar.length - limit) })}</button>
          <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost" onClick={() => setLimit(korinar.length)}>{t('Hammasini ko‘rsatish')}</button>
        </>}
      </div>

      <details className="fz-panel" style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('Ustunlar nimani bildiradi?')}</summary>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 24px', margin: '12px 0 0' }}>
          {izohlar.map(([k, v]) => (
            <div key={k}><dt style={{ fontWeight: 600, color: 'var(--text)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--text-dim)', fontSize: 12.5 }}>{v}</dd></div>
          ))}
        </dl>
      </details>
    </section>
  );
}

