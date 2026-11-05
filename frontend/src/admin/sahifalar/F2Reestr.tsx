/**
 * F2 REESTRI — butun kompaniya bo'yicha F2 holati bitta joyda (egasi 2026-10-21). Har obyekt: loyiha, shartnoma, smeta,
 * tasdiqlangan F2 (o'tgan davr importi va tizimda tayyorlangan alohida), jarayondagi / rad etilgan / bekor qilingan F2,
 * oxirgi oy va ogohlantirishlar. Qator ochilsa — aktlar ro'yxati (qaysi fayldan import qilingan), akt yozilmagan import
 * fayllari va obyektning F2 tarixiga havola. Faqat o'qish.
 *
 * Firuza ko'rinishi (2026-10-25): yuqorida bitta xulosa tasmasi; har obyekt qatorida «smeta = 100%» chizig'i
 * (import · tizimda · manbasi aniqlanmagan), holatlar — so'z bilan (chip/shtamp), F2 tarixiga to'g'ridan-to'g'ri havola.
 * Summalar F2 hujjat jami (ustamasiz) — ustamali summa obyekt kategoriyasi kesimisiz hisoblanmaydi. Smeta ustuni — sukut QQS bilan (egasi 2026-10-27).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { FmtN, pulQisqa } from '../../lib/format';
import { t, tilLocale } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { PortfelSummaJuft } from '../../umumiy/ui/PortfelSummaJuft';
import { usePortfelUstamali } from '../../umumiy/ui/usePortfelUstamali';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { SummaKesimi } from '../../umumiy/ui/SummaKesimi';
import { useRahbarPanel } from '../../api/t2-rahbar-panel';
import { paketUchligi, type SummaPaket } from '../../lib/summa-paket';
import { paketlarJami, type TafsilQism } from '../../lib/summa-tafsilot';
import { F2ReestrOylik } from '../../components/f2-hujjat/F2ReestrOylik';
import { F2DavomRoyxat } from './F2DavomRoyxat';
import { F2OylikPaket } from './F2OylikPaket';
import { F2Portfel } from './F2Portfel';
import { F2Takrorlar } from './F2Takrorlar';
import { f2ReestrOl, obyektF2Fayllari, type ReestrMalumot } from '../../api/t2-f2-reestr';
import type { CenterDocument } from '../../api/t2-hujjat-canonical';
import { aktsizFayllar, bosqich, filtrla, reestrQur, tartibla, type F2Bosqich, type Ogoh, type ReestrAkt, type ReestrFiltr, type ReestrJami, type ReestrQator, type Summa } from '../../lib/f2-reestr/reestr';
import { manbaTaqsimot, reestrUlush } from '../../lib/f2-reestr/reestr-korinish';
import type { Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import { aktUstunlar, BOSQICH_NOMI, reestrUstunlar } from './F2JadvalFiltr';
/** Holat — rang bilan emas, SO'Z bilan (shtamp): tasdiqlangan — muhrlangan, jarayonda — qoralama chizig'i. */
const BOSQICH_STAMP: Record<F2Bosqich, string> = { tasdiqlangan: 'fz-stamp--ok', jarayonda: 'fz-stamp--warn fz-stamp--draft', rad: 'fz-stamp--danger', bekor: '' };

const davr = (oy: string | null | undefined) => (oy ? davrNomi(oy, tilLocale()) || oy.slice(0, 7) : '');
const SUMMA_TUR_NOMI: Record<'qqs' | 'ustamasiz' | 'ustamali', () => string> = { qqs: () => t('QQS bilan'), ustamali: () => t('Ustamali'), ustamasiz: () => t('Ustamasiz') };

/** Ma'lum summa + noma'lumlar soni (NULL ≠ 0). */
function SummaKorinish({ s, qisqa = false }: { s: Summa; qisqa?: boolean }) {
  if (!s.soni) return <span className="text-text-mute">—</span>;
  const nomalum = s.nomalum > 0 ? t('+ {n} ta summasi noma’lum', { n: s.nomalum }) : null;
  return <span className="tabular-nums">{qisqa ? pulQisqa(s.malum) : <FmtN val={s.malum} />}
    {nomalum && <span className="fz-chip fz-chip--warn ml-1">{nomalum}</span>}</span>;
}
/**
 * Tasdiqlangan F2 summasi katagi — uchlik (QQS bilan · ustamali · ustamasiz) server paketidan (`t2_rahbar_panel_v1.obyektlar[].f2`).
 * Paket yo'q (panel o'qilmagan) — faqat ma'lum ustamasiz, yorlig'i va «QQS bilan va ustamali hisoblanmadi» izohi bilan.
 */
function F2Katak({ s, paket, qisqa = true }: { s: Summa; paket: SummaPaket | null | undefined; qisqa?: boolean }) {
  if (paket) {
    return <>
      <SummaJuft paket={paket} kichik yorliq={t('F2, QQS bilan')} nomalumSoni={s.nomalum} className="items-end text-right" />
      {s.nomalum > 0 && <span className="fz-chip fz-chip--warn">{t('+ {n} ta summasi noma’lum', { n: s.nomalum })}</span>}
    </>;
  }
  return <>
    <SummaKorinish s={s} qisqa={qisqa} />
    {s.soni > 0 && <div className="text-[11px] font-normal text-text-mute">{t('ustamasiz')} · {t('QQS bilan va ustamali hisoblanmadi')}</div>}
  </>;
}
function ogohMatni(o: Ogoh): string {
  if (o.tur === 'shartnomadan_oshgan') return t('F2 shartnomadan {k} baravar ko‘p — shartnoma summasi yoki biriktirishni tekshiring', { k: String(o.qiymat ?? '').replace('.', ',') });
  if (o.tur === 'oy_takror') return t('{n} oyda bir nechta tasdiqlangan F2', { n: o.qiymat ?? 0 });
  if (o.tur === 'summa_nomalum') return t('{n} ta F2 ning summasi noma’lum', { n: o.qiymat ?? 0 });
  return t(o.matn);
}
function ManbaBelgi({ a, fayl }: { a: ReestrAkt; fayl: string | null }) {
  if (a.manba === 'tizim') return <span className="fz-chip fz-chip--accent">{t('Tizimda yasalgan')}</span>;
  if (a.manba !== 'import') return <span className="fz-chip fz-chip--warn">{t('aniqlanmadi')}</span>;
  const izoh = fayl ? ` · ${fayl}` : a.hujjat_id ? ` · ${t('hujjat №{n}', { n: a.hujjat_id })}` : '';
  return <span className="text-text-dim">{t('Import')}{izoh}</span>;
}

/** Obyekt aktlari jadvali (qator ochilganda) — Excel uslubidagi ustun filtrlari bilan (tekis: saralash mumkin). */
function AktlarJadval({ aktlar, nomi }: { aktlar: ReestrAkt[]; nomi: ReadonlyMap<number, string> }) {
  const ustunlar = useMemo<Ustun<ReestrAkt>[]>(() => aktUstunlar((a) => (a.hujjat_id != null ? nomi.get(a.hujjat_id) ?? null : null)), [nomi]);
  const f = useJadvalFiltr(aktlar, ustunlar);
  const F = (kalit: string) => <UstunFiltrTugma {...f.tugma(kalit)} />;
  const bosh = f.natija.length === 0;
  return <>
    <div className="mb-1"><FiltrHolatQatori soni={f.soni} natija={f.natija.length} jami={aktlar.length} tozala={f.tozala} /></div>
    <div className="fz-table-wrap"><table className="fz-table">
      <thead><tr><th>{t('Oy')}{F('oy')}</th><th>{t('Raqam')}{F('raqam')}</th><th>{t('Manba')}{F('manba')}</th><th>{t('Holat')}{F('holat')}</th>
        <th className="fz-c-num">{t('Summa')}{F('summa')}</th><th className="fz-c-num">{t('Qatorlar')}{F('qatorlar')}</th></tr></thead>
      <tbody>{f.natija.map(a => {
        const b = bosqich(a);
        const narxsiz = (a.narxsiz_qator ?? 0) > 0 ? t('({n} narxsiz)', { n: a.narxsiz_qator ?? 0 }) : null;
        return <tr key={a.id}>
          <td className="whitespace-nowrap">{davr(a.oy)}</td><td>{a.raqam ?? <span className="text-text-mute">—</span>}</td>
          <td><ManbaBelgi a={a} fayl={a.hujjat_id != null ? nomi.get(a.hujjat_id) ?? null : null} /></td>
          <td><span className={`fz-stamp ${BOSQICH_STAMP[b]}`}>{t(BOSQICH_NOMI[b])}</span></td>
          <td className="fz-c-num">{a.hujjat_jami != null ? <FmtN val={a.hujjat_jami} /> : <span className="fz-chip fz-chip--warn">{t('noma’lum')}</span>}</td>
          <td className="fz-c-num">{a.qator_soni ?? '—'}{narxsiz && <span className="ml-1 text-warn">{narxsiz}</span>}</td>
        </tr>;
      })}
      {bosh && <tr><td colSpan={6} className="text-text-mute">{t('Filtr bo‘yicha qator topilmadi.')}</td></tr>}</tbody>
    </table></div>
  </>;
}

/** «Smeta = 100%» chizig'i: import (kulrang) + tizimda yasalgan (firuza) + manbasi aniqlanmagan. Summa nisbati — jismoniy bajarilish emas. */
function SmetaChizigi({ q }: { q: ReestrQator }) {
  const u = reestrUlush({ tasdiqlangan: q.boyicha.tasdiqlangan, tasdiqImport: q.tasdiqImport, tasdiqTizim: q.tasdiqTizim }, q.obyekt.jami);
  if (u.foiz == null) return <span className="fz-meter__f" title={t('Smeta summasi noma’lum — nisbat hisoblanmaydi')}>—</span>;
  const izoh = t('Tasdiqlangan F2 / smeta (summa nisbati, ustamasiz; jismoniy bajarilish emas)');
  return (
    <span className={`fz-meter ${u.oshdi ? 'fz-meter--over' : ''}`} title={izoh} aria-label={`${izoh}: ${Math.round(u.foiz)}%`}>
      <span className="fz-meter__t">
        <i className="fz-meter__oldin" style={{ width: `${u.importUlush * 100}%` }} />
        <i className="fz-meter__shu" style={{ width: `${u.tizimUlush * 100}%` }} />
        <i className="fz-bg-nomalum" style={{ width: `${u.boshqaUlush * 100}%`, opacity: 0.5 }} />
      </span>
      <span className="fz-meter__f">{Math.round(u.foiz)}%</span>
    </span>
  );
}

/** Jarayonda / rad / bekor — so'z bilan; hammasi nol bo'lsa chiziqcha. */
function HolatChiplari({ q }: { q: ReestrQator }) {
  const { jarayonda, rad, bekor } = q.boyicha;
  if (!jarayonda.soni && !rad.soni && !bekor.soni) return <span className="text-text-mute">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {jarayonda.soni > 0 && <span className="fz-chip fz-chip--warn" title={pulQisqa(jarayonda.malum)}>{t('{n} jarayonda', { n: jarayonda.soni })}</span>}
      {rad.soni > 0 && <span className="fz-chip fz-chip--danger">{t('{n} rad etilgan', { n: rad.soni })}</span>}
      {bekor.soni > 0 && <span className="fz-chip">{t('{n} bekor', { n: bekor.soni })}</span>}
    </span>
  );
}

/** Kompaniya xulosasi — bitta tasma: obyektlar, tasdiqlangan F2 (manba taqsimoti bilan), jarayondagilar, shartnomasizlar. */
function XulosaTasma({ jami, qatorlar, f2Paket, f2Jami }: { jami: ReestrJami; qatorlar: ReestrQator[]; f2Paket: ReadonlyMap<number, SummaPaket | null>; f2Jami: SummaPaket | null }) {
  const f2Qismlar: TafsilQism[] | undefined = f2Paket.size ? qatorlar.filter(q => q.aktlar.length).map(q => ({ kalit: String(q.obyekt.id), nom: q.obyekt.nom, q: paketUchligi(f2Paket.get(q.obyekt.id) ?? null) })) : undefined;
  const portfel = useMemo(() => qatorlar.map(q => ({ obyektId: q.obyekt.id })), [qatorlar]);
  const f2Bor = qatorlar.filter(q => q.aktlar.length).length;
  const m = manbaTaqsimot({ tasdiqlangan: jami.boyicha.tasdiqlangan, tasdiqImport: jami.tasdiqImport, tasdiqTizim: jami.tasdiqTizim });
  const radBekor = `${jami.boyicha.rad.soni} / ${jami.boyicha.bekor.soni}`;
  return (
    <section className="fz-card grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-[1fr_2fr_1.3fr_1fr]" aria-label={t('F2 reestri xulosasi')}>
      <div className="fz-panel rounded-none border-0">
        <div className="fz-panel__h"><span>{t('Obyektlar')}</span></div>
        <div className="text-2xl font-semibold tabular-nums">{jami.obyekt}</div>
        <div className="text-[12px] text-text-mute">{t('F2 si bor: {n}', { n: f2Bor })}</div>
      </div>
      <div className="fz-panel rounded-none border-0">
        <div className="fz-panel__h"><span>{t('Tasdiqlangan F2')}</span><span>{f2Jami ? t('QQS bilan · ustamali · ustamasiz') : t('ustamasiz')}</span></div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold" data-testid="reestr-f2-jami">{f2Jami
            ? <SummaJuft paket={f2Jami} yorliq={t('F2, QQS bilan')} qismlar={f2Qismlar} nomalumSoni={jami.boyicha.tasdiqlangan.nomalum} />
            : <><SummaKorinish s={jami.boyicha.tasdiqlangan} qisqa /><span className="block text-[11px] font-normal text-text-mute">{t('ustamasiz')} · {t('QQS bilan va ustamali hisoblanmadi')}</span></>}</span>
          <span className="text-[12px] text-text-mute">{t('{n} ta akt', { n: jami.boyicha.tasdiqlangan.soni })}</span>
        </div>
        {m.jami > 0 && <div className="fz-split" role="img" aria-label={t('Tasdiqlangan F2 manbasi bo‘yicha')}>
          {m.import > 0 && <i className="fz-meter__oldin" style={{ flexGrow: m.import }} />}
          {m.tizim > 0 && <i className="fz-meter__shu" style={{ flexGrow: m.tizim }} />}
          {m.boshqa > 0 && <i className="fz-bg-nomalum" style={{ flexGrow: m.boshqa, opacity: 0.5 }} />}
        </div>}
        <div className="fz-legend" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          <i className="fz-meter__oldin block h-2.5 w-2.5 rounded-sm" />
          <span>{t('Shundan: import (o‘tgan davr)')}</span>
          <span className="fz-c-num"><SummaKorinish s={jami.tasdiqImport} qisqa /></span>
          <i className="fz-meter__shu block h-2.5 w-2.5 rounded-sm" />
          <span>{t('Tizimda tayyorlangan')}</span>
          <span className="fz-c-num"><SummaKorinish s={jami.tasdiqTizim} qisqa /></span>
          {m.boshqa > 0 && <>
            <i className="fz-bg-nomalum block h-2.5 w-2.5 rounded-sm opacity-50" />
            <span>{t('Manbasi aniqlanmagan')}</span>
            <span className="fz-c-num tabular-nums">{pulQisqa(m.boshqa)}</span>
          </>}
        </div>
      </div>
      <div className="fz-panel rounded-none border-0">
        <div className="fz-panel__h"><span>{t('Jarayonda')}</span><span>{t('Rad etilgan / bekor')}</span></div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold tabular-nums">{jami.boyicha.jarayonda.soni}</span>
          <span className="text-lg font-semibold tabular-nums text-text-dim">{radBekor}</span>
        </div>
        <div className="text-[12px] text-text-mute"><SummaKorinish s={jami.boyicha.jarayonda} qisqa /></div>
      </div>
      <div className="fz-panel rounded-none border-0">
        <div className="fz-panel__h"><span>{t('Shartnomasiz obyekt (F2 bilan)')}</span></div>
        <div className={`text-2xl font-semibold tabular-nums ${jami.shartnomasiz ? 'text-warn' : ''}`}>{jami.shartnomasiz}</div>
        <div className="mt-1 text-[12px] text-text-mute">{t('Smeta jami')}:</div>
        <PortfelSummaJuft obyektlar={portfel} ustamasiz={jami.smeta.soni ? jami.smeta.malum : null} kichik />
      </div>
    </section>
  );
}

export default function F2Reestr() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const contextVersion = useRef(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    contextVersion.current++;
    return () => { contextVersion.current++; requestVersion.current++; };
  }, [kompaniyaId]);
  const [malumot, setMalumot] = useState<ReestrMalumot | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [filtr, setFiltr] = useState<ReestrFiltr>({ bosqich: 'hammasi', matn: '', faqatMuammo: false });
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  const [fayllar, setFayllar] = useState<Map<number, CenterDocument[] | 'xato' | 'yuklanmoqda'>>(new Map());

  const yukla = useCallback(async () => {
    if (kompaniyaId == null) return;
    const version = ++requestVersion.current;
    setYuklanmoqda(true); setXato('');
    try { const result = await f2ReestrOl(kompaniyaId); if (version === requestVersion.current) setMalumot(result); }
    catch (e) { if (version === requestVersion.current) setXato(e instanceof Error ? e.message : String(e)); }
    finally { if (version === requestVersion.current) setYuklanmoqda(false); }
  }, [kompaniyaId]);
  useEffect(() => { setMalumot(null); setOchiq(new Set()); setFayllar(new Map()); void yukla(); }, [yukla]);
  /** F2 portfeli uchun: joriy aktlarni qayta o'qish (sahifa holati saqlanadi). */
  const yangilaJim = useCallback(() => { void yukla(); }, [yukla]);

  const reestr = useMemo(() => (malumot ? reestrQur(malumot) : null), [malumot]);
  const qatorlar = useMemo(() => (reestr ? tartibla(filtrla(reestr.qatorlar, filtr)) : []), [reestr, filtr]);
  /** Smeta ustuni (egasi 2026-10-27): sukut — obyekt qiymati QQS bilan; «Ustamali» (QQS siz) yoki «Ustamasiz» tanlash mumkin; jami qatorida har doim uchalasi. */
  const [summaTur, setSummaTur] = useState<'qqs' | 'ustamasiz' | 'ustamali'>('qqs');
  const portfelHammasi = useMemo(() => (reestr ? reestr.qatorlar.map(q => ({ obyektId: q.obyekt.id })) : []), [reestr]);
  const portfelUstamali = usePortfelUstamali(portfelHammasi);
  /** F2 uchligi — server paketi (rahbar paneli): obyekt bo'yicha va kompaniya jami. Panel o'qilmasa bo'sh (UI «hisoblanmadi» deydi). */
  const rp = useRahbarPanel(kompaniyaId);
  const f2Paket = useMemo(() => new Map((rp.data?.obyektlar ?? []).map(o => [o.obyekt_id, o.f2] as const)), [rp.data]);
  const f2Jami = rp.data?.kartalar.bajarildi.jami ?? null;
  /* Excel uslubidagi ustun filtrlari (egasi 2026-10-27): yuqoridagi qidiruv/holat filtri bilan VA; tekis — saralash mumkin. */
  /* usePortfelUstamali har renderda yangi Map beradi — ustunlar faqat qiymatlar o'zgarganda qayta quriladi. */
  const ustamaliImzo = summaTur === 'ustamali' ? [...portfelUstamali.boYicha].map(([id, v]) => `${id}:${v ?? ''}`).join('|') : '';
  const ustunlar = useMemo(() => {
    const m = new Map(ustamaliImzo ? ustamaliImzo.split('|').map((x) => { const [id, v] = x.split(':'); return [Number(id), v === '' ? null : Number(v)] as const; }) : []);
    return reestrUstunlar((q) => (ustamaliImzo ? m.get(q.obyekt.id) ?? null : q.obyekt.jami));
  }, [ustamaliImzo]);
  const uf = useJadvalFiltr(qatorlar, ustunlar);
  const F = (kalit: string) => <UstunFiltrTugma {...uf.tugma(kalit)} />;
  const korinadi = uf.natija;
  const korinadiganPortfel = useMemo(() => korinadi.map(q => ({ obyektId: q.obyekt.id })), [korinadi]);
  const korinadiganJami = useMemo(() => {
    let smeta: number | null = null; let tasdiq: Summa = { malum: 0, nomalum: 0, soni: 0 };
    for (const q of korinadi) {
      if (q.obyekt.jami != null) smeta = (smeta ?? 0) + q.obyekt.jami;
      const x = q.boyicha.tasdiqlangan;
      tasdiq = { malum: tasdiq.malum + x.malum, nomalum: tasdiq.nomalum + x.nomalum, soni: tasdiq.soni + x.soni };
    }
    return { smeta, tasdiq };
  }, [korinadi]);

  function ochYop(obyektId: number) {
    setOchiq(s => { const x = new Set(s); if (x.has(obyektId)) x.delete(obyektId); else x.add(obyektId); return x; });
    if (kompaniyaId != null && !fayllar.has(obyektId)) {
      const version = contextVersion.current;
      setFayllar(m => new Map(m).set(obyektId, 'yuklanmoqda'));
      obyektF2Fayllari(kompaniyaId, obyektId)
        .then(l => { if (version === contextVersion.current) setFayllar(m => new Map(m).set(obyektId, l)); })
        .catch(() => { if (version === contextVersion.current) setFayllar(m => new Map(m).set(obyektId, 'xato')); });
    }
  }

  return <Sahifa sarlavha={t('F2 reestri')} tavsif={t('Kompaniyaning barcha obyektlari bo‘yicha F2: shartnoma, import qilingan va tizimda yasalgan aktlar, summalar va holat')}
    amallar={<button type="button" onClick={() => void yukla()} disabled={yuklanmoqda || kompaniyaId == null} className="fz-btn fz-btn--ghost">
      <RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}>
    <div className="flex flex-col gap-3">
      {kompaniyaId == null && <div className="fz-note fz-note--info">{t('Avval kompaniyani tanlang.')}</div>}
      {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{t('F2 reestri o‘qilmadi: {x}', { x: xato })}</span></div>}
      {yuklanmoqda && !reestr && <Skelet qatorlar={6} />}

      {reestr && <XulosaTasma jami={reestr.jami} qatorlar={reestr.qatorlar} f2Paket={f2Paket} f2Jami={f2Jami} />}
      <F2DavomRoyxat kompaniyaId={kompaniyaId} />
      {malumot && <F2Takrorlar malumot={malumot} />}
      {malumot && kompaniyaId != null && <F2Portfel kompaniyaId={kompaniyaId} malumot={malumot} tashkilot={joriy?.nom ?? null} yangila={yangilaJim} />}
      {malumot && kompaniyaId != null && <F2OylikPaket kompaniyaId={kompaniyaId} malumot={malumot} tashkilot={joriy?.nom ?? null} yangila={yangilaJim} />}
      {reestr && <F2ReestrOylik aktlar={reestr.qatorlar.flatMap(q => q.aktlar)} />}
      {malumot && malumot.manbaXato > 0 && <div role="status" className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t('{n} ta aktning manbasi o‘qilmadi — ular «aniqlanmadi» deb ko‘rsatilgan.', { n: malumot.manbaXato })}</span></div>}

      {reestr && <section className="fz-card flex flex-wrap items-end gap-3 p-3 text-[12px]">
        <label className="min-w-[220px] flex-1 text-text-dim">{t('Qidirish')}
          <input aria-label={t('Obyekt, loyiha yoki shartnoma')} value={filtr.matn} onChange={e => setFiltr({ ...filtr, matn: e.target.value })} className="input mt-1 block h-8 w-full" /></label>
        <label className="text-text-dim">{t('Holat')}
          <select aria-label={t('F2 holati')} value={filtr.bosqich} onChange={e => setFiltr({ ...filtr, bosqich: e.target.value as ReestrFiltr['bosqich'] })} className="input mt-1 block h-8">
            <option value="hammasi">{t('Hammasi')}</option>
            {(Object.keys(BOSQICH_NOMI) as F2Bosqich[]).map(b => <option key={b} value={b}>{t(BOSQICH_NOMI[b])}</option>)}
            <option value="f2siz">{t('F2 si yo‘q obyektlar')}</option>
          </select></label>
        <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={filtr.faqatMuammo} onChange={e => setFiltr({ ...filtr, faqatMuammo: e.target.checked })} /> {t('Faqat e’tibor talab qiladiganlar')}</label>
        <div className="pb-0.5" role="group" aria-label={t('Smeta summasi ko‘rinishi')}>
          <span className="mb-1 block text-text-dim">{t('Smeta summasi')}</span>
          <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5">
            {(['qqs', 'ustamali', 'ustamasiz'] as const).map(k => <button key={k} type="button" aria-pressed={summaTur === k} onClick={() => setSummaTur(k)}
              className={`fz-btn fz-btn--sm ${summaTur === k ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost'}`}>{SUMMA_TUR_NOMI[k]()}</button>)}
          </span>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-3 pb-1.5 text-text-mute">
          <span className="inline-flex items-center gap-1.5"><i className="fz-meter__oldin inline-block h-2 w-3 rounded-sm" />{t('Import')}</span>
          <span className="inline-flex items-center gap-1.5"><i className="fz-meter__shu inline-block h-2 w-3 rounded-sm" />{t('Tizimda tayyorlangan')}</span>
          <span>{t('{a} / {b} obyekt', { a: korinadi.length, b: reestr.qatorlar.length })}</span>
        </span>
      </section>}

      {reestr && <FiltrHolatQatori soni={uf.soni} natija={korinadi.length} jami={qatorlar.length} tozala={uf.tozala} />}
      {reestr && <div className="fz-table-wrap">
        <table className="fz-table min-w-[1040px]">
          <thead><tr>
            <th className="w-8" /><th>{t('Obyekt')}{F('obyekt')}{F('loyiha')}</th><th>{t('Shartnoma')}{F('shartnoma')}</th>
            <th className="fz-c-num">{t('Smeta')}{F('smeta')}</th><th className="fz-c-num">{t('Tasdiqlangan F2')}{F('tasdiq')}</th><th>{t('Smetaga nisbatan')}{F('nisbat')}</th>
            <th className="fz-c-num">{t('Import / tizimda')}{F('import')}{F('tizim')}</th><th>{t('Jarayonda · rad · bekor')}{F('holat')}</th>
            <th>{t('Oxirgi oy')}{F('oy')}</th><th />
          </tr></thead>
          <tbody>
            {korinadi.map(q => {
              const o = ochiq.has(q.obyekt.id);
              const fl = fayllar.get(q.obyekt.id);
              const nomi = new Map([...malumot!.faylNomlari, ...(Array.isArray(fl) ? fl : []).map(d => [Number(d.id), d.filename] as const)]);
              const aktsiz = Array.isArray(fl) ? aktsizFayllar(fl, q.aktlar) : [];
              const tarix = `/admin/f2-tarix?obyekt=${q.obyekt.id}`;
              return <Fragment key={q.obyekt.id}>
                <tr className="cursor-pointer" onClick={() => ochYop(q.obyekt.id)}>
                  <td className="text-text-mute">
                    <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-expanded={o} aria-label={t('Aktlarni ko‘rsatish: {nom}', { nom: q.obyekt.nom })}
                      onClick={e => { e.stopPropagation(); ochYop(q.obyekt.id); }}>{o ? <ChevronDown /> : <ChevronRight />}</button>
                  </td>
                  <td><div className="font-medium text-text">{q.obyekt.nom}</div>
                    {q.loyiha && <div className="text-[12px] text-text-mute">{q.loyiha}</div>}
                    {q.ogohlar.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{q.ogohlar.map((g, i) => <span key={i} className="fz-chip fz-chip--warn" style={{ height: 'auto', minHeight: 18, whiteSpace: 'normal', padding: '2px 6px' }}>{ogohMatni(g)}</span>)}</div>}</td>
                  <td>{q.shartnomalar.length ? q.shartnomalar.map(s => <div key={s.id}>№ {s.raqam}{s.nom ? ` · ${s.nom}` : ''}
                    <span className="ml-1 text-[12px] text-text-mute">{s.jami_nds_bilan != null ? pulQisqa(s.jami_nds_bilan) : t('summa yo‘q')}</span></div>)
                    : <span className="text-text-mute">{t('biriktirilmagan')}</span>}</td>
                  <td className="fz-c-num">{summaTur !== 'ustamasiz'
                    ? (() => { const v = (summaTur === 'qqs' ? portfelUstamali.qqsBoYicha : portfelUstamali.boYicha).get(q.obyekt.id);
                      return v != null ? <span title={summaTur === 'qqs' ? t('QQS bilan') : t('ustamali, NDS siz')}>{pulQisqa(v)}</span> : <span className="text-text-mute" title={portfelUstamali.holat === 'yuklanmoqda' ? t('Hisoblanmoqda…') : t('ustamali noma’lum')}>—</span>; })()
                    : q.obyekt.jami != null ? pulQisqa(q.obyekt.jami) : <span className="text-text-mute">—</span>}
                    {(q.obyekt.narxsiz ?? 0) > 0 && <div><span className="fz-chip fz-chip--warn">{t('{n} narxsiz qator', { n: q.obyekt.narxsiz ?? 0 })}</span></div>}
                    <SummaKesimi q={{ qqsBilan: portfelUstamali.qqsBoYicha.get(q.obyekt.id) ?? null, ustamali: portfelUstamali.boYicha.get(q.obyekt.id) ?? null, ustamasiz: q.obyekt.jami ?? null, taxminiy: false, nomalum: 0, sabab: null }} nomalumSoni={q.obyekt.narxsiz ?? 0} /></td>
                  <td className="fz-c-num"><span className="font-semibold"><F2Katak s={q.boyicha.tasdiqlangan} paket={f2Paket.get(q.obyekt.id)} /></span>
                    {q.boyicha.tasdiqlangan.soni > 0 && <div className="text-[12px] text-text-mute">{t('{n} ta akt', { n: q.boyicha.tasdiqlangan.soni })}</div>}</td>
                  <td><SmetaChizigi q={q} /></td>
                  <td className="fz-c-num text-[12px]"><div className="text-text-dim"><SummaKorinish s={q.tasdiqImport} qisqa /></div><div className="text-text"><SummaKorinish s={q.tasdiqTizim} qisqa /></div></td>
                  <td><HolatChiplari q={q} /></td>
                  <td className="whitespace-nowrap">{q.oxirgiOy ? davr(q.oxirgiOy) : <span className="text-text-mute">{t('F2 yo‘q')}</span>}</td>
                  <td>{q.aktlar.length > 0 && <Link to={tarix} onClick={e => e.stopPropagation()} className="fz-btn fz-btn--sm" title={t('Obyektning F2 tarixini ochish')}>
                    {t('F2 tarixi')}<ExternalLink aria-hidden="true" /></Link>}</td>
                </tr>
                {o && <tr><td /><td colSpan={9} className="bg-surface-2 pb-3 pt-2">
                  {q.aktlar.length ? <AktlarJadval aktlar={q.aktlar} nomi={nomi} /> : <p className="text-[12px] text-text-mute">{t('Bu obyektda F2 akt yo‘q.')}</p>}
                  {fl === 'yuklanmoqda' && <p className="mt-2 text-[12px] text-text-mute">{t('Import fayllari o‘qilmoqda…')}</p>}
                  {fl === 'xato' && <div className="fz-note fz-note--warn mt-2">{t('Import fayllari ro‘yxati o‘qilmadi.')}</div>}
                  {aktsiz.length > 0 && <div className="fz-note fz-note--info mt-2"><div>
                    <div className="text-[12px] font-semibold text-text-dim">{t('Akt yozilmagan import fayllari (ish qoralamasi yoki tugallanmagan import)')}</div>
                    {aktsiz.map(d => <div key={d.id} className="text-text-dim">{d.filename} <span className="text-[12px] text-text-mute">· {d.updatedAt.slice(0, 10)}</span></div>)}
                  </div></div>}
                  <Link to={tarix} className="fz-btn fz-btn--sm mt-2">{t('Obyektning F2 tarixini ochish')}</Link>
                </td></tr>}
              </Fragment>;
            })}
            {korinadi.length === 0 && qatorlar.length > 0 && <tr><td /><td colSpan={9} className="text-text-mute">{t('Filtr bo‘yicha qator topilmadi.')}</td></tr>}
          </tbody>
          {korinadi.length > 0 && <tfoot><tr className="fz-row-total">
            <td /><td colSpan={2}>{uf.soni > 0 ? t('Jami (filtr bo‘yicha): {a} obyekt', { a: korinadi.length }) : t('Jami: {a} obyekt', { a: korinadi.length })}</td>
            <td className="fz-c-num"><PortfelSummaJuft obyektlar={korinadiganPortfel} ustamasiz={korinadiganJami.smeta} kichik className="items-end text-right" /></td>
            <td className="fz-c-num">{f2Paket.size > 0
              ? (() => { const j = paketlarJami(korinadi.filter(q => q.aktlar.length).map(q => f2Paket.get(q.obyekt.id) ?? null));
                return <QiymatUchlik kichik className="items-end text-right" yorliq={t('F2, QQS bilan')} q={j.q} nomalumSoni={j.nomalumSoni}
                  qismlar={korinadi.filter(q => q.aktlar.length).map(q => ({ kalit: String(q.obyekt.id), nom: q.obyekt.nom, q: paketUchligi(f2Paket.get(q.obyekt.id) ?? null) }))} />; })()
              : <><SummaKorinish s={korinadiganJami.tasdiq} qisqa /><div className="text-[11px] font-normal text-text-mute">{t('ustamasiz')} · {t('QQS bilan va ustamali hisoblanmadi')}</div></>}</td>
            <td colSpan={5} />
          </tr></tfoot>}
        </table>
      </div>}
    </div>
  </Sahifa>;
}
