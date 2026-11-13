import { useMemo, type CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import type { NakopitelniyDavr, NakopitelniyJami, NakopitelniyQator } from '../../api/t2-nakopitelniy';
import { katKesimJamiBilan, type KatKesim } from '../../lib/ustamali-summa';
import { foizOl, nakBarglar, nakFaktJami, nakFaktSumma, smetaTaqsimot } from '../../lib/nakopitelniy-korinish';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { SmetaJamiJuft } from '../../umumiy/ui/SmetaJamiJuft';
import { summaPaket } from '../../lib/summa-paket';
import { smetaJuftlik, smetaNisbat } from '../../lib/smeta-jami';
import { summaTuriMatni } from '../../umumiy/ui/qiymatYorliq';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { ayirma2, yigindi2 } from '../../lib/hisob-yadro';

/**
 * Nakopitelniy KPI chizig'i (egasi 2026-10-25: «reestrga qarab vaziyat tushunarli bo'lsin»): har jami — QQS bilan (asosiy, egasi
 * 2026-10-27) + ustamali (QQS siz) + ustamasiz (SummaJuft → QiymatUchlik),
 * pastda smeta = 100% ulush chizig'i: oldingi F2 | shu davr F2 | faktda bor, F2 yo'q | ishlanmagan qoldiq.
 * Hamma qiymat serverdan (jami) — bu yerda faqat ko'rsatish; kategoriya kesimi barg qatorlaridan (ustama hisobi uchun).
 */
export type SmetaNakrutkaKorinish = { pryamye: number; itogo4: number; nds: number; nds_foiz: number | null; vsego: number; /** Kat noma'lum qism bor — «≈». */ taxminiy?: boolean };

const BARG_EMAS = new Set(['rz', 'bl']);
const faktQ = nakFaktSumma;

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
   * Fakt summasi — sahifadagi YAGONA jami (`nakFaktJami`, jadval pastki qatori va grafik bilan bir xil): barglar F2 narxida.
   * Ro'yxat qirqilgan bo'lsa — server jamisi (qayta narxlanmagan), «≈» bilan.
   */
  const ef = useMemo(() => {
    const f = nakFaktJami(qatorlar, jami.fakt_summa, truncated);
    if (truncated) return { fakt: f.summa, taxminiy: true, mumkin: jami.f2_mumkin_summa };
    return { fakt: f.summa, taxminiy: false, mumkin: yigindi2(nakBarglar(qatorlar).map((q) => { const x = nakFaktSumma(q); return x == null ? null : ayirma2(x, q.jami_summa ?? 0); })) };
  }, [qatorlar, truncated, jami]);  /** Ustama hisobi kategoriya kesimini talab qiladi; ro'yxat qirqilgan bo'lsa kesim to'liq emas — «ustamali noma'lum» (o'ylab topilmaydi). */
  const kesim = useMemo(() => {
    if (truncated) return null;
    const barglar = qatorlar.filter((q) => !BARG_EMAS.has(q.tur));
    const daraxt = qatorlar.map((q) => ({ id: q.qator_id, ota_id: q.ota_id }));
    // Svod bo'limlari eksport bilan bir xil: smeta/fakt — yaxlit × (ko'rinish / smeta); F2 — aynan (masshtablanmaydi).
    const yig = (summa: (q: NakopitelniyQator) => number | null | undefined, sarlavha: number, masshtab = true, f2 = false): KatKesim | null => (korinishKesimi
      ? korinishKesimi(daraxt, barglar, { id: (q) => q.qator_id, kat: (q) => q.kat, summa, smeta: (q) => q.smeta_summa }, { jami: sarlavha, masshtab, f2 })
      : katKesimJamiBilan(barglar, (q) => q.kat, summa, sarlavha));
    return {
      smeta: obyektKesim ?? yig((q) => q.smeta_summa, jami.smeta_summa),
      fakt: yig(faktQ, ef.fakt),
      f2: yig((q) => q.jami_summa, jami.jami_tasdiqlangan_summa, false, true),
      joriy: yig((q) => q.joriy_summa, jami.joriy_tasdiqlangan_summa, false, true),
      // Fakt − tasdiqlangan F2 (qator bo'yicha ayirma) — F2 aynan bo'lgani uchun masshtablanmaydi.
      // Fakt noma'lum — ayirma ham noma'lum (NULL ≠ 0); tasdiqlangan F2 yo'q — 0 (aynan). Yadro `ayirma2`.
      mumkin: yig((q) => { const f = faktQ(q); return f == null ? null : ayirma2(f, q.jami_summa ?? 0); }, ef.mumkin, false),
    };
  }, [qatorlar, truncated, jami, korinishKesimi, obyektKesim, ef]);

  const taq = smetaTaqsimot({ smeta: jami.smeta_summa, oldingi: jami.oldingi_summa, joriy: jami.joriy_tasdiqlangan_summa, fakt: ef.fakt });
  // Smeta jami juftligi (egasi 2026-11-13): asl — katta, joriy — kichik. Server paketi (yo'q bo'lsa eski RPC: asl noma'lum).
  const aslPaket = summaPaket(jami.smeta_asl), joriyPaket = summaPaket(jami.smeta_joriy);
  const juft = smetaJuftlik(aslPaket, jami.smeta_joriy === undefined ? undefined : joriyPaket);
  // Nisbatlar: sukut asos ASL smeta; joriy ≠ asl bo'lsa ikkinchi nisbat ham. Asl yo'q (eski RPC) — joriy asosda, aniq yorliq bilan.
  const aslSumma = aslPaket?.ustamasiz ?? null, joriySumma = joriyPaket?.ustamasiz ?? jami.smeta_summa;
  const nisbatYoz = (surat: number | null | undefined) => {
    const n = aslSumma != null ? smetaNisbat(surat, aslSumma, joriySumma) : null;
    if (!n) { const p = foizOl(surat, jami.smeta_summa); return p == null ? '—' : t('joriy smetaning {p}%', { p }); }
    return n.asl == null ? '—' : <>{t('asl smetaning {p}%', { p: n.asl })}{n.ikkinchiBor && n.joriy != null && <> · {t('joriy smetaning {p}%', { p: n.joriy })}</>}</>;
  };
  const faktFoiz = foizOl(ef.fakt, jami.smeta_summa);
  const f2Foiz = foizOl(jami.jami_tasdiqlangan_summa, jami.smeta_summa);
  const qoralama = !!davr && !davr.certified;
  const faktQoldi = Math.max(0, ef.fakt - jami.jami_tasdiqlangan_summa);
  // Qoldiq = smeta − F2 AYNAN (fakt ≥ F2 qoidasi yo'q). Yadro `ayirma2`.
  const qolgan = ayirma2(jami.smeta_summa, jami.jami_tasdiqlangan_summa) ?? 0;
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
            {aslPaket
              ? <SmetaJamiJuft juft={juft} />
              : <>
                <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.smeta_summa} katKesim={kesim?.smeta} yorliq={t('Joriy smeta (qo‘shimcha ishlar bilan)')} />
                <span className="fz-kpi__sub" data-testid="smeta-asl-yoq">{t('Asl smeta: noma’lum (server yangilanishi kutilmoqda)')}</span>
              </>}
            <span className="fz-kpi__sub">
              {smetaNakrutka ? <>{t('к оплате (nakrutka + QQS)')} · {t('hujjat')}: {smetaNakrutka.taxminiy ? '≈ ' : ''}<FmtN val={smetaNakrutka.vsego} /></> : koplateYoq}
            </span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--info)' }} />{t('Fakt jami')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ef.fakt} katKesim={kesim?.fakt} yorliq={t('Fakt, QQS bilan')} />
            {ef.taxminiy && <span className="fz-kpi__sub" data-testid="fakt-server-taxminiy" title={t('сервер: без пересчёта по цене Ф-2')}>≈ {t('сервер: без пересчёта по цене Ф-2')}</span>}
            <span className="fz-kpi__sub">{faktFoiz == null ? '—' : nisbatYoz(ef.fakt)}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--accent)' }} />{t('Jami tasdiqlangan F2')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.jami_tasdiqlangan_summa} katKesim={kesim?.f2} yorliq={t('F2, QQS bilan')} />
            <span className="fz-kpi__sub">{f2Foiz == null ? '—' : nisbatYoz(jami.jami_tasdiqlangan_summa)}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: 'var(--accent-text)' }} />{t('Shu davr F2')}</span>
            <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.joriy_tasdiqlangan_summa} katKesim={kesim?.joriy} yorliq={t('F2, QQS bilan')} />
            <span className="fz-kpi__sub">{qoralama ? <>{t('qoralama (hisobga kirmagan)')}: <FmtN val={jami.joriy_qoralama_summa} /></> : t('oldingi: {x}', { x: Math.round(jami.oldingi_summa).toLocaleString('ru-RU') })} · {summaTuriMatni('ustamasiz')}</span>
          </div>
          <div className="fz-kpi">
            <span className="fz-kpi__label"><i style={{ background: ef.mumkin < 0 ? 'var(--warn)' : 'var(--ok)' }} />{ef.mumkin < 0 ? t('F2 faktdan oshgan (minus)') : t('Faktdan F2ga mumkin')}</span>
            <span style={{ color: ef.mumkin < 0 ? 'var(--warn)' : undefined }}><SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ef.mumkin} katKesim={kesim?.mumkin} /></span>
            <span className="fz-kpi__sub">{ef.mumkin < 0 ? t('Tasdiqlangan F2 kiritilgan faktdan katta: fakt to‘liq kiritilmagan bo‘lishi mumkin — tekshiring') : t('Fakt − tasdiqlangan F2')}</span>
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={sw('var(--surface-3)')} />{t('qoldiq (smeta − F2)')}: <b style={{ color: 'var(--text)' }}><FmtN val={qolgan} /></b></span>
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
