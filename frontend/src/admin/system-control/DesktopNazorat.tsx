/**
 * DesktopNazorat — «Tizim nazorati → Windows dastur»: qurilmalar, amallar (bekor / hammasini bekor / muddat),
 * siyosat (kill switch, qurilma limiti, oflayn muddati, minimal versiya) va o'rnatuvchi versiyasi.
 *
 *   kompaniyaId = null  → platforma superadmini, barcha kompaniyalar (server tekshiradi);
 *   kompaniyaId = n     → shu kompaniya (superadmin yoki kompaniya boss/admin).
 * UI hech narsani ruxsat qilmaydi: tugma ko'rinsa ham server rad etishi mumkin (javob kodi ko'rsatiladi).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Ban, Building2, Clock, Download, Laptop, Loader2, Search, ShieldAlert, ShieldCheck, UserX, WifiOff } from 'lucide-react';
import { useDesktopBuyruq, useDesktopNazorat, type DesktopBuyruq } from '../../api/t2-desktop';
import {
  localDanMs, msDanLocal, qurilmaFiltrla, qurilmaKompaniyalari, sababYaroqli, siyosatShakldan, siyosatShaklga, vaqtMatn, versiyaEskimi,
  type DesktopFiltr, type DesktopHolat, type DesktopQurilma, type DesktopSiyosat, type SiyosatShakl,
} from '../../lib/desktop-nazorat';
import { t } from '../../i18n/til';

const HOLAT_NOMI: Record<DesktopHolat, string> = { faol: 'Faol', bekor: 'Bekor qilingan', muddati_otgan: 'Muddati o‘tgan' };
const HOLAT_MUHR: Record<DesktopHolat, string> = { faol: 'fz-stamp--ok', bekor: 'fz-stamp--danger', muddati_otgan: 'fz-stamp--warn' };
const AMAL_NOMI: Record<string, string> = { bekor: 'Qurilma bekor qilindi', foydalanuvchi_bekor: 'Foydalanuvchining barcha qurilmalari bekor qilindi', muddat: 'Muddat o‘zgartirildi', siyosat: 'Siyosat o‘zgartirildi' };
/** Server rad kodlari — foydalanuvchiga tushunarli matn. */
const XATO_MATNI: Record<string, string> = {
  AUTHORIZATION_DENIED: 'Bu amal uchun ruxsatingiz yo‘q.', SUPERADMIN_REQUIRED: 'Bu amal faqat platforma superadminiga ruxsat etilgan.',
  TENANT_FORBIDDEN: 'Bu foydalanuvchi sizning kompaniyangiz a’zosi emas.', SABAB_REQUIRED: 'Sababni yozing (kamida 3 belgi).',
  STALE_VERSION: 'Siyosatni boshqa kishi o‘zgartirgan — sahifani yangilab qayta urinib ko‘ring.', EXPIRY_INVALID: 'Muddat noto‘g‘ri: hozirdan keyin va kirish sessiyasi tugashidan oldin bo‘lsin.',
  POLICY_VALUE_INVALID: 'Siyosat qiymati noto‘g‘ri.', DEVICE_REVOKED: 'Qurilma allaqachon bekor qilingan.',
};
const xatoMatni = (e: unknown) => { const c = (e as { code?: string })?.code ?? ''; return XATO_MATNI[c] ? t(XATO_MATNI[c]) : t('Amal bajarilmadi: {x}.', { x: c || t('xato') }); };

type Amal = { tur: 'bekor' | 'foydalanuvchi_bekor' | 'muddat'; q: DesktopQurilma };
/** Amal natijasi (muvaffaqiyat). Alias — til qo'riqchisi generikni matn deb o'qimasin. */
type OkVaad = Promise<boolean>;

export function DesktopNazorat({ kompaniyaId }: { kompaniyaId: number | null }) {
  const q = useDesktopNazorat(kompaniyaId);
  const buyruq = useDesktopBuyruq();
  const [filtr, setFiltr] = useState<DesktopFiltr>({ qidiruv: '', holat: 'faol', kompaniyaId: null });
  const [amal, setAmal] = useState<Amal | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const d = q.data;
  const royxat = useMemo(() => d ? qurilmaFiltrla(d.qurilmalar, filtr) : [], [d, filtr]);
  const kompaniyalar = useMemo(() => d ? qurilmaKompaniyalari(d.qurilmalar) : [], [d]);

  if (q.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-text-dim"><Loader2 className="animate-spin" size={16} aria-hidden="true" /> {t('Yuklanmoqda…')}</div>;
  if (q.isError || !d) {
    const code = (q.error as { code?: string } | null)?.code;
    return <div role="alert" className="fz-note fz-note--danger max-w-2xl">{code === 'AUTHORIZATION_DENIED' ? t('Windows dastur boshqaruviga ruxsatingiz yo‘q. Bu bo‘lim kompaniya rahbari (boss/admin) yoki platforma superadmini uchun.') : t('Ma’lumotni o‘qib bo‘lmadi: {x}.', { x: code || t('xato') })}</div>;
  }
  const superadmin = d.rol === 'superadmin';
  const global = d.siyosat.find((s) => s.kompaniya_id == null && s.manba === 'platforma');
  const minVersiya = d.samarali?.min_versiya ?? global?.min_versiya ?? null;
  const yubor = async (b: DesktopBuyruq, okMatn: string) => {
    setXabar(null);
    try { const r = await buyruq.mutateAsync(b); setXabar({ ok: true, matn: r.takror ? t('Bu amal avval bajarilgan.') : okMatn }); setAmal(null); return true; }
    catch (e) { setXabar({ ok: false, matn: xatoMatni(e) }); return false; }
  };

  return (
    <div className="flex flex-col gap-5">
      {global?.yoqilgan === false && (
        <div role="alert" className="fz-note fz-note--danger"><ShieldAlert aria-hidden="true" /><span><b>{t('Windows dastur butun platformada o‘chirilgan (kill switch).')}</b> {t('Yangi qurilma ulanmaydi, ulangan qurilmalar keyingi so‘rovda chiqarib yuboriladi.')}</span></div>
      )}
      <section className="grid grid-cols-2 border border-border sm:grid-cols-4" aria-label={t('Windows dastur ko‘rsatkichlari')}>
        <Karta nom={t('Faol qurilmalar')} qiymat={d.umumiy.faol} Ikon={Laptop} />
        <Karta nom={t('Oxirgi 24 soatda faol')} qiymat={d.umumiy.oxirgi_24s} Ikon={Activity} />
        <Karta nom={t('Bugun bekor qilingan')} qiymat={d.umumiy.bugun_bekor} Ikon={Ban} />
        <Karta nom={kompaniyaId ? t('Faol oflayn ruxsatlar') : t('Desktopdan foydalanayotgan kompaniyalar')} qiymat={kompaniyaId ? d.umumiy.lease_faol : d.umumiy.kompaniyalar} Ikon={kompaniyaId ? WifiOff : Building2} />
      </section>

      {xabar && <div role="status" className={`fz-note ${xabar.ok ? 'fz-note--ok' : 'fz-note--danger'}`}>{xabar.matn}</div>}

      <section className="fz-card">
        <div className="fz-card__head"><div><h2 className="fz-card__title">{t('Qurilmalar')}</h2><p className="fz-card__sub">{t('Windows dasturiga kirgan qurilmalar. Token o‘zi hech qachon ko‘rsatilmaydi.')}</p></div></div>
        <div className="flex flex-wrap items-end gap-2 px-4 pb-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border px-2" style={{ height: 'var(--control-md, 32px)' }}>
            <Search size={14} aria-hidden="true" className="text-text-dim" />
            <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" value={filtr.qidiruv} onChange={(e) => setFiltr({ ...filtr, qidiruv: e.target.value })}
              placeholder={t('Foydalanuvchi, qurilma, versiya yoki kompaniya')} aria-label={t('Qurilmalarni qidirish')} />
          </label>
          <select className="fz-input" aria-label={t('Holat bo‘yicha')} value={filtr.holat} onChange={(e) => setFiltr({ ...filtr, holat: e.target.value as DesktopFiltr['holat'] })}>
            <option value="hammasi">{t('Barcha holatlar')}</option>
            {(Object.keys(HOLAT_NOMI) as DesktopHolat[]).map((h) => <option key={h} value={h}>{t(HOLAT_NOMI[h])}</option>)}
          </select>
          {!kompaniyaId && kompaniyalar.length > 1 && (
            <select className="fz-input" aria-label={t('Kompaniya bo‘yicha')} value={filtr.kompaniyaId ?? ''} onChange={(e) => setFiltr({ ...filtr, kompaniyaId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('Barcha kompaniyalar')}</option>
              {kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
            </select>
          )}
          <span className="text-[12px] text-text-dim">{t('{n} ta qurilma', { n: royxat.length })}</span>
        </div>
        {amal && <AmalPaneli amal={amal} superadmin={superadmin} band={buyruq.isPending} onBekor={() => setAmal(null)}
          onTasdiq={(sabab, tugaydi) => {
            const k = kompaniyaId;
            if (amal.tur === 'bekor') return yubor({ action: 'bekor', device_id: amal.q.device_id, kompaniya_id: k, sabab }, t('Qurilma bekor qilindi. Dastur keyingi so‘rovda kirish oynasiga qaytadi.'));
            if (amal.tur === 'foydalanuvchi_bekor') return yubor({ action: 'foydalanuvchi_bekor', foydalanuvchi_id: amal.q.foydalanuvchi_id, kompaniya_id: k, sabab }, t('Foydalanuvchining barcha qurilmalari bekor qilindi — qayta kirishi shart.'));
            return yubor({ action: 'muddat', device_id: amal.q.device_id, kompaniya_id: k, tugaydi: tugaydi!, sabab }, t('Qurilma muddati o‘zgartirildi.'));
          }} />}
        <div className="fz-table-wrap max-h-[560px] rounded-none border-0 border-t">
          <table className="fz-table" style={{ minWidth: 1040 }}>
            <thead><tr>
              <th>{t('Foydalanuvchi')}</th><th>{t('Kompaniya')}</th><th>{t('Qurilma')}</th><th>{t('Ulangan')}</th>
              <th>{t('Oxirgi faollik')}</th><th>{t('Tugaydi')}</th><th>{t('Holat')}</th><th>{t('Oflayn')}</th><th>{t('Amallar')}</th>
            </tr></thead>
            <tbody>
              {royxat.map((x) => (
                <tr key={x.device_id}>
                  <td><div className="font-medium">{x.ism || x.login || '#' + x.foydalanuvchi_id}</div>{x.login && <div className="text-[11.5px] text-text-mute">{x.login}</div>}</td>
                  <td>{x.kompaniyalar.map((k) => k.nom).join(', ') || '—'}</td>
                  <td>
                    <div>{x.qurilma_nomi || t('Nomsiz qurilma')}</div>
                    <div className="text-[11.5px] text-text-mute">{[x.os, x.ilova_versiya ? 'v' + x.ilova_versiya : t('versiya noma’lum')].filter(Boolean).join(' · ')}</div>
                    {x.holat === 'faol' && versiyaEskimi(x.ilova_versiya, minVersiya) && <span className="fz-stamp fz-stamp--warn mt-1">{t('Yangilash kerak')}</span>}
                  </td>
                  <td className="tabular-nums">{vaqtMatn(x.yaratildi)}</td>
                  <td className="tabular-nums">{vaqtMatn(x.oxirgi_kirish)}</td>
                  <td className="tabular-nums">{vaqtMatn(x.tugaydi)}</td>
                  <td><span className={`fz-stamp ${HOLAT_MUHR[x.holat]}`}>{t(HOLAT_NOMI[x.holat])}</span>{x.bekor_sabab && <div className="mt-1 max-w-[180px] truncate text-[11.5px] text-text-mute" title={x.bekor_sabab}>{x.bekor_sabab}</div>}</td>
                  <td>{x.lease_faol ? <span className="fz-stamp fz-stamp--info">{t('{n} obyekt', { n: x.oxirgi_lease_obyekt_soni ?? 0 })}</span> : <span className="text-text-mute">—</span>}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {x.holat === 'faol' && <button type="button" className="fz-btn fz-btn--sm fz-btn--danger" onClick={() => setAmal({ tur: 'bekor', q: x })}><Ban size={13} aria-hidden="true" /> {t('Bekor qilish')}</button>}
                      <button type="button" className="fz-btn fz-btn--sm" onClick={() => setAmal({ tur: 'foydalanuvchi_bekor', q: x })} title={t('Foydalanuvchining barcha qurilmalarini bekor qilib, qayta kirishga majburlash')}><UserX size={13} aria-hidden="true" /> {t('Qayta kirishga majburlash')}</button>
                      {superadmin && x.holat === 'faol' && <button type="button" className="fz-btn fz-btn--sm" onClick={() => setAmal({ tur: 'muddat', q: x })}><Clock size={13} aria-hidden="true" /> {t('Muddat')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!royxat.length && <tr><td colSpan={9} className="py-6 text-center text-text-dim">{t('Mos qurilma topilmadi.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <SiyosatBolimi kompaniyaId={kompaniyaId} superadmin={superadmin} siyosat={d.siyosat} samarali={d.samarali} band={buyruq.isPending}
        saqla={(manba, kid, qiymat, sabab, versiya) => yubor({ action: 'siyosat', manba, kompaniya_id: kid, qiymat, sabab, expected_versiya: versiya }, t('Siyosat saqlandi. Server keyingi so‘rovdan boshlab qo‘llaydi.'))} />

      <section className="fz-card">
        <div className="fz-card__head"><div><h2 className="fz-card__title">{t('Amallar jurnali')}</h2><p className="fz-card__sub">{t('Kim, qachon, nima uchun — har amal sabab bilan yoziladi.')}</p></div></div>
        <div className="fz-table-wrap max-h-[360px] rounded-none border-0 border-t">
          <table className="fz-table">
            <thead><tr><th>{t('Vaqt')}</th><th>{t('Kim')}</th><th>{t('Amal')}</th><th>{t('Sabab')}</th></tr></thead>
            <tbody>
              {d.audit.map((a) => <tr key={a.id}><td className="tabular-nums">{vaqtMatn(a.vaqt)}</td><td>{a.actor_ism || '#' + a.actor_id}</td><td>{t(AMAL_NOMI[a.amal] ?? a.amal)}</td><td>{a.sabab}</td></tr>)}
              {!d.audit.length && <tr><td colSpan={4} className="py-6 text-center text-text-dim">{t('Hali amal yo‘q.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Karta({ nom, qiymat, Ikon }: { nom: string; qiymat: number; Ikon: typeof Activity }) {
  return <div className="fz-panel rounded-none border-0 border-r border-border last:border-r-0">
    <div className="fz-panel__h"><span>{nom}</span><Ikon size={15} aria-hidden="true" className="text-[var(--accent-text)]" /></div>
    <p className="text-2xl font-semibold tabular-nums">{qiymat}</p>
  </div>;
}

function AmalPaneli({ amal, superadmin, band, onBekor, onTasdiq }: { amal: Amal; superadmin: boolean; band: boolean; onBekor: () => void; onTasdiq: (sabab: string, tugaydi?: number) => OkVaad }) {
  const [sabab, setSabab] = useState('');
  const [muddat, setMuddat] = useState(() => msDanLocal(Math.min(amal.q.tugaydi, amal.q.sessiya_exp)));
  const kim = amal.q.ism || amal.q.login || '#' + amal.q.foydalanuvchi_id;
  const sarlavha = amal.tur === 'bekor' ? t('«{q}» qurilmasini bekor qilish ({k})', { q: amal.q.qurilma_nomi || t('Nomsiz qurilma'), k: kim })
    : amal.tur === 'foydalanuvchi_bekor' ? t('{k}: barcha qurilmalarni bekor qilish va qayta kirishga majburlash', { k: kim })
      : t('{k}: qurilma muddatini o‘zgartirish', { k: kim });
  const ms = amal.tur === 'muddat' ? localDanMs(muddat) : null;
  const yaroqli = sababYaroqli(sabab) && (amal.tur !== 'muddat' || (ms != null && ms - Date.now() > 60_000 && amal.q.sessiya_exp - ms >= 0));
  return (
    <form className="mx-4 mb-3 flex flex-col gap-2 rounded-md border border-border p-3" aria-label={t('Amalni tasdiqlash')}
      onSubmit={(e) => { e.preventDefault(); if (yaroqli) void onTasdiq(sabab.trim(), ms ?? undefined); }}>
      <b className="text-[13px]">{sarlavha}</b>
      <span className="text-[12px] text-text-dim">{amal.tur === 'muddat'
        ? t('Muddat kirish sessiyasi tugashidan ({x}) oshmaydi.', { x: vaqtMatn(amal.q.sessiya_exp) })
        : t('Dastur keyingi so‘rovda chiqarib yuboriladi va qayta kirish talab qilinadi. Oflayn ruxsatlar ham bekor bo‘ladi.')}</span>
      {amal.tur === 'muddat' && superadmin && (
        <label className="flex items-center gap-2 text-[13px]">{t('Yangi muddat')}
          <input type="datetime-local" className="fz-input" value={muddat} onChange={(e) => setMuddat(e.target.value)} max={msDanLocal(amal.q.sessiya_exp)} />
        </label>
      )}
      <textarea className="fz-input min-h-[56px]" value={sabab} onChange={(e) => setSabab(e.target.value)} maxLength={500}
        placeholder={t('Sabab (majburiy): masalan, noutbuk yo‘qolgan')} aria-label={t('Sabab')} />
      <div className="flex gap-2">
        <button type="submit" className="fz-btn fz-btn--danger" disabled={!yaroqli || band}>{band && <Loader2 size={13} className="animate-spin" aria-hidden="true" />} {t('Tasdiqlash')}</button>
        <button type="button" className="fz-btn" onClick={onBekor}>{t('Bekor')}</button>
      </div>
    </form>
  );
}

type Saqla = (manba: 'platforma' | 'kompaniya', kid: number | null, qiymat: Record<string, unknown>, sabab: string, versiya: number | null) => OkVaad;

function SiyosatBolimi({ kompaniyaId, superadmin, siyosat, samarali, band, saqla }: {
  kompaniyaId: number | null; superadmin: boolean; siyosat: DesktopSiyosat[]; samarali: { yoqilgan: boolean; max_qurilma: number; lease_soat: number; oflayn: boolean; min_versiya: string | null } | null; band: boolean; saqla: Saqla;
}) {
  const global = siyosat.find((s) => s.kompaniya_id == null && s.manba === 'platforma');
  const platformaK = kompaniyaId ? siyosat.find((s) => s.kompaniya_id === kompaniyaId && s.manba === 'platforma') : undefined;
  const ozK = kompaniyaId ? siyosat.find((s) => s.kompaniya_id === kompaniyaId && s.manba === 'kompaniya') : undefined;
  const boshqalar = siyosat.filter((s) => s.kompaniya_id != null);
  return (
    <section className="fz-card">
      <div className="fz-card__head"><div><h2 className="fz-card__title">{t('Siyosat')}</h2>
        <p className="fz-card__sub">{t('Server har kirish, har so‘rov va har oflayn ruxsatda tekshiradi — faqat ekranda emas.')}</p></div></div>
      {samarali && (
        <dl className="mx-4 mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-5">
          <Qiymat nom={t('Desktop')} q={samarali.yoqilgan ? t('Yoqilgan') : t('O‘chirilgan')} />
          <Qiymat nom={t('Oflayn')} q={samarali.oflayn ? t('Ruxsat') : t('Taqiqlangan')} />
          <Qiymat nom={t('Qurilma limiti')} q={String(samarali.max_qurilma)} />
          <Qiymat nom={t('Oflayn muddati')} q={t('{n} soat', { n: samarali.lease_soat })} />
          <Qiymat nom={t('Minimal versiya')} q={samarali.min_versiya || '—'} />
        </dl>
      )}
      <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
        {superadmin && !kompaniyaId && <SiyosatForma sarlavha={t('Global siyosat (platforma)')} izoh={t('«Yoqilgan: yo‘q» — butun platforma uchun kill switch.')} global joriy={global} band={band}
          saqla={(q, s) => saqla('platforma', null, q, s, global?.versiya ?? null)} />}
        {superadmin && kompaniyaId && <SiyosatForma sarlavha={t('Platforma qoidasi shu kompaniya uchun')} izoh={t('Bo‘sh maydon — global qiymat. Faqat superadmin.')} joriy={platformaK} band={band}
          saqla={(q, s) => saqla('platforma', kompaniyaId, q, s, platformaK?.versiya ?? null)} />}
        {kompaniyaId && <SiyosatForma sarlavha={t('Kompaniya cheklovi')} izoh={t('Kompaniya rahbari faqat qattiqroq qila oladi: platforma ruxsat berganidan ortig‘ini ochmaydi.')} joriy={ozK} band={band}
          saqla={(q, s) => saqla('kompaniya', kompaniyaId, q, s, ozK?.versiya ?? null)} />}
        {superadmin && !kompaniyaId && (
          <div className="rounded-md border border-border p-3">
            <b className="text-[13px]">{t('Kompaniya qoidalari')}</b>
            {boshqalar.length ? <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">{boshqalar.map((s) => (
              <li key={s.id}><b>{s.kompaniya_nom || '#' + s.kompaniya_id}</b> · {s.manba === 'platforma' ? t('platforma') : t('kompaniya')} · {[
                s.yoqilgan === false ? t('o‘chirilgan') : null, s.oflayn === false ? t('oflayn yopiq') : null,
                s.max_qurilma != null ? t('limit {n}', { n: s.max_qurilma }) : null, s.lease_soat != null ? t('{n} soat', { n: s.lease_soat }) : null,
                s.min_versiya ? '≥ ' + s.min_versiya : null].filter(Boolean).join(', ') || t('meros')}</li>))}</ul>
              : <p className="mt-2 text-[12.5px] text-text-dim">{t('Kompaniya bo‘yicha alohida qoida yo‘q. Qoida qo‘yish uchun kompaniyani tanlang.')}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Qiymat({ nom, q }: { nom: string; q: ReactNode }) { return <div className="rounded-md border border-border px-2 py-1.5"><dt className="text-[11.5px] text-text-dim">{nom}</dt><dd className="font-medium">{q}</dd></div>; }

function SiyosatForma({ sarlavha, izoh, joriy, global = false, band, saqla }: { sarlavha: string; izoh: string; joriy: DesktopSiyosat | undefined; global?: boolean; band: boolean; saqla: (q: Record<string, unknown>, sabab: string) => OkVaad }) {
  const [s, setS] = useState<SiyosatShakl>(() => siyosatShaklga(joriy));
  const [sabab, setSabab] = useState('');
  const [xato, setXato] = useState<string | null>(null);
  const merosNomi = global ? t('standart') : t('meros');
  const tri = (k: 'yoqilgan' | 'oflayn', nom: string) => (
    <label className="flex flex-col gap-1 text-[12.5px]">{nom}
      <select className="fz-input" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value as SiyosatShakl['yoqilgan'] })}>
        <option value="meros">{merosNomi}</option><option value="ha">{t('ha')}</option><option value="yoq">{t('yo‘q')}</option>
      </select>
    </label>
  );
  const matn = (k: keyof SiyosatShakl, nom: string, ph: string) => (
    <label className="flex flex-col gap-1 text-[12.5px]">{nom}
      <input className="fz-input" value={String(s[k] ?? '')} placeholder={ph} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </label>
  );
  return (
    <form className="flex flex-col gap-2 rounded-md border border-border p-3" aria-label={sarlavha} onSubmit={async (e) => {
      e.preventDefault(); setXato(null);
      const r = siyosatShakldan(s, global);
      if ('xato' in r) { setXato(t(r.xato)); return; }
      if (!sababYaroqli(sabab)) { setXato(t('Sababni yozing (kamida 3 belgi).')); return; }
      if (await saqla(r.qiymat, sabab.trim())) setSabab('');
    }}>
      <div className="flex items-center gap-2"><ShieldCheck size={15} aria-hidden="true" className="text-[var(--accent-text)]" /><b className="text-[13px]">{sarlavha}</b>{joriy && <span className="text-[11.5px] text-text-mute">{t('v{n} · {x}', { n: joriy.versiya, x: vaqtMatn(joriy.yangilandi) })}</span>}</div>
      <span className="text-[12px] text-text-dim">{izoh}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tri('yoqilgan', t('Yoqilgan'))}
        {tri('oflayn', t('Oflayn ishlash'))}
        {matn('max_qurilma', t('Qurilma limiti (1 kishiga)'), global ? '10' : merosNomi)}
        {matn('lease_soat', t('Oflayn muddati, soat (≤72)'), global ? '72' : merosNomi)}
        {matn('min_versiya', t('Minimal versiya'), '1.2.0')}
      </div>
      {global && (
        <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-[12.5px] font-medium sm:col-span-2"><Download size={14} aria-hidden="true" /> {t('Yangilanish (foydalanuvchilarga ko‘rsatiladi)')}</div>
          {matn('joriy_versiya', t('Joriy o‘rnatuvchi versiyasi'), '0.2.0')}
          {matn('yuklab_olish_url', t('Yuklab olish havolasi (https://)'), 'https://')}
          <div className="sm:col-span-2">{matn('yangilanish_izoh', t('Izoh (nima yangi)'), '')}</div>
        </div>
      )}
      <input className="fz-input" value={sabab} onChange={(e) => setSabab(e.target.value)} maxLength={500} placeholder={t('O‘zgartirish sababi (majburiy)')} aria-label={t('O‘zgartirish sababi')} />
      {xato && <span role="alert" className="text-[12px] text-danger">{xato}</span>}
      <div><button type="submit" className="fz-btn fz-btn--primary" disabled={band}>{t('Saqlash')}</button></div>
    </form>
  );
}
