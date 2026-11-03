/**
 * F2 TAYYORLASH — taqdimot qismlari (Firuza). Sahifa holati va amallari F2TayyorlashNative da qoladi;
 * bu yerda faqat ko'rinish: hujjat sarlavhasi, yagona «Tekshiruv» paneli, kategoriya taqsimoti,
 * ish bo'yicha bajarilish chizig'i (smeta = 100%) va narx manbasi nishoni.
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleSlash, Info, OctagonAlert } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { NARX_MANBA_NOMI, type F2Jami, type NarxManba } from '../../lib/f2-tayyor';
import {
  NARX_MANBA_CHIP, NARX_MANBA_TARTIB, tekshiruvSanoq, type IshMeterQiymat, type TekshiruvBand, type TekshiruvKod, type qoralamaKatTaqsimot,
} from '../../lib/f2-tayyorlash-korinish';

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/** Narx manbasi — bitta kichik nishon (protokol / oldingi F2 / smeta / qo'lda / narxsiz). */
export function NarxManbaChip({ manba, protokol }: { manba: NarxManba; protokol?: string }) {
  const nom = t(NARX_MANBA_NOMI[manba]);
  return <span className={`fz-chip ${NARX_MANBA_CHIP[manba]}`} title={protokol ? `${nom} ${protokol}` : t('Narx manbasi: {m}', { m: nom })} data-testid="narx-manba">{nom}</span>;
}

/** Ish bo'yicha chiziq: tasdiqlangan F2 (kulrang) + boshqa qoralamalar (ko'k) + shu F2 (firuza; oshsa sariq). */
export function IshMeter({ m, birlik }: { m: IshMeterQiymat; birlik: string | null }) {
  const { b } = m;
  if (b.foiz == null) return <span className="fz-meter__f" title={t('Smeta hajmi noma’lum')}>—</span>;
  const izoh = t('Smeta {m} · tasdiqlangan F2 {o} · boshqa qoralamalar {q} · shu F2 {s} · qoldiq {r}', {
    m: fmt(b.smeta), o: fmt(m.tasdiq), q: fmt(m.qoralama), s: fmt(b.shu), r: fmt(b.qoldiq),
  }) + (birlik ? ` ${birlik}` : '');
  return (
    <span className={`fz-meter ${b.oshdi ? 'fz-meter--over' : ''}`} title={izoh} aria-label={izoh}>
      <span className="fz-meter__t">
        <i className="fz-meter__oldin" style={{ width: `${m.tasdiqUlush * 100}%` }} />
        <i style={{ width: `${m.qoralamaUlush * 100}%`, background: 'var(--info)' }} />
        <i className="fz-meter__shu" style={{ width: `${b.shuUlush * 100}%` }} />
      </span>
      <span className="fz-meter__f">{Math.round(b.foiz)}%</span>
    </span>
  );
}

/** Chiziq ranglari izohi (ro'yxat tepasida bir marta). */
export function MeterIzohi() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-mute">
      <span className="inline-flex items-center gap-1"><i className="fz-meter__oldin inline-block h-2 w-3 rounded-sm" />{t('tasdiqlangan F2')}</span>
      <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: 'var(--info)' }} />{t('boshqa qoralamalar')}</span>
      <span className="inline-flex items-center gap-1"><i className="fz-meter__shu inline-block h-2 w-3 rounded-sm" />{t('shu F2')}</span>
      <span>{t('smeta = 100%')}</span>
    </span>
  );
}

/** Qoralama hujjat sarlavhasi: Ф-2 belgisi, raqam + muhr, davr/obyekt/manba, o'ngda jami. */
export function F2QoralamaSarlavha(p: {
  raqam: string; muhr: 'draft' | 'edit' | 'locked'; davr: string; obyekt: string; manba: 'fakt' | 'smeta';
  shartnoma: string | null; ishSoni: number; qatorSoni: number; jami: ReactNode; ostida?: ReactNode;
}) {
  const muhr = p.muhr === 'locked' ? { cls: 'fz-stamp--frozen', nom: t('Qulflangan') } : p.muhr === 'edit' ? { cls: 'fz-stamp--info fz-stamp--draft', nom: t('Qoralama tahriri') } : { cls: 'fz-stamp--draft', nom: t('Qoralama') };
  const manbaNom = p.manba === 'fakt' ? t('Fakt jurnali') : t('Smeta qoldig‘i (faktsiz)');
  return (
    <section className="fz-doc__sheet fz-doc__sheet--draft" aria-label={t('F2 qoralama sarlavhasi')}>
      <div className="fz-doc__top">
        <div style={{ minWidth: 0 }}>
          <div className="fz-doc__eyebrow">{t('Ф-2 · bajarilgan ishlar akti')}</div>
          <h2 className="fz-doc__title">{t('F2 № {r}', { r: p.raqam.trim() || '—' })} <span className={`fz-stamp ${muhr.cls}`}>{muhr.nom}</span></h2>
          <div className="fz-doc__meta">
            <span>{t('Davr')}: <b>{p.davr || '—'}</b></span>
            <span>{t('Obyekt')}: <b>{p.obyekt || '—'}</b></span>
            <span>{t('Hajm manbai')}: <b>{manbaNom}</b></span>
            {p.shartnoma && <span>{t('Shartnoma')}: <b>{p.shartnoma}</b></span>}
            <span>{t('{i} ish · {q} qator', { i: p.ishSoni, q: p.qatorSoni })}</span>
          </div>
        </div>
        <div className="fz-doc__total"><small>{t('Qoralama summasi')}</small>{p.jami}</div>
      </div>
      {p.ostida}
    </section>
  );
}

/** Kategoriya taqsimoti (fz-split) + narx manbalari soni. */
export function F2KatPanel({ kat, manba }: { kat: ReturnType<typeof qoralamaKatTaqsimot>; manba: F2Jami['manba'] }) {
  const manbalar = NARX_MANBA_TARTIB.filter((m) => manba[m] > 0);
  return (
    <section className="fz-panel" aria-label={t('Kategoriyalar')}>
      <div className="fz-panel__h"><span>{t('Kategoriyalar bo‘yicha')}</span><span>{t('ustamasiz')}</span></div>
      {kat.qismlar.length ? <>
        <div className="fz-split" role="img" aria-label={kat.qismlar.map((k) => `${t(KAT_GURUH_NOMI[k.guruh])} ${Math.round(k.ulush * 100)}%`).join(', ')}>
          {kat.qismlar.map((k) => <i key={k.guruh} className={`fz-bg-${k.guruh}`} style={{ flexGrow: Math.max(k.ulush, 0.002) }} />)}
        </div>
        <div className="fz-legend">
          {kat.qismlar.map((k) => (<Fragment key={k.guruh}>
            <i className={`fz-bg-${k.guruh}`} style={{ width: 10, height: 10, borderRadius: 2, display: 'block' }} />
            <span>{t(KAT_GURUH_NOMI[k.guruh])}</span>
            <span className="fz-c-num"><FmtN val={k.summa} kasr={0} /></span>
            <small>{Math.round(k.ulush * 100)}%</small>
          </Fragment>))}
        </div>
      </> : <span className="text-[12px] text-text-mute">{t('Summa hali yo‘q — ish hajmini kiriting')}</span>}
      {kat.summasiz > 0 && <span className="fz-chip fz-chip--warn">{t('{n} ta resursda summa yo‘q', { n: kat.summasiz })}</span>}
      {manbalar.length > 0 && <div className="flex flex-col gap-1.5">
        <span className="fz-panel__h">{t('Narx manbalari')}</span>
        <div className="flex flex-wrap gap-1.5">{manbalar.map((m) => <span key={m} className={`fz-chip ${NARX_MANBA_CHIP[m]}`}>{t(NARX_MANBA_NOMI[m])} · {manba[m]}</span>)}</div>
      </div>}
    </section>
  );
}

const IKON = { bad: OctagonAlert, warn: AlertTriangle, info: Info } as const;

function bandMatni(b: TekshiruvBand): string {
  const n = b.soni;
  const M: Record<TekshiruvKod, () => string> = {
    xato_hajm: () => t('{n} ta qatorda hajm noto‘g‘ri — son bo‘lsin va 0 bo‘lmasin (minus mumkin)', { n }),
    xato_narx: () => t('{n} ta resursda narx yo‘q — narx kiriting yoki narxsiz deb belgilang', { n }),
    xato_summa: () => t('{n} ta qatorda summa son emas', { n }),
    dublikat_blok: () => b.matn ?? '',
    dublikat_ogoh: () => b.matn ?? '',
    smetadan_oshdi: () => t('{n} ta qator smeta hajmidan oshadi', { n }),
    qoldiqdan_oshdi: () => t('{n} ta qator fakt qoldig‘idan oshadi', { n }),
    qoralama_takror: () => t('{n} ta qator boshqa qoralama F2 bilan ikki marta olinadi', { n }),
    resurs_chegara: () => t('{n} ta resurs fakt qoldig‘i bilan cheklandi', { n }),
    arifmetika: () => t('{n} ta qatorda summa hajm × narxdan farq qiladi', { n }),
    aosr: () => t('АОСР yo‘q yashirin ishlar: {n} ta — topshirishda talab qilinadi', { n }),
    uchastka: () => t('Bitta F2 da {n} ta uchastka/fayl aralashgan: {nomlar}', { n, nomlar: (b.nomlar ?? []).join(' · ') }),
    korinmagan: () => t('{n} ta akt qatori joriy ro‘yxatda topilmadi - yangilashda ular aktdan chiqadi.', { n }),
    narxsiz: () => t('{n} ta resurs narxsiz — ИТОГО bo‘sh chiqadi', { n }),
    axborot: () => t('{n} ta axborot qatori narxsiz (smetada narxi yo‘q)', { n }),
    raqamsiz: () => t('F2 raqami kiritilmagan — hujjatda «сформирована в системе» yoziladi'),
    bosh: () => t('Hali birorta ish hajmi kiritilmagan'),
  };
  return M[b.kod]();
}

/** Yagona tekshiruv paneli: hamma xato/ogohlantirish bir joyda, soni bilan; qatorga o'tish va tezkor amal. */
export function F2TekshiruvPanel({ bandlar, onOtish, amal, obyektId, yangilaHref }: {
  bandlar: readonly TekshiruvBand[];
  onOtish: (id: number) => void;
  /** Band uchun qo'shimcha tugma (masalan «narxsiz» belgilash, АОСР yaratish). */
  amal?: (b: TekshiruvBand) => ReactNode;
  obyektId: number;
  yangilaHref: (aktId: number) => string;
}) {
  const { bad: xato, warn: ogoh } = tekshiruvSanoq(bandlar);
  const xatoChip = xato > 0 ? <span className="fz-chip fz-chip--danger">{t('{n} ta to‘siq', { n: xato })}</span> : null;
  const ogohChip = ogoh > 0 ? <span className="fz-chip fz-chip--warn">{t('{n} ta ogohlantirish', { n: ogoh })}</span> : null;
  const tozaChip = !xato && !ogoh ? <span className="fz-chip fz-chip--accent">{t('toza')}</span> : null;
  return (
    <section className="fz-panel" aria-label={t('Tekshiruv')} id="f2-tekshiruv" tabIndex={-1}>
      <div className="fz-panel__h"><span>{t('Tekshiruv')}</span><span className="flex flex-wrap justify-end gap-1 whitespace-nowrap normal-case tracking-normal">{xatoChip}{ogohChip}{tozaChip}</span></div>
      <div className="fz-check">
        {!xato && !ogoh && !bandlar.some((b) => b.kod === 'bosh') && <div className="fz-check__q fz-check__q--ok"><CheckCircle2 aria-hidden="true" /><span>{t('Saqlashni to‘suvchi xato yo‘q')}</span></div>}
        {bandlar.map((b, i) => {
          const Ikon = b.kod === 'narxsiz' || b.kod === 'axborot' ? CircleSlash : IKON[b.daraja];
          const matn = bandMatni(b);
          return (
            <div key={b.kod + i} className={`fz-check__q fz-check__q--${b.daraja === 'info' ? 'ok' : b.daraja}`} data-testid={b.kod === 'uchastka' ? 'uchastka-ogoh' : undefined} data-tekshiruv={b.kod}>
              <Ikon aria-hidden="true" style={b.daraja === 'info' ? { color: 'var(--text-mute)' } : undefined} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span>{matn}</span>
                {b.kod === 'uchastka' && <small className="text-text-mute">{t('Tavsiya: har uchastka/fayl uchun alohida F2 tayyorlang (bloklanmaydi).')}</small>}
                {(b.ids.length > 0 || amal?.(b) || (b.kod === 'dublikat_blok' && !!b.aktIdlar?.length)) && <span className="flex flex-wrap items-center gap-1.5">
                  {b.ids.length > 0 && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => onOtish(b.ids[0])} aria-label={t('Qatorga o‘tish: {m}', { m: matn })}>
                    <ArrowRight aria-hidden="true" />{b.ids.length > 1 ? t('1-chisiga o‘tish') : t('Qatorga o‘tish')}</button>}
                  {amal?.(b)}
                  {b.kod === 'dublikat_blok' && b.aktIdlar?.map((id) => <Link key={id} className="fz-btn fz-btn--sm" to={yangilaHref(id)} target="_blank" rel="noopener noreferrer">{t('Mavjud F2 ni yangilash (akt #{id})', { id })}</Link>)}
                  {b.kod === 'dublikat_blok' && !!b.aktIdlar?.length && <Link className="fz-btn fz-btn--ghost fz-btn--sm" to={`/admin/f2-tarix?obyekt=${obyektId}`} target="_blank" rel="noopener noreferrer">{t('Mavjud F2 tarixini boshqa oynada ochish')}</Link>}
                </span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
