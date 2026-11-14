/**
 * ZakazchikKabinet.tsx — /admin/zakazchik. Buyurtmachi (zakazchik) ko'zi bilan: ulangan pudratchilar, ularning
 * FAQAT SIZGA OCHILGAN obyektlari (grant), tasdiqlangan F2 jami, shartnoma va kutayotgan hujjatlar.
 * Raqamlar server tomonda grant bo'yicha qirqiladi — ruxsat berilmagan ko'rsatkich bu yerga kelmaydi.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { aloqalarOl, taqdimlarOl, zakazchikObyektlarOl, type Aloqa, type TaqdimQisqa, type ZakazchikObyekt } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi } from './tomon-ui';
import NazoratTayinlash from './NazoratTayinlash';
import BugunBolimi from './BugunBolimi';
import { oyMatn, pul, sana } from './tomon-yordam';
import { bajarilishFoizi } from './obyekt-portali-yordam';
import { raqamTozala } from '../../lib/raqam-belgi';

/** qiymat === null — manba hali javob bermadi: «0» EMAS, yuklanish belgisi (NULL ≠ 0). */
function Kartochka({ nom, qiymat, izoh, rang }: { nom: string; qiymat: string | null; izoh?: string; rang?: string }) {
  const yuklanmoqda = qiymat === null;
  return (
    <div className="fz-kpi" aria-busy={yuklanmoqda}>
      <span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{t(nom)}</span>
      {yuklanmoqda ? <span className="fz-kpi__value skel inline-block h-7 w-16 rounded" role="status" aria-label={t('Yuklanmoqda…')} data-testid="kpi-yuklanmoqda" /> : <span className="fz-kpi__value">{qiymat}</span>}
      {izoh && <span className="fz-kpi__sub">{t(izoh)}</span>}
    </div>
  );
}

/** Qaror kutayotgan hujjat qatori: bir bosishda hujjat qaror sahifasida ochiladi (qabul / tuzatish / rad shu yerda). */
function KutayotganQator({ x }: { x: TaqdimQisqa }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
      <Link to={`/admin/taqdimlar?id=${x.id}`} className="font-semibold text-text hover:underline">{x.nom}</Link>
      <span className="text-text-dim">{x.qarshi_nom} · {x.obyekt_nom ?? '—'} · {oyMatn(x.oy)}</span>
      <HolatBelgi holat={x.holat} turi="taqdim" />
      <span className="ml-auto text-xs text-text-dim">{sana(x.taqdim_vaqti)}</span>
      <Link to={`/admin/taqdimlar?id=${x.id}`} className="fz-btn fz-btn--sm fz-btn--primary" data-testid="qaror-chiqarish">{t('Qaror chiqarish')}</Link>
    </li>
  );
}

/** Obyekt bajarilishi: sertifikatlangan F2 / shartnoma (QQSsiz) — chiziq; ma'lum bo'lmasa «—» (0 emas). */
function Bajarilish({ o }: { o: ZakazchikObyekt }) {
  const foiz = bajarilishFoizi(o.f2?.jami, o.shartnoma?.summa_bez_nds);
  if (foiz == null) return <span className="text-text-mute">—</span>;
  return (
    <span className={`fz-meter ${foiz > 100 ? 'fz-meter--over' : ''}`} title={t('sertifikatlangan F2 / shartnoma')}>
      <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${Math.min(foiz, 100)}%` }} /></span>
      <span className="fz-meter__f">{Math.round(foiz)}%</span>
    </span>
  );
}

export default function ZakazchikKabinet() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  // null = hali kelmagan (NULL ≠ 0): har manba mustaqil — qaysi biri tez kelsa, shu darrov ko'rinadi.
  const [aloqalar, setAloqalar] = useState<Aloqa[] | null>(null);
  const [obyektlar, setObyektlar] = useState<ZakazchikObyekt[] | null>(null);
  const [kelgan, setKelgan] = useState<TaqdimQisqa[] | null>(null);
  const [xato, setXato] = useState('');

  useEffect(() => {
    // Kompaniya almashganda eski kompaniya raqamlari ko'rinib qolmasin.
    setAloqalar(null); setObyektlar(null); setKelgan(null); setXato('');
    if (!kompaniyaId) return;
    let bekor = false;
    const xatoQo = (e: string) => { if (!bekor) setXato((x) => x || e); };
    void aloqalarOl(kompaniyaId).then((r) => { if (bekor) return; if (r.ok) setAloqalar(r.natija); else { setAloqalar([]); xatoQo(r.error); } });
    void zakazchikObyektlarOl(kompaniyaId).then((r) => { if (bekor) return; if (r.ok) setObyektlar(r.natija); else { setObyektlar([]); xatoQo(r.error); } });
    void taqdimlarOl(kompaniyaId, { yonalish: 'kelgan' }).then((r) => { if (bekor) return; if (r.ok) setKelgan(r.natija); else { setKelgan([]); xatoQo(r.error); } });
    return () => { bekor = true; };
  }, [kompaniyaId]);

  const faol = useMemo(() => (aloqalar ? aloqalar.filter((a) => a.holat === 'faol') : null), [aloqalar]);
  const kutayotgan = useMemo(() => (kelgan ? kelgan.filter((x) => x.holat === 'yuborilgan' || x.holat === 'ko_rilmoqda') : null), [kelgan]);
  const f2Jami = useMemo(() => (obyektlar ? obyektlar.reduce((s, o) => s + (o.f2?.jami ?? 0), 0) : null), [obyektlar]);
  const guruhlar = useMemo(() => {
    const m = new Map<number, { nom: string; rol: string; obyektlar: ZakazchikObyekt[] }>();
    for (const o of obyektlar ?? []) { const g = m.get(o.qarshi_kompaniya_id) ?? { nom: o.qarshi_nom, rol: o.qarshi_rol, obyektlar: [] }; g.obyektlar.push(o); m.set(o.qarshi_kompaniya_id, g); }
    return [...m.entries()];
  }, [obyektlar]);
  if (!kompaniyaId) return <KompaniyaKerak nima="Buyurtmachi kabineti" />;
  return (
    <Sahifa sarlavha="Buyurtmachi kabineti" tavsif="Ulangan pudratchilar, ularning sizga ochilgan obyektlari, sertifikatlangan ishlar va qaror kutayotgan hujjatlar">
      <div className="space-y-4">
        {xato && <div role="alert" className="fz-note fz-note--danger">{xato}</div>}
        <BugunBolimi kompaniyaId={kompaniyaId} kompaniyaNomi={joriy?.nom ?? ''} />
        <NazoratTayinlash kompaniyaId={kompaniyaId} />
        <section className="fz-card fz-kpis p-4" aria-label={t('Kabinet ko‘rsatkichlari')}>
          <Kartochka nom="Faol aloqalar" qiymat={faol ? String(faol.length) : null} rang="var(--ok)" />
          <Kartochka nom="Ko‘rinadigan obyektlar" qiymat={obyektlar ? String(obyektlar.length) : null} />
          <Kartochka nom="Tasdiqlangan F2 jami" qiymat={f2Jami == null ? null : pul(f2Jami)} izoh="faqat sizga ochilgan obyektlar bo‘yicha" rang="var(--info)" />
          <Kartochka nom="Qaror kutayotgan hujjat" qiymat={kutayotgan ? String(kutayotgan.length) : null} rang={kutayotgan && kutayotgan.length ? 'var(--warn)' : undefined} />
        </section>

        {kutayotgan && kutayotgan.length > 0 && (
          <Bolim sarlavha="Qaror kutayotgan hujjatlar" amal={<Link to="/admin/taqdimlar" className="text-xs text-accent underline">{t('Hammasi')}</Link>}>
            <ul className="divide-y divide-border">{kutayotgan.slice(0, 6).map((x) => <KutayotganQator key={x.id} x={x} />)}</ul>
          </Bolim>
        )}

        {faol && faol.length === 0 && (
          <Bolim sarlavha="Boshlash">
            <p className="text-[13px] text-text-dim">{t('Hali pudratchi ulanmagan. Pudratchingizning INN sini kiriting yoki u yuborgan taklif kodini qabul qiling.')}</p>
            <Link to="/admin/kontragentlar?tab=aloqa" className="mt-2 inline-block text-sm text-accent underline">{t('Aloqalarga o‘tish')}</Link>
          </Bolim>
        )}
        {faol && faol.length > 0 && obyektlar && obyektlar.length === 0 && (
          <Bolim sarlavha="Obyektlar"><p className="text-sm text-text-dim">{t('Pudratchilaringiz hali sizga obyekt ochmagan. Ular “Tomonlar aloqasi” sahifasidan ruxsat berishlari kerak.')}</p></Bolim>
        )}

        {guruhlar.map(([id, g]) => (
          <Bolim key={id} sarlavha={`${g.nom} — ${g.rol}`}>
            <div className="fz-table-wrap"><table className="fz-table min-w-[820px]">
              <thead><tr><th>{t('Obyekt')}</th><th>{t('Shartnoma')}</th><th className="fz-c-num">{t('Shartnoma summasi (QQS bilan)')}</th>
                <th className="fz-c-num">{t('Tasdiqlangan F2 (soni / jami)')}</th><th style={{ minWidth: 140 }}>{t('Bajarilish')}</th><th>{t('Oxirgi F2 oyi')}</th><th className="fz-c-num">{t('Kutayotgan')}</th></tr></thead>
              <tbody>{g.obyektlar.map((o) => (
                <tr key={o.obyekt_id}>
                  <td className="font-medium"><Link to={`/admin/zakazchik/obyekt/${o.aloqa_id}/${o.obyekt_id}`} className="text-accent underline">{o.obyekt_nom}</Link></td>
                  <td>{o.shartnoma ? `№ ${raqamTozala(o.shartnoma.raqam)}` : <span className="text-text-mute">{t('ochilmagan')}</span>}</td>
                  <td className="fz-c-num">{o.shartnoma ? pul(o.shartnoma.jami_nds_bilan) : '—'}</td>
                  <td className="fz-c-num">{o.f2 ? `${o.f2.soni} / ${pul(o.f2.jami)}` : <span className="text-text-mute">{t('ochilmagan')}</span>}</td>
                  <td><Bajarilish o={o} /></td>
                  <td>{o.f2 ? oyMatn(o.f2.oxirgi_oy) : '—'}</td>
                  <td className="fz-c-num">{o.kutayotgan_taqdim ? <span className="fz-chip fz-chip--warn">{o.kutayotgan_taqdim}</span> : ''}</td>
                </tr>))}</tbody>
            </table></div>
          </Bolim>
        ))}
      </div>
    </Sahifa>
  );
}
