import { useMemo, type CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import type { NakopitelniyDavr, NakopitelniyJami, NakopitelniyQator } from '../../api/t2-nakopitelniy';
import { katKesimJamiBilan, type KatKesim } from '../../lib/ustamali-summa';
import { foizOl, smetaTaqsimot } from '../../lib/nakopitelniy-korinish';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { summaTuriMatni } from '../../umumiy/ui/qiymatYorliq';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { ayirma2, faktSummaF2Narxda, yigindi2 } from '../../lib/hisob-yadro';

/**
 * Nakopitelniy KPI chizig'i (egasi 2026-10-25: «reestrga qarab vaziyat tushunarli bo'lsin»): har jami — QQS bilan (asosiy, egasi
 * 2026-10-27) + ustamali (QQS siz) + ustamasiz (SummaJuft → QiymatUchlik),
 * pastda smeta = 100% ulush chizig'i: oldingi F2 | shu davr F2 | faktda bor, F2 yo'q | ishlanmagan qoldiq.
 * Hamma qiymat serverdan (jami) — bu yerda faqat ko'rsatish; kategoriya kesimi barg qatorlaridan (ustama hisobi uchun).
 */
export type SmetaNakrutkaKorinish = { pryamye: number; itogo4: number; nds: number; nds_foiz: number | null; vsego: number; /** Kat noma'lum qism bor — «≈». */ taxminiy?: boolean };

const BARG_EMAS = new Set(['rz', 'bl']);
/** Qator fakt summasi — yadro narx qoidasi (F2 bor — F2 birlik narxida). */
const faktQ = (q: NakopitelniyQator) => faktSummaF2Narxda(q.fakt_hajm, q.jami_hajm, q.jami_summa, q.fakt_summa).summa;

export function NakopitelniyKpi({ jami, qatorlar, truncated, obyektId, kompaniyaId, smetaNakrutka, smetaNakrutkaSabab = null, kaskadBor, davr }: {
  jami: NakopitelniyJami; qatorlar: NakopitelniyQator[]; truncated: boolean; obyektId: number; kompaniyaId: number;
  smetaNakrutka: SmetaNakrutkaKorinish | null; kaskadBor: boolean; davr: NakopitelniyDavr | undefined;
  /** Smeta к оплате aniqlanmagan sabab (yadro kirishi yetishmaydi / nakrutka o'qilmadi). null — hisoblanmoqda. */
  smetaNakrutkaSabab?: string | null;
}) {
  // Svod yaxlit (20261113500000): belgili bo'lim avlodlariga ustama qo'llanmaydi; to'liq smeta — server kesimi (svod bilan).
  const ust = useUstamaliSumma(obyektId, { kompaniyaId });
  const { korinishKesimi, obyektKesim } = ust;
  /**
   * Fakt summasi — yadro narx qoidasi (`faktSummaF2Narxda`): tasdiqlangan F2 (с начала) bor qatorda F2 birlik narxida, fakt hajmi
   * yozilganidek. Ro'yxat qirqilgan bo'lsa — server jamisi (qator bo'yicha qayta narxlab bo'lmaydi).
   */
  const ef = useMemo(() => {
    if (truncated) return { fakt: jami.fakt_summa, mumkin: jami.f2_mumkin_summa };
    const b = qatorlar.filter((q) => !BARG_EMAS.has(q.tur));
    return { fakt: yigindi2(b.map(faktQ)), mumkin: yigindi2(b.map((q) => { const f = faktQ(q); return f == null ? null : ayirma2(f, q.jami_summa ?? 0); })) };
  }, [qatorlar, truncated, jami]);
  /** Ustama hisobi kategoriya kesimini talab qiladi; ro'yxat qirqilgan bo'lsa kesim to'liq emas — «ustamali noma'lum» (o'ylab topilmaydi). */
  const kesim = useMemo(() => {
    if (truncated) return null;
    const barglar = qatorlar.filter((q) => !BARG_EMAS.has(q.tur));
    const daraxt = qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id }));
    // Svod bo'limlari eksport bilan bir xil: smeta/fakt — yaxlit × (ko'rinish / smeta); F2 — aynan (masshtablanmaydi).
    const yig = (summa: (q: NakopitelniyQator) => number | null | undefined, sarlavha: number, masshtab = true): KatKesim | null => (korinishKesimi
      ? korinishKesimi(daraxt, barglar, { id: (q) => q.qator_id, kat: (q) => q.kat, summa, smeta: (q) => q.smeta_summa }, { jami: sarlavha, masshtab })
      : katKesimJamiBilan(barglar, (q) => q.kat, summa, sarlavha));
    return {
      smeta: obyektKesim ?? yig((q) => q.smeta_summa, jami.smeta_summa),
      fakt: yig(faktQ, ef.fakt),
      f2: yig((q) => q.jami_summa, jami.jami_tasdiqlangan_summa, false),
      joriy: yig((q) => q.joriy_summa, jami.joriy_tasdiqlangan_summa, false),
      // Fakt − tasdiqlangan F2 (qator bo'yicha ayirma) — F2 aynan bo'lgani uchun masshtablanmaydi.
      // Fakt noma'lum — ayirma ham noma'lum (NULL ≠ 0); tasdiqlangan F2 yo'q — 0 (aynan). Yadro `ayirma2`.
      mumkin: yig((q) => { const f = faktQ(q); return f == null ? null : ayirma2(f, q.jami_summa ?? 0); }, ef.mumkin, false),
    };
  }, [qatorlar, truncated, jami, korinishKesimi, obyektKesim, ef]);

  const taq = smetaTaqsimot({ smeta: jami.smeta_summa, oldingi: jami.oldingi_summa, joriy: jami.joriy_tasdiqlangan_summa, fakt: ef.fakt });
  const faktFoiz = foizOl(ef.fakt, jami.smeta_summa);
  const f2Foiz = foizOl(jami.jami_tasdiqlangan_summa, jami.smeta_summa);
  const qoralama = !!davr && !davr.certified;
  const faktQoldi = Math.max(0, ef.fakt - jami.jami_tasdiqlangan_summa);
  const qolgan = Math.max(0, jami.smeta_summa - Math.max(ef.fakt, jami.jami_tasdiqlangan_summa));
  // Smeta к оплате aniqlanmagan: sabab bo'lsa «не определена» + sabab, aks holda hali hisoblanmoqda.
  const koplateYoq = smetaNakrutkaSabab
    ? <span style={{ color: 'var(--warn)' }} data-testid="smeta-koplate-nomalum">{t('к оплате: не определена')} — {smetaNakrutkaSabab}</span>
    : <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>;
  const sw = (bg: string): CSSProperties => ({ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: bg, flexShrink: 0 });
  const bolak = (w: number): CSSProperties => ({ width: `${Math.max(0, Math.min(100, w))}%` });

  return (
    <section className="fz-card" aria-label={t('Nakopitelniy ko‘rsatkichlari')}>
      <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div className="fz-kpis">
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--border-strong)' }} />{t('Smeta qiymati')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.smeta_summa} katKesim={kesim?.smeta} />
            <span className="fz-kpi__sub">
              {smetaNakrutka ? <>{t('к оплате (nakrutka + QQS)')} · {t('hujjat')}: {smetaNakrutka.taxminiy ? '≈ ' : ''}<FmtN val={smetaNakrutka.vsego} /></> : koplateYoq}
            </span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--info)' }} />{t('Fakt jami')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ef.fakt} katKesim={kesim?.fakt} yorliq={t('Fakt, QQS bilan')} />
            <span className="fz-kpi__sub">{faktFoiz == null ? '—' : t('smetaning {p}%', { p: faktFoiz })}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--accent)' }} />{t('Jami tasdiqlangan F2')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.jami_tasdiqlangan_summa} katKesim={kesim?.f2} yorliq={t('F2, QQS bilan')} />
            <span className="fz-kpi__sub">{f2Foiz == null ? '—' : t('smetaning {p}%', { p: f2Foiz })}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--accent-text)' }} />{t('Shu davr F2')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.joriy_tasdiqlangan_summa} katKesim={kesim?.joriy} yorliq={t('F2, QQS bilan')} />
            <span className="fz-kpi__sub">{qoralama ? <>{t('qoralama (hisobga kirmagan)')}: <FmtN val={jami.joriy_qoralama_summa} /></> : t('oldingi: {x}', { x: Math.round(jami.oldingi_summa).toLocaleString('ru-RU') })} · {summaTuriMatni('ustamasiz')}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: ef.mumkin < 0 ? 'var(--danger)' : 'var(--ok)' }} />{t('Faktdan F2ga mumkin')}</span>
            <span style={{ color: ef.mumkin < 0 ? 'var(--danger)' : undefined }}><SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ef.mumkin} katKesim={kesim?.mumkin} /></span>
            <span className="fz-kpi__sub">{ef.mumkin < 0 ? t('F2 fakt dan oshib ketgan') : t('Fakt − tasdiqlangan F2')}</span>
          </div>
        </div>

        {taq && (
          <div>
            <div className="fz-panel__h" style={{ marginBottom: 6 }}>
              <span>{t('Smeta = 100%: qancha topshirildi, qancha qoldi')} · {summaTuriMatni('ustamasiz')}</span>
              <span>{taq.oshdi ? t('F2 smetadan oshgan: {p}%', { p: Math.round(taq.foiz) }) : t('{p}% F2 bilan topshirilgan', { p: Math.round(taq.foiz) })}</span>
            </div>
            <div className={'fz-meter fz-meter--lg' + (taq.oshdi ? ' fz-meter--over' : '')} role="img"
              aria-label={t('Smeta ulushlari: oldingi F2, shu davr F2, faktda bor, qoldiq')}>
              <div className="fz-meter__t">
                <i className="fz-meter__oldin" style={bolak(taq.oldingi)} />
                <i className="fz-meter__shu" style={bolak(taq.joriy)} />
                <i className="fz-meter__fakt" style={bolak(taq.faktQoldi)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 8, fontSize: 12.5, color: 'var(--text-dim)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={sw('var(--border-strong)')} />{t('oldingi oylar F2')}: <b style={{ color: 'var(--text)' }}><FmtN val={jami.oldingi_summa} /></b></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={sw('var(--accent)')} />{t('shu davr F2')}: <b style={{ color: 'var(--text)' }}><FmtN val={jami.joriy_tasdiqlangan_summa} /></b></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={sw('var(--info)')} />{t('faktda bor, F2 ga kirmagan')}: <b style={{ color: 'var(--text)' }}><FmtN val={faktQoldi} /></b></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={sw('var(--surface-3)')} />{t('ishlanmagan qoldiq')}: <b style={{ color: 'var(--text)' }}><FmtN val={qolgan} /></b></span>
            </div>
          </div>
        )}

        {(smetaNakrutka || !kaskadBor || !!jami.smeta_summa_nomalum) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {smetaNakrutka && <span className="fz-kpi__sub">{t('Farq (nakrutka + QQS)')}: <FmtN val={smetaNakrutka.vsego - smetaNakrutka.pryamye} /></span>}
            {!kaskadBor && <div className="fz-note fz-note--warn"><AlertTriangle />{t('Koeffitsientlar o‘qilmadi — eksportda alohida ogohlantirish beriladi.')}</div>}
            {!!jami.smeta_summa_nomalum && <div className="fz-note fz-note--warn"><AlertTriangle />{t('{n} ta qatorda summa noma’lum', { n: jami.smeta_summa_nomalum })}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
