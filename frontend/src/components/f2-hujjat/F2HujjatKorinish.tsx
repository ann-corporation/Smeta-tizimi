import { Fragment, useMemo, type ReactNode } from 'react';
import { KatDonut, BolimBajarilishPanel } from './F2Diagramma';
import { OsuvchiI } from './OsuvchiI';
import { AlertTriangle, CheckCircle2, CircleSlash, FileQuestion, Repeat, Sigma } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t, tilLocale } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { katKesimYigish } from '../../lib/ustamali-summa';
import type { F2IerQator } from '../../lib/f2-ierarxiya';
import type { PtoLifecycleStatus } from '../../api/t2-akt-lifecycle';
import type { F2TasdiqRejimi } from '../../lib/f2-lifecycle-workflow';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';
import {
  bolimBajarilish, bolimJamilari, davrNomi, f2BirlikNarx, f2Miqdor, f2Pul, f2Tekshiruv, hajmXaritasi, katTaqsimot,
  KAT_GURUH_NOMI, oldingiTasdiqlanganAktlar, qatorBajarilish, type F2KorQator, type QatorBajarilish,
} from '../../lib/f2-hujjat-korinish';
import type { Daraxt, Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import { hujjatDaraxti, hujjatQatorlar, korinadiganJami, type HujjatQator } from './f2HujjatFiltr';

/**
 * F2 ni HUJJAT sifatida ko'rsatadi (egasi 2026-10-25): sarlavha varag'i, tasdiqlash yo'li, kategoriya taqsimoti,
 * bo'limlar, tekshiruv ro'yxati va har qatorda «smeta = 100%» ga nisbatan oldin olingan + shu hujjat chizig'i.
 * Hisoblar faqat yuklangan ma'lumotdan (lib/f2-hujjat-korinish) — summa qayta hisoblanmaydi.
 */
type Line = F2KorQator & { akt_qator_id: number; kod: string | null; nom: string | null; birlik: string | null; akt_kim?: string | null; akt_sana?: string | null };
type Akt = { id: number; raqam: string | null; oy: string; holat: string; hujjat_jami: number | null; yozilgan_jami: number; qator_soni: number | null };

const DARAXT: Daraxt<HujjatQator<Line>> = hujjatDaraxti();

const STAMP: Record<PtoLifecycleStatus, string> = {
  draft: 'fz-stamp--draft', submitted: 'fz-stamp--info', checked: 'fz-stamp--info', approved: 'fz-stamp--frozen',
  rejected: 'fz-stamp--danger', cancelled: 'fz-stamp--danger', superseded: '',
};

function Yol({ status, rejim, kim, sana }: { status: PtoLifecycleStatus; rejim: F2TasdiqRejimi; kim?: string | null; sana?: string | null }) {
  const qadamlar: { id: string; nom: string }[] = rejim === 'shaxsiy'
    ? [{ id: 'draft', nom: 'Qoralama' }, { id: 'approved', nom: 'Yakunlangan (shaxsiy)' }]
    : [{ id: 'draft', nom: 'Qoralama' }, { id: 'submitted', nom: 'Tekshirishga yuborilgan' }, { id: 'checked', nom: 'Tekshirilgan' }, { id: 'approved', nom: 'Tasdiqlangan' }];
  const tartib = rejim === 'shaxsiy' ? ['draft', 'approved'] : ['draft', 'submitted', 'checked', 'approved'];
  const yomon = status === 'rejected' || status === 'cancelled';
  const idx = yomon ? 0 : status === 'superseded' ? tartib.length - 1 : Math.max(0, tartib.indexOf(status));
  const korinadi = yomon ? [qadamlar[0], { id: status, nom: status === 'rejected' ? 'Rad etilgan' : 'Bekor qilingan' }] : qadamlar;
  return (
    <div className="fz-yol" aria-label={t('Tasdiqlash yo‘li')}>
      {korinadi.map((q, i) => {
        const cls = yomon ? (i === 0 ? 'fz-yol__q--done' : 'fz-yol__q--bad') : i < idx || (i === idx && status === 'approved') ? 'fz-yol__q--done' : i === idx ? 'fz-yol__q--now' : '';
        return (
          <div key={q.id} className={`fz-yol__q ${cls}`}>
            <span className="fz-yol__nuqta" aria-hidden="true" />
            <span className="fz-yol__nom">{t(q.nom)}</span>
            {i === 0 && (kim || sana) && <span className="fz-yol__izoh">{[kim, sana?.slice(0, 10)].filter(Boolean).join(' · ')}</span>}
            {i === idx && !yomon && status !== 'approved' && <span className="fz-yol__izoh">{t('hozir shu bosqichda')}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Meter({ b }: { b: QatorBajarilish }) {
  if (b.foiz == null) return <span className="fz-meter__f" title={t('Smeta hajmi noma’lum')}>—</span>;
  return (
    <span className={`fz-meter ${b.oshdi ? 'fz-meter--over' : ''}`} title={t('Oldin olingan: {o} · shu F2: {s} · smeta: {m}', { o: fmt(b.oldin), s: fmt(b.shu), m: fmt(b.smeta) })}>
      <span className="fz-meter__t"><OsuvchiI ulush={b.oldinUlush} className="fz-meter__oldin" /><OsuvchiI ulush={b.shuUlush} className="fz-meter__shu" kechikish={0.08} /></span>
      <span className="fz-meter__f">{Math.round(b.foiz)}%</span>
    </span>
  );
}
const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export function F2HujjatKorinish(p: {
  akt: Akt; status: PtoLifecycleStatus; rejim: F2TasdiqRejimi; holatYorligi: string;
  obyektId: number; obyektNom: string;
  lines: readonly Line[]; barchaQatorlar: readonly Line[]; aktlar: readonly Akt[];
  ierarxiya: readonly F2IerQator<Line>[];
  smetaHajm: ReadonlyMap<number, number | null>;
  amallar?: ReactNode; ostida?: ReactNode;
}) {
  const { akt, lines } = p;
  const oldin = useMemo(() => hajmXaritasi(p.barchaQatorlar, oldingiTasdiqlanganAktlar(p.aktlar, akt)), [p.barchaQatorlar, p.aktlar, akt]);
  const shu = useMemo(() => hajmXaritasi(lines, new Set([akt.id])), [lines, akt.id]);
  const kat = useMemo(() => katTaqsimot(lines), [lines]);
  const bolimlar = useMemo(() => bolimJamilari(p.ierarxiya), [p.ierarxiya]);
  const belgilar = useMemo(() => new Map(p.ierarxiya.map((q) => [q.qator_id, { zamena: q.zamena, qoshimcha: q.qoshimcha }])), [p.ierarxiya]);
  const tek = useMemo(() => f2Tekshiruv({ lines, smetaHajm: p.smetaHajm, oldin, belgilar }), [lines, p.smetaHajm, oldin, belgilar]);
  const katKesim = useMemo(() => katKesimYigish(lines, (l) => l.kat, f2Pul), [lines]);
  const bolimBaj = useMemo(() => bolimBajarilish(p.ierarxiya, (id) => qatorBajarilish(p.smetaHajm.get(id) ?? null, oldin.get(id) ?? 0, shu.get(id) ?? 0)), [p.ierarxiya, p.smetaHajm, oldin, shu]);
  const qatorlarJami = kat.jami;
  const birinchi = lines[0];
  const farq = akt.hujjat_jami != null ? akt.hujjat_jami - akt.yozilgan_jami : null;
  const bajar = (id: number) => qatorBajarilish(p.smetaHajm.get(id) ?? null, oldin.get(id) ?? 0, shu.get(id) ?? 0);
  /* Excel uslubidagi ustun filtrlari (egasi 2026-10-27) — faqat ekrandagi jadval; Excel/rasmiy hujjat chiqishi o'zgarmaydi.
   * Faqat hujjat qatorlari filtrlanadi, mos qatorning bo'lim/bloki ko'rinadi. Smeta/oldin/bajarilish — smeta qatori bo'yicha
   * (bitta smeta qatoridagi barcha hujjat qatorlariga bir xil). */
  const tekis = useMemo(() => hujjatQatorlar(p.ierarxiya), [p.ierarxiya]);
  const ustunlar = useMemo<Ustun<HujjatQator<Line>>[]>(() => {
    const bj = (r: HujjatQator<Line>) => qatorBajarilish(p.smetaHajm.get(r.q.qator_id) ?? null, oldin.get(r.q.qator_id) ?? 0, shu.get(r.q.qator_id) ?? 0);
    return [
      { kalit: 'kod', nom: t('Shifr'), tur: 'matn', qiymat: (r) => r.line?.kod },
      { kalit: 'nom', nom: t('Bo‘lim / ish / resurs'), tur: 'matn', qiymat: (r) => r.line ? r.line.nom || t('Nomsiz qator') : r.q.nom },
      { kalit: 'birlik', nom: t('Birlik'), tur: 'matn', qiymat: (r) => r.line?.birlik },
      { kalit: 'smeta', nom: t('Smeta'), tur: 'son', qiymat: (r) => bj(r).smeta },
      { kalit: 'oldin', nom: t('Oldin olingan'), tur: 'son', qiymat: (r) => bj(r).oldin },
      { kalit: 'shu', nom: t('Shu F2'), tur: 'son', qiymat: (r) => (r.line ? f2Miqdor(r.line) : null) },
      { kalit: 'foiz', nom: t('Bajarilish'), tur: 'son', qiymat: (r) => { const f = bj(r).foiz; return f == null ? null : Math.round(f); } },
      { kalit: 'narx', nom: t('Narx'), tur: 'son', qiymat: (r) => (r.line ? f2BirlikNarx(r.line) : null) },
      { kalit: 'summa', nom: t('Summa'), tur: 'son', qiymat: (r) => (r.line ? f2Pul(r.line) : null) },
    ];
  }, [p.smetaHajm, oldin, shu]);
  const f = useJadvalFiltr(tekis, ustunlar, DARAXT);
  const F = (kalit: string) => <span className="print:hidden"><UstunFiltrTugma {...f.tugma(kalit)} /></span>;
  const filtrJami = useMemo(() => korinadiganJami(f.natija, f2Pul), [f.natija]);
  const filtrQatorSoni = filtrJami.soni;
  const varaqCls = p.status === 'draft' || p.status === 'submitted' || p.status === 'checked' ? 'fz-doc__sheet--draft' : p.status === 'rejected' || p.status === 'cancelled' ? 'fz-doc__sheet--danger' : '';

  const tekQator = (holat: 'ok' | 'warn' | 'bad', Ikon: typeof CheckCircle2, matn: string) => (
    <div className={`fz-check__q fz-check__q--${holat}`}><Ikon aria-hidden="true" /><span>{matn}</span></div>
  );
  const tozami = !tek.arifmetik && !tek.oshgan && !tek.narxsiz && !tek.topilmagan && !tek.manfiy && (farq == null || Math.abs(farq) < 1);

  return (
    <article className="fz-doc" aria-label={t('F2 hujjati')}>
      <section className={`fz-doc__sheet ${varaqCls}`}>
        <div className="fz-doc__top">
          <div style={{ minWidth: 0 }}>
            <div className="fz-doc__eyebrow">{t('Ф-2 · bajarilgan ishlar akti')}</div>
            <h2 className="fz-doc__title">F2 № {akt.raqam || '—'} <span className={`fz-stamp ${STAMP[p.status] ?? ''}`}>{t(p.holatYorligi)}</span></h2>
            <div className="fz-doc__meta">
              <span>{t('Davr')}: <b>{davrNomi(akt.oy, tilLocale()) || t('noma’lum')}</b></span>
              <span>{t('Obyekt')}: <b>{p.obyektNom || '—'}</b></span>
              <span>{t('{n} ta hujjat qatori', { n: lines.length })}</span>
              {birinchi?.akt_kim && <span>{t('Tuzgan')}: <b>{birinchi.akt_kim}</b></span>}
            </div>
          </div>
          <div className="fz-doc__total">
            <small>{t('Hujjat summasi')}</small>
            <SummaJuft obyektId={p.obyektId} ustamasiz={qatorlarJami} katKesim={katKesim} yorliq={t('F2, QQS bilan')} className="items-end text-right [&_[data-testid=summa-qqs]]:text-[20px] [&_[data-testid=summa-qqs]]:font-semibold" />
          </div>
        </div>
        <Yol status={p.status} rejim={p.rejim} kim={birinchi?.akt_kim} sana={birinchi?.akt_sana} />
        {p.amallar && <div className="fz-doc__actions">{p.amallar}</div>}
      </section>

      <div className="fz-doc__panels">
        <section className="fz-panel" aria-label={t('Kategoriyalar')}>
          <div className="fz-panel__h"><span>{t('Kategoriyalar bo‘yicha')}</span><span>{t('ustamasiz')}</span></div>
          <KatDonut qismlar={kat.qismlar} jami={kat.jami} />
          <div className="fz-legend">
            {kat.qismlar.map((k) => (<Fragment key={k.guruh}>
              <i className={`fz-bg-${k.guruh}`} style={{ width: 10, height: 10, borderRadius: 2, display: 'block' }} />
              <span>{t(KAT_GURUH_NOMI[k.guruh])}</span>
              <span className="fz-c-num"><FmtN val={k.summa} kasr={0} /></span>
              <small>{Math.round(k.ulush * 100)}%</small>
            </Fragment>))}
          </div>
          {kat.summasiz > 0 && <div className="fz-chip fz-chip--warn">{t('{n} ta qatorda summa yo‘q', { n: kat.summasiz })}</div>}
        </section>

        <section className="fz-panel" aria-label={t('Bo‘limlar')}>
          <div className="fz-panel__h"><span>{t('Bo‘limlar')}</span><span>{bolimlar.length}</span></div>
          <div className="fz-bars">
            {bolimlar.slice(0, 7).map((b) => (
              <div key={b.qator_id} className="fz-bars__q">
                <span title={b.nom ?? ''}>{b.nom || t('Nomsiz bo‘lim')}</span><b><FmtN val={b.summa} kasr={0} /></b>
                <i style={{ ['--w' as string]: `${b.ulush * 100}%` }} />
              </div>
            ))}
            {bolimlar.length > 7 && <span className="fz-chip">{t('yana {n} ta bo‘lim', { n: bolimlar.length - 7 })}</span>}
          </div>
        </section>

        <BolimBajarilishPanel bolimlar={bolimBaj} />

        <section className="fz-panel" aria-label={t('Tekshiruv')}>
          <div className="fz-panel__h"><span>{t('Tekshiruv')}</span>{tozami ? <span className="fz-chip fz-chip--accent">{t('toza')}</span> : null}</div>
          <div className="fz-check">
            {tek.oshgan ? tekQator('warn', AlertTriangle, t('{n} ta qator smeta hajmidan oshgan', { n: tek.oshgan })) : tekQator('ok', CheckCircle2, t('Hech bir qator smetadan oshmagan'))}
            {tek.arifmetik ? tekQator('warn', Sigma, t('{n} ta qatorda hajm × narx ≠ summa', { n: tek.arifmetik })) : tekQator('ok', CheckCircle2, t('Arifmetika to‘g‘ri'))}
            {tek.narxsiz > 0 && tekQator('warn', CircleSlash, t('{n} ta qator narxsiz', { n: tek.narxsiz }))}
            {tek.manfiy > 0 && tekQator('warn', AlertTriangle, t('{n} ta manfiy qator (chegirma)', { n: tek.manfiy }))}
            {tek.topilmagan > 0 && tekQator('bad', FileQuestion, t('{n} ta qator smetada topilmadi', { n: tek.topilmagan }))}
            {(tek.zamena > 0 || tek.qoshimcha > 0) && tekQator('warn', Repeat, t('Zamena: {z} · qo‘shimcha: {q}', { z: tek.zamena, q: tek.qoshimcha }))}
            {farq != null && Math.abs(farq) >= 1
              ? tekQator('bad', AlertTriangle, t('Hujjat jami va o‘qilgan qatorlar farqi: {f}', { f: fmt(farq) }))
              : tekQator('ok', CheckCircle2, t('Hujjat jami qatorlar bilan mos'))}
          </div>
        </section>
      </div>

      {p.ostida}

      <div className="print:hidden"><FiltrHolatQatori soni={f.soni} natija={filtrQatorSoni} jami={lines.length} tozala={f.tozala} /></div>
      <div className="fz-table-wrap">
        <table className="fz-table">
          <thead><tr>
            <th>{t('Bo‘lim / ish / resurs')}{F('kod')}{F('nom')}</th><th>{t('Birlik')}{F('birlik')}</th>
            <th className="fz-c-num">{t('Smeta')}{F('smeta')}</th><th className="fz-c-num">{t('Oldin olingan')}{F('oldin')}</th><th className="fz-c-num">{t('Shu F2')}{F('shu')}</th>
            <th>{t('Bajarilish')}{F('foiz')}</th><th className="fz-c-num">{t('Narx')}<SummaYorliq tur="narx" />{F('narx')}</th><th className="fz-c-num">{t('Summa')} <small className="font-normal text-text-mute">({t('ustamasiz')})</small>{F('summa')}</th>
          </tr></thead>
          <tbody>
            {f.natija.map((r) => {
              const { q } = r;
              const pad = { paddingLeft: 12 + q.daraja * 18 };
              const belgiMatn = q.zamena ? t('zamena') : q.qoshimcha ? t('qo‘shimcha') : null;
              const belgi = belgiMatn && <span className="fz-chip fz-chip--accent" style={{ marginLeft: 6 }}>{belgiMatn}</span>;
              if (!r.line) {
                const b = q.tur === 'bl' && q.qatorlar.length ? bajar(q.qator_id) : null;
                return (
                  <tr key={'o' + q.qator_id} className={q.tur === 'rz' ? 'fz-row-rz' : 'fz-row-bl'}>
                    <td style={pad}>{q.kod && <span className="fz-c-shifr" style={{ marginRight: 6 }}>{q.kod}</span>}{q.nom || '—'}{belgi}</td>
                    <td className="fz-c-unit">{q.tur === 'bl' ? q.birlik : ''}</td>
                    <td className="fz-c-num">{b ? <FmtN val={b.smeta} /> : ''}</td><td className="fz-c-num">{b ? <FmtN val={b.oldin} /> : ''}</td><td className="fz-c-num">{b ? <FmtN val={b.shu} /> : ''}</td>
                    <td>{b && <Meter b={b} />}</td><td /><td className="fz-c-num"><FmtN val={q.summa} /></td>
                  </tr>
                );
              }
              const b = bajar(q.qator_id);
              const { line, k } = r;
              return (
                <tr key={line.akt_qator_id} className="fz-row-res">
                  <td style={pad}>
                    {k === 0 && <KatNishon kat={line.kat} className="mr-1.5" />}
                    {line.kod && <span className="fz-c-shifr" style={{ marginRight: 6 }}>{line.kod}</span>}{line.nom || t('Nomsiz qator')}{k === 0 && belgi}
                  </td>
                  <td className="fz-c-unit">{line.birlik || ''}</td>
                  <td className="fz-c-num">{k === 0 ? <FmtN val={b.smeta} /> : ''}</td>
                  <td className="fz-c-num">{k === 0 ? <FmtN val={b.oldin} /> : ''}</td>
                  <td className={`fz-c-num ${k === 0 && b.oshdi ? 'fz-over' : ''}`}><FmtN val={f2Miqdor(line)} /></td>
                  <td>{k === 0 && <Meter b={b} />}</td>
                  <td className="fz-c-num"><FmtN val={f2BirlikNarx(line)} /></td>
                  <td className="fz-c-num"><FmtN val={f2Pul(line)} /></td>
                </tr>
              );
            })}
            {f.soni > 0 && filtrQatorSoni === 0 && <tr className="print:hidden"><td colSpan={8} className="text-text-mute">{t('Filtr bo‘yicha qator topilmadi.')}</td></tr>}
            {f.soni > 0 && filtrQatorSoni > 0 && (
              <tr className="fz-row-total print:hidden" data-testid="f2-filtr-jami">
                <td colSpan={7}>{t('Filtr bo‘yicha: {a} / {b} qator (ustamasiz, NDS siz)', { a: filtrQatorSoni, b: lines.length })}</td>
                <td className="fz-c-num">{filtrJami.summa != null ? <FmtN val={filtrJami.summa} /> : <span className="text-text-mute">—</span>}</td>
              </tr>
            )}
            {lines.length > 0 && (
              <tr className="fz-row-total">
                <td colSpan={7}>{t('Jami: QQS bilan (katta); ustamali QQS siz va ustamasiz (kichik)')}{f.soni > 0 && <span className="print:hidden"> · {t('butun hujjat bo‘yicha')}</span>}</td>
                <td className="fz-c-num"><SummaJuft obyektId={p.obyektId} ustamasiz={qatorlarJami} katKesim={katKesim} className="items-end text-right" /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
