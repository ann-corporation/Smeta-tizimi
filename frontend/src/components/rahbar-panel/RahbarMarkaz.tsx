/**
 * RAHBAR PANELI — boshqaruv markazi (issue #195 §1–§5, egasi 2026-10-29: «o'zingni rahbar sifatida o'yla»).
 * Barcha raqamlar `t2_rahbar_panel_v1` dan (yagona summa paketi); bu yerda hisob YO'Q — faqat ko'rsatish.
 * Kiritilmagan qiymat — «kiritilmagan» + qayerdan kiritiladi havolasi; hech qachon 0 yoki taxmin emas.
 */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import type { Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import type { RahbarDiqqat, RahbarObyekt, RahbarPanel, RahbarTasdiq } from '../../api/t2-rahbar-panel';
import { bosqichFoizlari, diqqatYoli, faktKarta, kartaHolati, trendNuqtalari, type DavrTur, type KartaHolat } from '../../lib/rahbar-panel/markaz';
import { kimMatni } from '../../lib/raqam-belgi';

const KIRITISH_YOL = '/admin/moliya';
const HOLAT_RANG: Record<KartaHolat, string> = { yaxshi: 'var(--ok)', etibor: 'var(--warn)', xavf: 'var(--danger)', nomalum: 'var(--border)' };
const pul = (v: number | null | undefined) => (v == null ? null : <FmtN val={v} />);

/* ───────────── Davr ───────────── */
export function DavrTanlov({ qiymat, onChange }: { qiymat: DavrTur; onChange: (d: DavrTur) => void }) {
  const variantlar: Array<[DavrTur, string]> = [['oy', t('Oy')], ['chorak', t('Chorak')], ['yil', t('Yil')], ['hammasi', t('Hammasi')]];
  return (
    <div role="radiogroup" aria-label={t('Davr')} className="inline-flex rounded-md border border-border p-0.5" data-testid="davr-tanlov">
      {variantlar.map(([k, nom]) => (
        <button key={k} type="button" role="radio" aria-checked={qiymat === k} onClick={() => onChange(k)}
          className={`rounded px-2.5 py-1 text-[12px] ${qiymat === k ? 'bg-accent text-white' : 'text-text-dim hover:bg-surface-2'}`}>{nom}</button>
      ))}
    </div>
  );
}

/* ───────────── §1 Kartalar ───────────── */
function Sparkline({ nuqtalar }: { nuqtalar: Array<number | null> }) {
  const bor = nuqtalar.filter((v): v is number => v != null);
  if (bor.length < 2) return null;
  const max = Math.max(...bor, 1), w = 96, h = 24, qadam = w / Math.max(nuqtalar.length - 1, 1);
  const yol = nuqtalar.map((v, i) => (v == null ? null : `${(i * qadam).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`))
    .reduce<string[]>((acc, p) => { if (p) acc.push(p); return acc; }, []).join(' ');
  return <svg width={w} height={h} aria-hidden="true" className="mt-1 text-accent"><polyline points={yol} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function Karta({ nom, savol, holat, children, ost, trend, href }: {
  nom: string; savol: string; holat: KartaHolat; children: ReactNode; ost?: ReactNode; trend?: Array<number | null>; href?: string;
}) {
  return (
    <section className="fz-panel flex min-w-0 flex-col gap-1 border-l-4" style={{ borderLeftColor: HOLAT_RANG[holat] }} data-testid="rahbar-karta" data-holat={holat}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{nom}</h3>
          <p className="text-[11px] text-text-mute">{savol}</p>
        </div>
        {href && <Link to={href} className="shrink-0 text-text-mute hover:text-accent" aria-label={`${nom}: ${t('batafsil')}`}><ArrowUpRight size={14} /></Link>}
      </div>
      <div className="min-w-0">{children}</div>
      {trend && <Sparkline nuqtalar={trend} />}
      {ost && <div className="text-[11px] text-text-dim">{ost}</div>}
    </section>
  );
}

function Kiritilmagan({ manbalar }: { manbalar?: string[] }) {
  return (
    <span className="flex flex-col gap-0.5" data-testid="karta-kiritilmagan">
      <span className="text-[15px] text-text-mute">{t('kiritilmagan')}</span>
      {manbalar && manbalar.length > 0 && <span className="text-[10.5px] text-text-mute">{t('Manba yo‘q: {m}', { m: manbalar.join(', ') })}</span>}
      <Link to={KIRITISH_YOL} className="text-[10.5px] text-accent underline">{t('Moliya bo‘limida kiritiladi →')}</Link>
    </span>
  );
}

export const DIQQAT_ID = 'rahbar-diqqat';
const diqqatgaOt = () => document.getElementById(DIQQAT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function RahbarKartalar({ p }: { p: RahbarPanel }) {
  const k = p.kartalar;
  const trend = trendNuqtalari(p.pul_oqimi.oylar, 'bajarildi');
  const tolovTrend = trendNuqtalari(p.pul_oqimi.oylar, 'tolov');
  const yosh = k.debitor.yosh;
  const fk = faktKarta(p);
  // Shartlar JSX dan oldin (til qo'riqchisi: JSX ichida `>`/`<` taqqoslash bo'lmasin).
  const faktFoizBor = fk.foizSmeta != null;
  const davrTanlangan = p.davr?.dan != null || p.davr?.gacha != null;
  const f2FoizBor = k.bajarildi.foiz_smeta != null;
  const reestrFarqBor = k.bajarildi.reestr != null && Math.abs(k.bajarildi.reestr.farq) > 1;
  const topshirilmaganBor = fk.topshirilmagan != null;
  const topshirilmaganMusbat = fk.topshirilmagan != null && fk.topshirilmagan > 1;
  const topshirilmaganDiqqat = fk.diqqatSoni > 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7" aria-label={t('Asosiy ko‘rsatkichlar')}>
      <Karta nom={t('Portfel')} savol={t('Jami qancha ishim bor?')} holat={kartaHolati('portfel', p)} href="/admin/shartnoma-liniya"
        ost={<>{t('Shartnomalar (QQS bilan)')}: {k.portfel.shartnoma_qqs_bilan != null ? <FmtN val={k.portfel.shartnoma_qqs_bilan} /> : t('kiritilmagan')} · {k.portfel.shartnoma_soni}</>}>
        <SummaJuft paket={k.portfel.smeta} yorliq={t('Smeta, QQS bilan')} kiritishYoli={{ yol: '/admin/smeta-studio' }} />
      </Karta>
      <Karta nom={t('Bajarildi (fakt)')} savol={t('Haqiqatda qancha ish bajarildi?')} holat={kartaHolati('fakt', p)} href="/admin/fakt"
        ost={<span data-testid="fakt-karta-ost">
          {faktFoizBor && <>{t('smetadan {f}%', { f: fk.foizSmeta ?? 0 })}</>}
          {davrTanlangan && <span className="block text-text-mute">{t('jami, davrdan qat’i nazar')}</span>}
        </span>}>
        <SummaJuft paket={fk.fakt} yorliq={t('Fakt, QQS bilan')} kiritishYoli={{ yol: '/admin/fakt' }} />
      </Karta>
      <Karta nom={t('Topshirildi (F2)')} savol={t('Buyurtmachiga qanchasini topshirdim?')} holat={kartaHolati('bajarildi', p)} trend={trend} href="/admin/f2-reestr"
        ost={<>
          {t('Tasdiqlangan F2')}: {k.bajarildi.akt_soni}
          {f2FoizBor && <> · {t(k.bajarildi.foiz_smeta_joriy ? 'smeta + o‘zgarishlardan {f}%' : 'smetadan {f}%', { f: k.bajarildi.foiz_smeta ?? 0 })}</>}
          {reestrFarqBor && <span className="block text-warn">{t('Reestr bilan farq')}: <FmtN val={k.bajarildi.reestr?.farq ?? 0} /></span>}
          {topshirilmaganBor && (
            <span className={`mt-1 block border-t border-border/60 pt-1 ${topshirilmaganMusbat ? 'text-warn' : ''}`} data-testid="topshirilmagan">
              {t('Bajarildi, lekin topshirilmagan')}: <b className="tabular-nums"><FmtN val={fk.topshirilmagan ?? 0} /></b>
              <span className="block text-[10.5px] text-text-mute">{t('fakt − tasdiqlangan F2, QQS bilan')}</span>
              {topshirilmaganDiqqat && <button type="button" className="text-[10.5px] text-accent underline" onClick={diqqatgaOt} data-testid="topshirilmagan-diqqat">
                {t('Diqqat ro‘yxatida: {n} obyekt →', { n: fk.diqqatSoni })}</button>}
            </span>
          )}
        </>}>
        <SummaJuft paket={k.bajarildi.davr} yorliq={t('F2, QQS bilan')} />
      </Karta>
      <Karta nom={t('To‘landi')} savol={t('Qancha pul oldim?')} holat={kartaHolati('tolandi', p)} trend={k.tolandi.jami != null ? tolovTrend : undefined} href="/admin/moliya"
        ost={k.tolandi.jami != null ? <>{t('Yozuvlar')}: {k.tolandi.yozuv_soni} · {t('jami')}: <FmtN val={k.tolandi.jami} /></> : undefined}>
        {k.tolandi.davr == null ? <Kiritilmagan manbalar={k.tolandi.manbalar_yoq} /> : <b className="text-[15px]">{pul(k.tolandi.davr)}</b>}
      </Karta>
      <Karta nom={t('Debitor')} savol={t('Menga kim qancha qarz va necha kundan beri?')} holat={kartaHolati('debitor', p)} href="/admin/qarzdorlik"
        ost={yosh ? <>0–30: <FmtN val={yosh.k0_30} /> · 30–60: <FmtN val={yosh.k30_60} /> · <span className={yosh.k60 > 0 ? 'text-danger' : ''}>60+: <FmtN val={yosh.k60} /></span></> : undefined}>
        {k.debitor.qiymat == null ? <Kiritilmagan manbalar={k.debitor.manbalar_yoq} /> : <b className="text-[15px]">{pul(k.debitor.qiymat)}</b>}
      </Karta>
      <Karta nom={t('Kreditor')} savol={t('Men kimga qarzman?')} holat={kartaHolati('kreditor', p)}>
        {k.kreditor.qiymat == null ? <Kiritilmagan manbalar={k.kreditor.manbalar_yoq} /> : <b className="text-[15px]">{pul(k.kreditor.qiymat)}</b>}
      </Karta>
      <Karta nom={t('Rentabellik')} savol={t('Pul ishlayapmanmi?')} holat={kartaHolati('rentabellik', p)}
        ost={<>{t('Daromad (F2, QQS siz)')}: {k.rentabellik.daromad != null ? <FmtN val={k.rentabellik.daromad} /> : '—'}</>}>
        {k.rentabellik.tannarx == null
          ? <Kiritilmagan manbalar={k.rentabellik.manbalar_yoq} />
          : <span className="flex flex-col"><b className="text-[15px]">{k.rentabellik.foiz != null ? `${k.rentabellik.foiz}%` : '—'}</b>
            <span className="text-[10.5px] text-text-mute">{t('marja')}: {pul(k.rentabellik.marja) ?? '—'}</span></span>}
      </Karta>
    </div>
  );
}

/* ───────────── §2 Pul oqimi ───────────── */
export function PulOqimi({ p }: { p: RahbarPanel }) {
  const oylar = p.pul_oqimi.oylar;
  const max = Math.max(1, ...oylar.flatMap((o) => [o.bajarildi ?? 0, o.tolov ?? 0, o.xarajat ?? 0]));
  const pr = p.pul_oqimi.prognoz;
  const ustun = (v: number | null, rang: string, nom: string) => v == null
    ? <span className="w-2 rounded-t bg-border/60" style={{ height: 4 }} title={`${nom}: ${t('kiritilmagan')}`} />
    : <span className="w-2 rounded-t" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: rang }} title={`${nom}: ${v.toLocaleString('ru-RU')}`} />;
  return (
    <section className="fz-card" aria-label={t('Pul oqimi')}>
      <div className="fz-card__head"><div>
        <h2 className="fz-card__title">{t('Pul oqimi')}</h2>
        <p className="fz-card__sub">{t('Oylar bo‘yicha: bajarildi (F2, QQS bilan) · to‘lov tushdi · xarajat. Kulrang — kiritilmagan.')}</p>
      </div></div>
      <div className="fz-card__body grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <div className="flex h-40 min-w-[480px] items-end gap-2" data-testid="pul-oqimi-grafik">
            {oylar.map((o) => (
              <div key={o.oy} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full items-end gap-0.5">
                  {ustun(o.bajarildi, 'var(--accent)', t('Bajarildi'))}
                  {ustun(o.tolov, 'var(--ok)', t('To‘lov'))}
                  {ustun(o.xarajat, 'var(--warn)', t('Xarajat'))}
                </div>
                <span className="text-[10px] text-text-mute">{o.oy.slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="fz-panel text-[12.5px]" data-testid="prognoz">
          <p className="font-semibold">{t('Keyingi {n} kun prognozi', { n: pr.kun })}</p>
          <p className="flex justify-between gap-2"><span>{t('Qoralama F2')}</span><span>{pr.qoralama_f2 != null ? <FmtN val={pr.qoralama_f2} /> : '—'}</span></p>
          <p className="flex justify-between gap-2"><span>{t('To‘lanmagan F2')}</span><span>{pr.tolanmagan_f2 != null ? <FmtN val={pr.tolanmagan_f2} /> : t('kiritilmagan')}</span></p>
          <p className="flex justify-between gap-2 border-t border-border/60 pt-1 font-semibold"><span>{t('Kutilayotgan tushum')}</span><span>{pr.kutilayotgan != null ? <FmtN val={pr.kutilayotgan} /> : t('kiritilmagan')}</span></p>
          {pr.manbalar_yoq.length > 0 && <p className="mt-1 text-[10.5px] text-text-mute">{t('Manba yo‘q: {m}', { m: pr.manbalar_yoq.join(', ') })}</p>}
        </div>
      </div>
    </section>
  );
}

/* ───────────── §3 Obyektlar matritsasi ───────────── */
function Bosqichlar({ o }: { o: RahbarObyekt }) {
  const nom: Record<string, string> = { fakt: t('Fakt'), f2: 'F2', f3: 'F3' };
  return (
    <span className="flex w-36 flex-col gap-0.5" data-testid="bosqich">
      {bosqichFoizlari(o.bajarilish).map((b) => (
        <span key={b.kalit} className="flex items-center gap-1 text-[10px] text-text-mute">
          <span className="w-6 shrink-0">{nom[b.kalit]}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded bg-border/50">
            {b.foiz != null && <span className="block h-full bg-accent" style={{ width: `${b.foiz}%` }} />}
          </span>
          <span className="w-9 shrink-0 text-right">{b.foiz != null ? `${b.foiz}%` : '—'}</span>
        </span>
      ))}
    </span>
  );
}

const DIQQAT_NOM: Record<string, () => string> = {
  fakt_topshirilmagan: () => t('Bajarilgan, lekin F2 topshirilmagan'),
  f2_faktdan_oshgan: () => t('F2 faktdan oshgan'),
  smetadan_oshgan: () => t('Smetadan oshgan hajm'),
  f3_chiqarilmagan: () => t('Tasdiqlangan F2 — F3 chiqarilmagan'),
  shartnoma_limit: () => t('Shartnoma limitiga yaqin'),
  tolov_kechikkan: () => t('To‘lov 60 kundan ortiq kechikkan'),
  reestr_farq: () => t('Tizim ↔ reestr farqi'),
  narxsiz: () => t('Narxsiz qatorlar'),
  sklad_manfiy: () => t('Sklad manfiy qoldig‘i'),
};
const SIGNAL_NOM: Record<string, () => string> = {
  missing_price: () => t('Narx asosi yetishmaydi'), data_quality: () => t('Smeta ma’lumotini tekshirish kerak'), document_missing: () => t('Majburiy hujjat qayd etilmagan'),
};

export function ObyektlarMatritsa({ p, onTanla }: { p: RahbarPanel; onTanla?: (o: RahbarObyekt) => void }) {
  const ustunlar = useMemo<Ustun<RahbarObyekt>[]>(() => [
    { kalit: 'nom', nom: t('Obyekt'), tur: 'matn', qiymat: (o) => o.nom },
    { kalit: 'loyiha', nom: t('Loyiha'), tur: 'matn', qiymat: (o) => o.loyiha_nom ?? t('Loyihasiz') },
    { kalit: 'shartnoma', nom: t('Shartnoma (QQS bilan)'), tur: 'son', qiymat: (o) => o.shartnoma?.qqs_bilan ?? null },
    { kalit: 'smeta', nom: t('Smeta (QQS bilan)'), tur: 'son', qiymat: (o) => o.smeta?.qqs_bilan ?? null },
    { kalit: 'fakt', nom: t('Fakt (QQS bilan)'), tur: 'son', qiymat: (o) => o.fakt?.qqs_bilan ?? null },
    { kalit: 'f2', nom: t('F2 (QQS bilan)'), tur: 'son', qiymat: (o) => o.f2?.qqs_bilan ?? null },
    { kalit: 'tolangan', nom: t('To‘langan %'), tur: 'son', qiymat: (o) => o.tolangan_foiz },
    { kalit: 'qarz', nom: t('Qarz'), tur: 'son', qiymat: (o) => o.qarz },
    { kalit: 'signal', nom: t('Signallar'), tur: 'son', qiymat: (o) => o.signal.soni },
  ], []);
  const f = useJadvalFiltr(p.obyektlar, ustunlar);
  const F = (kalit: string) => <UstunFiltrTugma {...f.tugma(kalit)} />;
  return (
    <section className="fz-card" aria-label={t('Obyektlar matritsasi')}>
      <div className="fz-card__head"><div>
        <h2 className="fz-card__title">{t('Obyektlar')}</h2>
        <p className="fz-card__sub">{t('Bajarilish: smeta → fakt → F2 → F3. Har summa — QQS bilan asosiy; ▸ bosilsa tafsilot.')}</p>
      </div></div>
      <FiltrHolatQatori soni={f.soni} natija={f.natija.length} jami={p.obyektlar.length} tozala={f.tozala} />
      <div className="fz-table-wrap hidden md:block">
        <table className="fz-table min-w-[1220px]" data-testid="obyekt-matritsa">
          <thead><tr>
            <th>{t('Obyekt')}{F('nom')}</th><th>{t('Loyiha')}{F('loyiha')}</th>
            <th className="fz-c-num">{t('Shartnoma (QQS bilan)')}{F('shartnoma')}</th>
            <th className="fz-c-num">{t('Smeta')}{F('smeta')}</th>
            <th>{t('Bajarilish')}</th>
            <th className="fz-c-num">{t('Fakt')}{F('fakt')}</th>
            <th className="fz-c-num">{t('Tasdiqlangan F2')}{F('f2')}</th>
            <th className="fz-c-num">{t('Qoralama F2')}</th>
            <th className="fz-c-num">{t('To‘langan %')}{F('tolangan')}</th>
            <th className="fz-c-num">{t('Qarz')}{F('qarz')}</th>
            <th>{t('Eng katta risk')}{F('signal')}</th>
          </tr></thead>
          <tbody>
            {f.natija.map((o) => (
              <tr key={o.obyekt_id}>
                <td className="max-w-56"><Link className="inline-flex items-center gap-1 font-medium hover:underline" to={`/admin/holat/${o.obyekt_id}?obyekt=${o.obyekt_id}`}>{o.nom}<ArrowUpRight size={12} aria-hidden="true" /></Link>
                  {onTanla && <button type="button" className="block text-[10.5px] text-accent underline" onClick={() => onTanla(o)} data-testid="obyekt-panel-och">{t('▸ obyekt paneli')}</button>}</td>
                <td className="text-[12px] text-text-dim">{o.loyiha_nom ?? '—'}</td>
                <td className="fz-c-num">{o.shartnoma?.qqs_bilan != null ? <><FmtN val={o.shartnoma.qqs_bilan} />{o.shartnoma.umumiy && <span className="block text-[10px] text-text-mute">{t('bir nechta obyekt uchun')}</span>}</> : <span className="text-text-mute">{t('kiritilmagan')}</span>}</td>
                <td className="fz-c-num"><SummaJuft paket={o.smeta} kichik kesimYoq className="items-end text-right" /></td>
                <td><Bosqichlar o={o} /></td>
                <td className="fz-c-num" data-testid="matritsa-fakt"><SummaJuft paket={o.fakt} kichik kesimYoq className="items-end text-right" /></td>
                <td className="fz-c-num"><SummaJuft paket={o.f2} kichik kesimYoq className="items-end text-right" /></td>
                <td className="fz-c-num">{o.f2_qoralama.soni > 0 ? <><FmtN val={o.f2_qoralama.qqs_bilan} /><span className="block text-[10px] text-text-mute">{o.f2_qoralama.soni} {t('ta')}</span></> : '—'}</td>
                <td className="fz-c-num">{o.tolangan_foiz != null ? `${o.tolangan_foiz}%` : <span className="text-text-mute">{t('kiritilmagan')}</span>}</td>
                <td className="fz-c-num">{o.qarz != null ? <FmtN val={o.qarz} /> : <span className="text-text-mute">{t('kiritilmagan')}</span>}</td>
                <td className="text-[12px]">{o.signal.soni > 0
                  ? <span className={o.signal.kritik > 0 ? 'text-danger' : 'text-warn'}>{(o.signal.eng_kop && SIGNAL_NOM[o.signal.eng_kop]?.()) || o.signal.eng_kop} · {o.signal.soni}</span>
                  : <span className="text-text-mute">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Telefon (375px): kartalar */}
      <ul className="flex flex-col gap-2 p-3 md:hidden" data-testid="obyekt-kartalar">
        {f.natija.map((o) => (
          <li key={o.obyekt_id} className="fz-panel flex flex-col gap-1">
            <Link className="font-medium hover:underline" to={`/admin/holat/${o.obyekt_id}?obyekt=${o.obyekt_id}`}>{o.nom}</Link>
            {onTanla && <button type="button" className="self-start text-[11px] text-accent underline" onClick={() => onTanla(o)}>{t('▸ obyekt paneli')}</button>}
            <SummaJuft paket={o.fakt} kichik kesimYoq yorliq={t('Fakt, QQS bilan')} />
            <SummaJuft paket={o.f2} kichik kesimYoq yorliq={t('F2, QQS bilan')} />
            <Bosqichlar o={o} />
            <span className="text-[11px] text-text-dim">{t('Qarz')}: {o.qarz != null ? <FmtN val={o.qarz} /> : t('kiritilmagan')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── §4 Diqqat ───────────── */
export function DiqqatRoyxati({ diqqat }: { diqqat: RahbarDiqqat[] }) {
  return (
    <section className="fz-card" id={DIQQAT_ID} aria-label={t('Diqqat talab qiladi')}>
      <div className="fz-card__head">
        <h2 className="fz-card__title inline-flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" />{t('Diqqat talab qiladi')}</h2>
        <span className="fz-chip">{diqqat.length}</span>
      </div>
      {diqqat.length === 0
        ? <p className="fz-card__body text-[13px] text-text-dim">{t('Hozir pulga ta’sir qiladigan muammo topilmadi.')}</p>
        : <ol className="divide-y divide-border" data-testid="diqqat-royxati">
          {diqqat.map((d, i) => (
            <li key={`${d.kod}-${d.obyekt_id ?? i}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="w-5 text-[12px] text-text-mute">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{DIQQAT_NOM[d.kod]?.() ?? d.kod}</p>
                <p className="text-[11.5px] text-text-dim">{d.nom ?? t('Kompaniya bo‘yicha')}{d.soni != null && <> · {d.soni} {t('ta')}</>}</p>
              </div>
              <span className="text-right text-[13px] tabular-nums">{d.summa_tasir != null ? <FmtN val={d.summa_tasir} /> : <span className="text-text-mute">{t('summasi noma’lum')}</span>}</span>
              <Link to={diqqatYoli(d)} className="fz-btn fz-btn--sm">{t('Ochish')}</Link>
            </li>
          ))}
        </ol>}
    </section>
  );
}

/* ───────────── §5 Tasdiq kutmoqda ───────────── */
function kunOldin(iso: string | null): string {
  if (!iso) return '—';
  const v = Date.parse(iso);
  if (!Number.isFinite(v)) return '—';
  const kun = Math.max(0, Math.floor((Date.now() - v) / 86_400_000));
  return kun === 0 ? t('bugun') : t('{n} kun', { n: kun });
}

export function TasdiqNavbati({ royxat, obyektNomi }: { royxat: RahbarTasdiq[]; obyektNomi: (id: number | null) => string }) {
  const yol = (x: RahbarTasdiq) => (x.tur === 'f2' ? `/admin/f2-tarix?obyekt=${x.obyekt_id ?? ''}` : '/admin/zayavka');
  return (
    <section className="fz-card" aria-label={t('Tasdiq kutmoqda')}>
      <div className="fz-card__head">
        <h2 className="fz-card__title inline-flex items-center gap-2"><Clock size={16} aria-hidden="true" />{t('Tasdiq kutmoqda')}</h2>
        <span className="fz-chip">{royxat.length}</span>
      </div>
      {royxat.length === 0
        ? <p className="fz-card__body text-[13px] text-text-dim">{t('Tasdiq kutayotgan hujjat yo‘q.')}</p>
        : <ul className="divide-y divide-border" data-testid="tasdiq-navbati">
          {royxat.map((x) => (
            <li key={`${x.tur}-${x.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className="fz-chip">{x.tur === 'f2' ? 'F2' : t('Zayavka')}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{x.nom ?? '—'}</p>
                <p className="text-[11.5px] text-text-dim">{obyektNomi(x.obyekt_id)}{kimMatni(x.kim == null ? null : String(x.kim)) && <> · {kimMatni(String(x.kim))}</>}</p>
              </div>
              <span className="text-[12px] text-text-mute">{kunOldin(x.qachondan)}</span>
              <span className="w-32 text-right tabular-nums">{x.summa != null ? <FmtN val={x.summa} /> : ''}</span>
              <Link to={yol(x)} className="fz-btn fz-btn--sm">{t('Ochish')}</Link>
            </li>
          ))}
        </ul>}
    </section>
  );
}
