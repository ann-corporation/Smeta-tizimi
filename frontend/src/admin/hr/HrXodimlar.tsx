import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { yangiOperationId } from '../../api/supabase';
import { hrKpiQoidaSaqla, hrSxemaSaqla, hrXodimSaqla, type HrAzo, type HrBazaTuri, type HrKpiKod, type HrQoida, type HrRol, type HrSozlama, type HrXodim, type HrXodimlarJavob } from '../../api/t2-hr';
import { BAZA_TURI_NOMI, HR_ROL_BAZA_TURI, KPI_NOMI, ROL_NOMI } from '../../lib/hr/qarorlar';
import { yozNatija, type Qayta } from './umumiy';

const ROLLAR: Array<[HrRol, string]> = (Object.keys(ROL_NOMI) as HrRol[]).map((k) => [k, ROL_NOMI[k]]);
const rolNomi = (r: string | null) => (r ? t(ROLLAR.find(([k]) => k === r)?.[1] ?? r) : '—');
const num = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

type Forma = {
  kadrId: number | null; versiya: number | null; ism: string; lavozim: string; rol: HrRol; grafik: 5 | 6; bazaTuri: HrBazaTuri; bazaSumma: string;
  sxemaId: string; qabul: string; bosh: string; obyektlar: Array<{ obyekt_id: string; ulush: string; dan: string; gacha: string }>;
  pinfl: string; pasport: string; telefon: string; manzil: string; uid: string;
};

const boshForma = (x?: HrXodim): Forma => ({
  kadrId: x?.kadr_id ?? null, versiya: x?.versiya ?? null, ism: x?.ism ?? '', lavozim: x?.lavozim ?? '', rol: x?.rol ?? 'ishchi', grafik: x?.grafik ?? 5,
  uid: x?.foydalanuvchi_id == null ? '' : String(x.foydalanuvchi_id),
  bazaTuri: x?.baza_turi ?? HR_ROL_BAZA_TURI[x?.rol ?? 'ishchi'], bazaSumma: x?.baza_summa == null ? '' : String(x.baza_summa), sxemaId: x?.sxema_id == null ? '' : String(x.sxema_id),
  qabul: x?.qabul_sana ?? '', bosh: x?.bosh_sana ?? '',
  obyektlar: (x?.obyektlar ?? []).map((o) => ({ obyekt_id: String(o.obyekt_id), ulush: String(o.ulush_foiz), dan: o.dan ?? '', gacha: o.gacha ?? '' })),
  pinfl: x?.pii?.pinfl ?? '', pasport: x?.pii?.pasport ?? '', telefon: x?.pii?.telefon ?? '', manzil: x?.pii?.manzil ?? '',
});

export function HrXodimlar({ kid, d, qayta, azolar = null, boshidaYangi = false }: { kid: number; d: HrXodimlarJavob; qayta: Qayta; azolar?: HrAzo[] | null; boshidaYangi?: boolean }) {
  const [forma, setForma] = useState<Forma | null>(() => (boshidaYangi ? boshForma() : null));
  const [kengaytirilgan, setKengaytirilgan] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const yangiMi = forma?.kadrId == null;
  const ochish = (x?: HrXodim) => { setKengaytirilgan(false); setForma(boshForma(x)); };
  const [qidiruv, setQidiruv] = useState('');
  const royxat = useMemo(() => d.xodimlar.filter((x) => `${x.ism} ${x.lavozim ?? ''}`.toLowerCase().includes(qidiruv.toLowerCase())), [d.xodimlar, qidiruv]);
  const sxemaNomi = (id: number | null) => d.sxemalar.find((s) => s.id === id)?.nom ?? '—';
  const set = <K extends keyof Forma>(k: K, v: Forma[K]) => setForma((f) => (f ? { ...f, [k]: v } : f));

  const saqla = async () => {
    if (!forma) return;
    setSaqlanmoqda(true);
    const obyektlar = forma.obyektlar.filter((o) => o.obyekt_id).map((o) => ({ obyekt_id: Number(o.obyekt_id), ulush_foiz: num(o.ulush) ?? 100, dan: o.dan || null, gacha: o.gacha || null }));
    const profil = {
      ism: forma.ism, lavozim: forma.lavozim || undefined, rol: forma.rol, grafik: forma.grafik, baza_turi: forma.bazaTuri,
      ...(d.maosh_yopiq ? {} : { baza_summa: num(forma.bazaSumma) }),
      sxema_id: forma.sxemaId ? Number(forma.sxemaId) : null, qabul_sana: forma.qabul || null, bosh_sana: forma.bosh || null,
      ...(azolar ? { foydalanuvchi_id: forma.uid ? Number(forma.uid) : null } : {}),
    };
    const pii = d.pii_yopiq ? null : { pinfl: forma.pinfl || null, pasport: forma.pasport || null, telefon: forma.telefon || null, manzil: forma.manzil || null };
    const r = await hrXodimSaqla({ kompaniyaId: kid, kadrId: forma.kadrId, kutilganVersiya: forma.versiya, profil, pii, obyektlar, operationId: yangiOperationId() });
    setSaqlanmoqda(false);
    if (yozNatija(r, 'Xodim saqlandi')) { setForma(null); await qayta(); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input h-8 w-64 px-2 text-[13px]" value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('F.I.O yoki lavozim bo‘yicha qidiruv…')} aria-label={t('Qidiruv')} />
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => ochish()}><Plus size={14} /> {t('Xodim qo‘shish')}</button>
        {d.maosh_yopiq && <span className="fz-chip">{t('Maosh bazasi sizga yopiq')}</span>}
      </div>

      <div className="fz-table-wrap max-h-[60vh]">
        <table className="fz-table whitespace-nowrap">
          <thead><tr>
            <th>{t('F.I.O')}</th><th>{t('Rol')}</th><th>{t('Grafik')}</th><th className="fz-c-num">{t('Maosh bazasi')}</th><th>{t('KPI sxemasi')}</th><th>{t('Obyektlar')}</th><th aria-label={t('Amal')} />
          </tr></thead>
          <tbody>
            {royxat.map((x) => (
              <tr key={x.kadr_id}>
                <td><div className="font-medium text-text">{x.ism}</div><div className="text-[11.5px] text-text-mute">{x.lavozim ?? ''}</div></td>
                <td>{x.hr_bor ? rolNomi(x.rol) : <span className="text-warn">{t('HR kartasi yo‘q')}</span>}</td>
                <td>{x.grafik ? t('{n} kunlik', { n: x.grafik }) : '—'}</td>
                <td className="fz-c-num">{x.baza_turi === 'donabay' ? t('Donabay (naryad)') : x.baza_summa == null ? '—' : <><FmtN val={x.baza_summa} /> <span className="text-[11px] text-text-mute">{x.baza_turi === 'kunlik' ? t('/kun') : t('/oy')}</span></>}</td>
                <td>{sxemaNomi(x.sxema_id)}</td>
                <td className="max-w-[260px] truncate" title={x.obyektlar.map((o) => `${o.obyekt} (${o.ulush_foiz}%)`).join(', ')}>
                  {x.obyektlar.length === 0 ? '—' : x.obyektlar.map((o) => `${o.obyekt}${o.ulush_foiz < 100 ? ` ${o.ulush_foiz}%` : ''}`).join(', ')}
                </td>
                <td><button type="button" className="fz-btn fz-btn--ghost fz-btn--icon" onClick={() => ochish(x)} aria-label={t('Tahrirlash')} title={t('Tahrirlash')}><Pencil size={14} /></button></td>
              </tr>
            ))}
            {royxat.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-text-dim">{t('Xodim topilmadi.')}</td></tr>}
          </tbody>
        </table>
      </div>

      {forma && (
        <div className="rounded-md border border-border bg-surface p-3" role="group" aria-label={t('Xodim kartasi')}>
          <h3 className="mb-2 text-[14px] font-semibold text-text">{forma.kadrId == null ? t('Yangi xodim') : t('Xodim kartasi')}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('F.I.O')}<input className="input h-8 px-2 text-[13px]" value={forma.ism} onChange={(e) => set('ism', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Lavozim')}<input className="input h-8 px-2 text-[13px]" value={forma.lavozim} onChange={(e) => set('lavozim', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Rol')}
              <select className="input h-8 px-2 text-[13px]" value={forma.rol} onChange={(e) => { const rol = e.target.value as HrRol; setForma((f) => (f ? { ...f, rol, ...(f.kadrId == null ? { bazaTuri: HR_ROL_BAZA_TURI[rol] } : {}) } : f)); }}>{ROLLAR.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}</select></label>
            {!d.maosh_yopiq && <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Maosh turi')}
              <select className="input h-8 px-2 text-[13px]" value={forma.bazaTuri} onChange={(e) => set('bazaTuri', e.target.value as HrBazaTuri)}>
                {(Object.keys(BAZA_TURI_NOMI) as HrBazaTuri[]).map((k) => <option key={k} value={k}>{t(BAZA_TURI_NOMI[k])}</option>)}</select></label>}
            {!d.maosh_yopiq && forma.bazaTuri !== 'donabay' && <label className="flex flex-col gap-1 text-[12px] text-text-mute">{forma.bazaTuri === 'kunlik' ? t('Kunlik stavka (so‘m)') : t('Oklad (so‘m/oy)')}
              <MoneyInput inputMode="decimal" value={forma.bazaSumma} onValueChange={(v) => set('bazaSumma', v)} className="input h-8 px-2 text-[13px]" /></label>}
            {azolar && <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Tizim foydalanuvchisi (o‘z oyligini ko‘rishi uchun)')}
              <select className="input h-8 px-2 text-[13px]" value={forma.uid} onChange={(e) => set('uid', e.target.value)}>
                <option value="">{t('— ulanmagan —')}</option>
                {azolar.filter((z) => z.kadr_id == null || z.kadr_id === forma.kadrId).map((z) => <option key={z.foydalanuvchi_id} value={z.foydalanuvchi_id}>{z.ism} ({z.rol})</option>)}</select></label>}
          </div>
          {forma.bazaTuri === 'donabay' && <p className="mt-2 text-[12px] text-text-mute">{t('Donabay: pul naryad orqali to‘lanadi, tabel bilan takror to‘lanmaydi.')}</p>}
          {yangiMi && <button type="button" className="fz-btn fz-btn--ghost mt-2" onClick={() => setKengaytirilgan((v) => !v)}>{kengaytirilgan ? t('Qo‘shimcha maydonlarni yashirish') : t('Qo‘shimcha maydonlar (grafik, KPI sxemasi, obyekt, PII)')}</button>}
          <div className={yangiMi && !kengaytirilgan ? 'hidden' : ''}>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Ish grafigi')}
              <select className="input h-8 px-2 text-[13px]" value={forma.grafik} onChange={(e) => set('grafik', Number(e.target.value) === 6 ? 6 : 5)}><option value={5}>{t('5 kunlik')}</option><option value={6}>{t('6 kunlik')}</option></select></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('KPI sxemasi')}
              <select className="input h-8 px-2 text-[13px]" value={forma.sxemaId} onChange={(e) => set('sxemaId', e.target.value)}>
                <option value="">{t('— yo‘q —')}</option>{d.sxemalar.filter((s) => s.faol || String(s.id) === forma.sxemaId).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Qabul sanasi')}<input type="date" className="input h-8 px-2 text-[13px]" value={forma.qabul} onChange={(e) => set('qabul', e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Bo‘shagan sanasi')}<input type="date" className="input h-8 px-2 text-[13px]" value={forma.bosh} onChange={(e) => set('bosh', e.target.value)} /></label>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-text-mute">{t('Biriktirilgan obyektlar (F2 KPI shu obyektlar bo‘yicha)')}
              <button type="button" className="fz-btn fz-btn--ghost" onClick={() => set('obyektlar', [...forma.obyektlar, { obyekt_id: '', ulush: '100', dan: '', gacha: '' }])}><Plus size={12} /> {t('Obyekt qo‘shish')}</button></div>
            {forma.obyektlar.map((o, i) => (
              <div key={i} className="mb-1 flex flex-wrap items-center gap-2">
                <select className="input h-8 px-2 text-[13px]" value={o.obyekt_id} aria-label={t('Obyekt')}
                  onChange={(e) => set('obyektlar', forma.obyektlar.map((y, j) => (j === i ? { ...y, obyekt_id: e.target.value } : y)))}>
                  <option value="">{t('— obyekt —')}</option>{d.obyektlar.map((ob) => <option key={ob.id} value={ob.id}>{ob.nom}</option>)}</select>
                <label className="flex items-center gap-1 text-[12px] text-text-mute">{t('Ulush, %')}
                  <input className="input h-8 w-20 px-2 text-[13px]" inputMode="decimal" value={o.ulush} onChange={(e) => set('obyektlar', forma.obyektlar.map((y, j) => (j === i ? { ...y, ulush: e.target.value } : y)))} /></label>
                <input type="date" className="input h-8 px-2 text-[13px]" value={o.dan} aria-label={t('Boshlanish')} onChange={(e) => set('obyektlar', forma.obyektlar.map((y, j) => (j === i ? { ...y, dan: e.target.value } : y)))} />
                <input type="date" className="input h-8 px-2 text-[13px]" value={o.gacha} aria-label={t('Tugash')} onChange={(e) => set('obyektlar', forma.obyektlar.map((y, j) => (j === i ? { ...y, gacha: e.target.value } : y)))} />
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon" aria-label={t('Olib tashlash')} onClick={() => set('obyektlar', forma.obyektlar.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          {d.pii_yopiq ? <p className="mt-3 text-[12px] text-text-mute">{t('Shaxsiy ma’lumotlar (PINFL, pasport, telefon) sizga yopiq.')}</p> : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('PINFL')}<input className="input h-8 px-2 text-[13px]" inputMode="numeric" maxLength={14} value={forma.pinfl} onChange={(e) => set('pinfl', e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Pasport')}<input className="input h-8 px-2 text-[13px]" value={forma.pasport} onChange={(e) => set('pasport', e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Telefon (+998…)')}<input className="input h-8 px-2 text-[13px]" value={forma.telefon} onChange={(e) => set('telefon', e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Manzil')}<input className="input h-8 px-2 text-[13px]" value={forma.manzil} onChange={(e) => set('manzil', e.target.value)} /></label>
            </div>
          )}

          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="fz-btn fz-btn--primary" disabled={saqlanmoqda || !forma.ism.trim()} onClick={() => void saqla()}>{t('Saqlash')}</button>
            <button type="button" className="fz-btn" onClick={() => setForma(null)}>{t('Bekor qilish')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HrSozlamaTab({ kid, d, qayta, qoida = null, qoidaQayta }: { kid: number; d: HrXodimlarJavob; qayta: Qayta; qoida?: HrQoida | null; qoidaQayta?: Qayta }) {
  const z: NonNullable<HrSozlama> | null = d.sozlama;
  const [ndfl, setNdfl] = useState(z?.ndfl_foiz == null ? '' : String(z.ndfl_foiz));
  const [inps, setInps] = useState(z?.inps_foiz == null ? '' : String(z.inps_foiz));
  const [soat, setSoat] = useState(String(z?.kun_soat ?? 8));
  const [yangi, setYangi] = useState({ nom: '', foiz: '', baza: 'ustamasiz' as 'ustamasiz' | 'ustamali', rejim: 'obyekt' as 'obyekt' | 'muallif' });

  const stavkaSaqla = async () => {
    const r = await hrSxemaSaqla({ kompaniyaId: kid, sozlama: { ndfl_foiz: num(ndfl), inps_foiz: num(inps), kun_soat: num(soat) ?? 8 }, operationId: yangiOperationId() });
    if (yozNatija(r, 'Stavkalar saqlandi')) await qayta();
  };
  const sxemaQosh = async () => {
    const r = await hrSxemaSaqla({ kompaniyaId: kid, sxema: { nom: yangi.nom, f2_foiz: num(yangi.foiz), f2_baza: yangi.baza, f2_rejim: yangi.rejim }, operationId: yangiOperationId() });
    if (yozNatija(r, 'Sxema saqlandi')) { setYangi({ nom: '', foiz: '', baza: 'ustamasiz', rejim: 'obyekt' }); await qayta(); }
  };
  const faolAlmashtir = async (id: number, faol: boolean) => {
    const r = await hrSxemaSaqla({ kompaniyaId: kid, sxema: { id, faol }, operationId: yangiOperationId() });
    if (yozNatija(r, 'Sxema saqlandi')) await qayta();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface p-3">
        <h3 className="mb-1 text-[14px] font-semibold text-text">{t('Ushlanma stavkalari')}</h3>
        <p className="mb-2 text-[12px] text-text-mute">{t('Stavkalar kodda qattiq yozilmagan: kiritmaguncha ushlanma va «sof» ish haqi noma’lum (NULL) bo‘lib qoladi.')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('NDFL, %')}<input className="input h-8 w-24 px-2 text-[13px]" inputMode="decimal" value={ndfl} onChange={(e) => setNdfl(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('INPS, %')}<input className="input h-8 w-24 px-2 text-[13px]" inputMode="decimal" value={inps} onChange={(e) => setInps(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Ish kuni, soat')}<input className="input h-8 w-24 px-2 text-[13px]" inputMode="decimal" value={soat} onChange={(e) => setSoat(e.target.value)} /></label>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => void stavkaSaqla()}>{t('Saqlash')}</button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-3">
        <h3 className="mb-1 text-[14px] font-semibold text-text">{t('KPI sxemalari (F2 bonus)')}</h3>
        <p className="mb-2 text-[12px] text-text-mute">{t('Bonus = tasdiqlangan F2 summasining X% i (oy ichida tasdiqlangan aktlar). Bog‘lash: biriktirilgan obyektlar bo‘yicha yoki akt muallifi bo‘yicha.')}</p>
        <div className="fz-table-wrap">
          <table className="fz-table whitespace-nowrap">
            <thead><tr><th>{t('Nomi')}</th><th className="fz-c-num">{t('F2 bonus, %')}</th><th>{t('Summa bazasi')}</th><th>{t('Bog‘lash')}</th><th>{t('Holat')}</th></tr></thead>
            <tbody>
              {d.sxemalar.map((s) => (
                <tr key={s.id}>
                  <td>{s.nom}</td><td className="fz-c-num">{s.f2_foiz == null ? '—' : s.f2_foiz}</td>
                  <td>{s.f2_baza === 'ustamali' ? t('Ustamali (ИТОГО-4)') : t('Ustamasiz')}</td>
                  <td>{s.f2_rejim === 'muallif' ? t('Akt muallifi') : t('Biriktirilgan obyekt')}</td>
                  <td><button type="button" className="fz-chip" onClick={() => void faolAlmashtir(s.id, !s.faol)}>{s.faol ? t('Faol') : t('Nofaol')}</button></td>
                </tr>
              ))}
              {d.sxemalar.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-text-dim">{t('Sxema hali yo‘q.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Nomi')}<input className="input h-8 w-48 px-2 text-[13px]" value={yangi.nom} onChange={(e) => setYangi({ ...yangi, nom: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('F2 bonus, %')}<input className="input h-8 w-24 px-2 text-[13px]" inputMode="decimal" value={yangi.foiz} onChange={(e) => setYangi({ ...yangi, foiz: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Summa bazasi')}
            <select className="input h-8 px-2 text-[13px]" value={yangi.baza} onChange={(e) => setYangi({ ...yangi, baza: e.target.value === 'ustamali' ? 'ustamali' : 'ustamasiz' })}><option value="ustamasiz">{t('Ustamasiz')}</option><option value="ustamali">{t('Ustamali (ИТОГО-4)')}</option></select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Bog‘lash')}
            <select className="input h-8 px-2 text-[13px]" value={yangi.rejim} onChange={(e) => setYangi({ ...yangi, rejim: e.target.value === 'muallif' ? 'muallif' : 'obyekt' })}><option value="obyekt">{t('Biriktirilgan obyekt')}</option><option value="muallif">{t('Akt muallifi')}</option></select></label>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!yangi.nom.trim()} onClick={() => void sxemaQosh()}><Plus size={14} /> {t('Sxema qo‘shish')}</button>
        </div>
      </section>
      {qoida && <HrKpiQoidaBlok kid={kid} qoida={qoida} qayta={async () => { await qoidaQayta?.(); }} />}    </div>
  );
}

const KPI_KODLAR: HrKpiKod[] = ['f2_hajm', 'f2_vaqtida', 'aosr_vaqtida', 'naryad_qabul', 'davomat'];

/** KPI pulga ta'siri (D3) + rol -> ko'rsatkich -> og'irlik qoidalari (D2). */
function HrKpiQoidaBlok({ kid, qoida, qayta }: { kid: number; qoida: HrQoida; qayta: Qayta }) {
  const [tahrir, setTahrir] = useState<Record<string, { ogirlik: string; maqsad: string }>>({});
  const kalit = (rol: string, kod: string) => `${rol}|${kod}`;
  const roller = Array.from(new Set(qoida.qoidalar.map((q) => q.rol)));
  const pulgaAlmashtir = async () => {
    const r = await hrKpiQoidaSaqla({ kompaniyaId: kid, kpiPulga: !qoida.kpi_pulga_tasir, operationId: yangiOperationId() });
    if (yozNatija(r, 'KPI sozlamasi saqlandi')) await qayta();
  };
  const rolSaqla = async (rol: HrRol, sukut: boolean) => {
    const qs = qoida.qoidalar.filter((q) => q.rol === rol);
    const yuk = sukut ? [{ rol, qayta_sukut: true }] : qs.map((q) => {
      const e = tahrir[kalit(rol, q.korsatkich)];
      return { rol, korsatkich: q.korsatkich, ogirlik: num(e?.ogirlik ?? String(q.ogirlik)) ?? q.ogirlik, maqsad: e ? num(e.maqsad) : q.maqsad, chegara_kun: q.chegara_kun };
    });
    const r = await hrKpiQoidaSaqla({ kompaniyaId: kid, qoidalar: yuk, operationId: yangiOperationId() });
    if (yozNatija(r, 'KPI qoidasi saqlandi')) { setTahrir({}); await qayta(); }
  };
  return (
    <section className="rounded-md border border-border bg-surface p-3" data-testid="hr-kpi-qoida">
      <h3 className="mb-1 text-[14px] font-semibold text-text">{t('KPI: pulga ta’siri va qoidalar')}</h3>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[13px]">{qoida.kpi_pulga_tasir ? t('KPI ish haqiga ta’sir qiladi.') : t('KPI faqat ko‘rsatiladi, ish haqiga ta’sir qilmaydi.')}</span>
        <button type="button" className="fz-btn" onClick={() => void pulgaAlmashtir()}>{qoida.kpi_pulga_tasir ? t('KPI ni faqat ko‘rsatishga qaytarish') : t('KPI pulga ta’sir qilsin')}</button>
      </div>
      <p className="mb-2 text-[12px] text-text-mute">{t('Har rol uchun ko‘rsatkichlar tizim ma’lumotlaridan o‘zi hisoblanadi. Maqsad bo‘sh bo‘lsa, faqat qiymat ko‘rsatiladi (ball hisoblanmaydi).')}</p>
      {roller.map((rol) => {
        const qs = qoida.qoidalar.filter((q) => q.rol === rol);
        return (
          <div key={rol} className="mb-3">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium text-text">{t(ROL_NOMI[rol] ?? rol)}
              <span className="fz-chip">{qs[0]?.manba === 'kompaniya' ? t('Kompaniya qoidasi') : t('Standart')}</span></div>
            <div className="fz-table-wrap">
              <table className="fz-table whitespace-nowrap">
                <thead><tr><th>{t('Ko‘rsatkich')}</th><th className="fz-c-num">{t('Og‘irlik, %')}</th><th className="fz-c-num">{t('Maqsad')}</th></tr></thead>
                <tbody>{qs.filter((q) => KPI_KODLAR.includes(q.korsatkich)).map((q) => {
                  const e = tahrir[kalit(rol, q.korsatkich)] ?? { ogirlik: String(q.ogirlik), maqsad: q.maqsad == null ? '' : String(q.maqsad) };
                  const yoz = (p: Partial<typeof e>) => setTahrir((s) => ({ ...s, [kalit(rol, q.korsatkich)]: { ...e, ...p } }));
                  return (
                    <tr key={q.korsatkich}>
                      <td>{t(KPI_NOMI[q.korsatkich])}</td>
                      <td className="fz-c-num"><input className="input h-8 w-20 px-2 text-[13px]" inputMode="decimal" value={e.ogirlik} aria-label={t('Og‘irlik, %')} onChange={(ev) => yoz({ ogirlik: ev.target.value })} /></td>
                      <td className="fz-c-num"><input className="input h-8 w-20 px-2 text-[13px]" inputMode="decimal" value={e.maqsad} aria-label={t('Maqsad')} onChange={(ev) => yoz({ maqsad: ev.target.value })} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="mt-1 flex gap-2">
              <button type="button" className="fz-btn fz-btn--primary" onClick={() => void rolSaqla(rol, false)}>{t('Saqlash')}</button>
              {qs[0]?.manba === 'kompaniya' && <button type="button" className="fz-btn" onClick={() => void rolSaqla(rol, true)}>{t('Standartga qaytarish')}</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}