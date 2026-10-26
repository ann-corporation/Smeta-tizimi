import { useState } from 'react';
import { AlertTriangle, MapPin, Plus, Truck, Pencil, ClipboardList, Package } from 'lucide-react';
import { FmtN } from '../../lib/format';
import {
  useTaminotData, useZayavkaQosh, useZayavkaHolatYangila,
  /* ⚡⚡⚡ 2026-08-17 (audit): yetkazib beruvchilar ro'yxati saytda yo'q edi — faqat «qarzimiz» KPI si. Endi uchinchi tab. */
  usePostavshikQosh, usePostavshikTahrir,
} from '../../api/hooks';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { ErpQoshModal, type ErpField } from '../ErpQoshModal';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import type { ZayavkaStatus } from '../../api/types';
import { qoldiqDaraja } from '../../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsChiziq, OpsKpi, OpsKpiQator, OpsQidiruv, OpsTablar, OpsTaqsimot } from '../../components/kompaniya-ops/OpsUi';

const ZAYAVKA_HOLATLARI: ZayavkaStatus[] = [
  'Obyektdan so\'rov', 'Omborda tekshirilmoqda', 'Ombordan berildi',
  'Bozorda', 'Yuborildi', 'Qabul qilindi', 'Rad etildi',
];
/** Holat → so'z belgisi va rang (qiymatlar bazadagidek). */
const HOLAT: Record<string, { stamp: string; rang: string }> = {
  'Obyektdan so\'rov': { stamp: 'fz-stamp--warn', rang: 'var(--warn)' },
  'Omborda tekshirilmoqda': { stamp: 'fz-stamp--info', rang: 'var(--kat-mash)' },
  'Ombordan berildi': { stamp: 'fz-stamp--ok', rang: 'var(--kat-mat)' },
  Bozorda: { stamp: 'fz-stamp--info', rang: 'var(--info)' },
  Yuborildi: { stamp: 'fz-stamp--info', rang: 'var(--kat-ob)' },
  'Qabul qilindi': { stamp: 'fz-stamp--ok', rang: 'var(--ok)' },
  'Rad etildi': { stamp: 'fz-stamp--danger', rang: 'var(--danger)' },
};
type Tab = 'zayavkalar' | 'sklad' | 'postavshik';

export default function ErpTaminot() {
  const { data, isLoading } = useTaminotData();
  const [qidiruv, setQidiruv] = useState('');
  const [tab, setTab] = useState<Tab>('zayavkalar');
  const [holatFiltr, setHolatFiltr] = useState<string | null>(null);
  const [qoshOchiq, setQoshOchiq] = useState(false);
  const [postQoshOchiq, setPostQoshOchiq] = useState(false);
  const [tahrirPost, setTahrirPost] = useState<any | null>(null);
  const zayavkaQosh = useZayavkaQosh();
  const holatYangila = useZayavkaHolatYangila();
  const postQosh = usePostavshikQosh();
  const postTahrir = usePostavshikTahrir();

  if (isLoading || !data) return <Sahifa sarlavha="Ta’minot va ombor"><Skelet qatorlar={5} /></Sahifa>;

  const filtrlanganZayavkalar = data.zayavkalar.filter((z: any) =>
    (String(z.material ?? '').toLowerCase().includes(qidiruv.toLowerCase())
      || String(z.prorab ?? '').toLowerCase().includes(qidiruv.toLowerCase()))
    && (!holatFiltr || z.status === holatFiltr));
  const filtrlanganMateriallar = data.materiallar.filter((m: any) => String(m.nom ?? '').toLowerCase().includes(qidiruv.toLowerCase()));
  const filtrlanganPostavshiklar = (data.postavshiklar ?? []).filter((p: any) =>
    String(p.nom ?? '').toLowerCase().includes(qidiruv.toLowerCase()) || String(p.telefon ?? '').toLowerCase().includes(qidiruv.toLowerCase()));

  const holatOzgartir = async (id: string, status: ZayavkaStatus) => {
    try {
      await holatYangila.mutateAsync({ id, status });
      toast(t('Holat o‘zgartirildi: {h}', { h: t(status) }), 'ok');
    } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
  };
  const qadam = (id: string, status: ZayavkaStatus, nom: string, cls = '', title?: string) => (
    <button type="button" onClick={() => void holatOzgartir(id, status)} disabled={holatYangila.isPending} className={`fz-btn fz-btn--sm ${cls}`} title={title}>{nom}</button>
  );

  return (
    <Sahifa
      sarlavha="Ta’minot va ombor"
      tavsif="Obyekt so‘rovi → omborda tekshiruv → ombordan berish yoki bozordan xarid → obyekt qabul qiladi."
      amallar={<button type="button" onClick={() => setQoshOchiq(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Zayavka berish')}</button>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Ta’minot ko‘rsatkichlari')}>
          <OpsKpi nom={t('Yangi zayavkalar')} rang="var(--warn)" qiymat={t('{n} ta', { n: data.yangiZayavkalarSoni })} />
          <OpsKpi nom={t('Kritik qoldiq')} rang="var(--danger)" qiymat={<span className={data.kritikMateriallarSoni ? 'text-danger' : ''}>{t('{n} ta tovar', { n: data.kritikMateriallarSoni })}</span>} ost={t('minimal qoldiqdan kam')} />
          <OpsKpi nom={t('Smetadan qimmat')} rang="var(--kat-mash)" qiymat={t('{n} ta tovar', { n: data.smetaNarxidanOshganlar })} />
          <OpsKpi nom={t('Yetkazib beruvchiga qarzimiz')} qiymat={<FmtN val={data.jamiQarzimiz} qisqa />} ost={t('so‘m')} />
        </OpsKpiQator>

        <OpsTablar<Tab> yorliq={t('Ta’minot bo‘limlari')} joriy={tab} onTanla={setTab}
          oxirida={<OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Qidiruv…')} />}
          tablar={[
            { id: 'zayavkalar', nom: t('Zayavkalar'), ikon: <ClipboardList />, soni: data.zayavkalar.length },
            { id: 'sklad', nom: t('Ombor va qoldiqlar'), ikon: <Package />, soni: data.materiallar.length },
            { id: 'postavshik', nom: t('Yetkazib beruvchilar'), ikon: <Truck />, soni: (data.postavshiklar ?? []).length || null },
          ]} />

        {tab === 'zayavkalar' && (<>
          <OpsTaqsimot sarlavha={t('Zayavkalar yo‘li')} tanlangan={holatFiltr} onTanla={(k) => setHolatFiltr((f) => (f === k ? null : k))}
            ong={holatFiltr ? <button type="button" className="fz-chip fz-chip--accent" onClick={() => setHolatFiltr(null)}>{t('barchasi')}</button> : t('bosing — filtr')}
            segmentlar={ZAYAVKA_HOLATLARI.map((h) => ({ kalit: h, nom: t(h), soni: data.zayavkalar.filter((z: any) => z.status === h).length, rang: HOLAT[h]?.rang ?? 'var(--border-strong)' }))} />
          <div className="fz-table-wrap">
            <table className="fz-table">
              <thead><tr><th>{t('Material va miqdor')}</th><th>{t('Prorab va obyekt')}</th><th>{t('Sana / izoh')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Omborchi / ta’minotchi qadami')}</th></tr></thead>
              <tbody>
                {filtrlanganZayavkalar.map((z: any) => (
                  <tr key={z.id}>
                    <td><span className="block font-medium text-text">{z.material}</span><span className="text-[12px] tabular-nums text-text-dim">{z.miqdor} {z.birlik}</span></td>
                    <td><span className="block">{z.prorab}</span><span className="inline-flex items-center gap-1 text-[11.5px] text-text-mute"><MapPin size={11} />{z.obyekt}</span></td>
                    <td><span className="block text-text-dim">{z.sana}</span>{z.izoh && <span className="text-[11.5px] text-warn">{z.izoh}</span>}</td>
                    <td><span className={`fz-stamp ${HOLAT[z.status]?.stamp ?? ''}`}>{z.status ? t(z.status) : '—'}</span></td>
                    <td className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {z.status === 'Obyektdan so\'rov' && qadam(z.id, 'Omborda tekshirilmoqda', t('Skladda tekshirish'), 'fz-btn--primary')}
                        {z.status === 'Omborda tekshirilmoqda' && <>
                          {qadam(z.id, 'Ombordan berildi', t('Skladdan berish'), 'fz-btn--primary', t('Skladda bor — nakladnoy bilan berish'))}
                          {qadam(z.id, 'Bozorda', t('Bozorga jo‘natish'), '', t('Skladda yo‘q — ta’minotchi qidiradi'))}
                        </>}
                        {z.status === 'Bozorda' && qadam(z.id, 'Yuborildi', t('Xarid qilish va obyektga yuborish'), 'fz-btn--primary')}
                        {z.status === 'Yuborildi' && qadam(z.id, 'Qabul qilindi', t('Obyekt qabul qildi'), 'fz-btn--primary')}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtrlanganZayavkalar.length === 0 && <OpsBoshQator ustun={5} matn={t('Hech narsa topilmadi')} />}
              </tbody>
            </table>
          </div>
        </>)}

        {tab === 'sklad' && (
          <div className="fz-table-wrap">
            <table className="fz-table">
              <thead><tr><th>{t('Material')}</th><th>{t('Joylashuv (sklad)')}</th><th className="fz-c-num">{t('Haqiqiy qoldiq')}</th><th style={{ minWidth: 140 }}>{t('Qoldiq / minimum')}</th><th className="fz-c-num">{t('Smeta → fakt narxi')}</th><th>{t('Holat')}</th></tr></thead>
              <tbody>
                {filtrlanganMateriallar.map((m: any) => {
                  const isKritik = m.qoldiq <= m.minQoldiq;
                  const isOshgan = m.faktNarxi > m.smetaNarxi;
                  const d = qoldiqDaraja(m.qoldiq == null ? null : Number(m.qoldiq), m.minQoldiq == null ? null : Number(m.minQoldiq));
                  return (
                    <tr key={m.id}>
                      <td><span className="block font-medium text-text">{m.nom}</span><span className="text-[11.5px] text-text-mute">{m.guruh}</span></td>
                      <td className="text-text-dim">{m.obyekt}</td>
                      <td className={`fz-c-num font-semibold ${isKritik ? 'text-danger' : ''}`}>{m.qoldiq} <span className="text-[11px] font-normal text-text-mute">{m.birlik}</span></td>
                      <td>
                        <span className="flex items-center gap-2">
                          <OpsChiziq ulush={d.ulush} belgi={d.minJoy} rang={isKritik ? 'var(--danger)' : 'var(--ok)'} title={t('Minimum: {m}', { m: m.minQoldiq ?? '—' })} />
                          <span className="whitespace-nowrap text-[11px] tabular-nums text-text-mute">{t('min {m}', { m: m.minQoldiq ?? '—' })}</span>
                        </span>
                      </td>
                      <td className="fz-c-num">
                        <span className="block text-[11.5px] text-text-mute"><FmtN val={m.smetaNarxi} /></span>
                        <span className={`font-semibold ${isOshgan ? 'text-warn' : ''}`}><FmtN val={m.faktNarxi} /></span>
                      </td>
                      <td>
                        <span className="inline-flex flex-wrap gap-1">
                          {isKritik && <span className="fz-stamp fz-stamp--danger"><AlertTriangle size={10} />{t('kam qoldi')}</span>}
                          {isOshgan ? <span className="fz-stamp fz-stamp--warn">{t('smetadan qimmat')}</span> : <span className="fz-stamp fz-stamp--ok">{t('narx normada')}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtrlanganMateriallar.length === 0 && <OpsBoshQator ustun={6} matn={t('Hech narsa topilmadi')} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'postavshik' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-text-dim">{t('Kimga qancha qarzdormiz — nomma-nom')}</p>
              <button type="button" onClick={() => setPostQoshOchiq(true)} className="fz-btn fz-btn--sm fz-btn--primary"><Plus /> {t('Yetkazib beruvchi qo‘shish')}</button>
            </div>
            <div className="fz-table-wrap">
              <table className="fz-table">
                <thead><tr><th>{t('Nomi')}</th><th>{t('Telefon')}</th><th className="fz-c-num">{t('Yetkazilgan, so‘m')}</th><th className="fz-c-num">{t('Qarzimiz, so‘m')}</th><th /></tr></thead>
                <tbody>
                  {filtrlanganPostavshiklar.map((p: any, idx: number) => (
                    <tr key={p.id ?? idx} className="group">
                      <td className="font-medium text-text">{p.nom || '—'}</td>
                      <td className="fz-c-shifr">{p.telefon || '—'}</td>
                      <td className="fz-c-num"><FmtN val={p.yetkazilganSumma} /></td>
                      <td className={`fz-c-num font-semibold ${(p.qarzimiz || 0) > 0 ? 'text-danger' : 'text-text-mute'}`}><FmtN val={p.qarzimiz} /></td>
                      <td className="text-right">
                        <button type="button" onClick={() => setTahrirPost(p)} aria-label={t('Tahrirlash')} title={t('Tahrirlash')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><Pencil /></button>
                      </td>
                    </tr>
                  ))}
                  {filtrlanganPostavshiklar.length === 0 && (
                    <OpsBoshQator ustun={5} matn={qidiruv ? t('«{q}» bo‘yicha topilmadi', { q: qidiruv }) : t('Hali yetkazib beruvchi kiritilmagan — yuqoridagi tugmani bosing.')} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ErpQoshModal
        isOpen={qoshOchiq}
        title={t('Yangi zayavka (material so‘rovi)')}
        isSaving={zayavkaQosh.isPending}
        initial={{ sana: new Date().toISOString().split('T')[0], status: 'Obyektdan so\'rov' }}
        onClose={() => setQoshOchiq(false)}
        fields={[
          { key: 'material', label: 'Material nomi', type: 'text', required: true, placeholder: 'Sement M400' },
          { key: 'miqdor', label: 'Miqdori', type: 'number', required: true, placeholder: '15' },
          { key: 'birlik', label: 'O‘lchov birligi', type: 'text', placeholder: 'tonna' },
          { key: 'obyekt', label: 'Obyekt', type: 'text' },
          { key: 'prorab', label: 'So‘ragan prorab', type: 'text' },
          { key: 'sana', label: 'Sana', type: 'date' },
          { key: 'status', label: 'Boshlang‘ich holat', type: 'select', options: ZAYAVKA_HOLATLARI },
          { key: 'izoh', label: 'Izoh', type: 'textarea', placeholder: 'Shoshilinch...' },
        ]}
        onSubmit={async (v) => {
          try {
            await zayavkaQosh.mutateAsync(v as any);
            toast(t('Zayavka qo‘shildi'), 'ok');
            setQoshOchiq(false);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
        }}
      />

      {/* Yetkazib beruvchi — qo'shish va tahrirlash. Maydonlar YAGONA
          ro'yxatdan (`POSTAVSHIK_MAYDONLAR`) olinadi. */}
      <ErpQoshModal
        isOpen={postQoshOchiq}
        title={t('Yangi yetkazib beruvchi')}
        isSaving={postQosh.isPending}
        onClose={() => setPostQoshOchiq(false)}
        fields={POSTAVSHIK_MAYDONLAR}
        onSubmit={async (v) => {
          try {
            await postQosh.mutateAsync(v as any);
            toast(t('Yetkazib beruvchi qo‘shildi'), 'ok');
            setPostQoshOchiq(false);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger', undefined, 9000); }
        }}
      />

      <ErpQoshModal
        isOpen={!!tahrirPost}
        title={t('Tahrirlash: {nom}', { nom: tahrirPost?.nom ?? '' })}
        isSaving={postTahrir.isPending}
        onClose={() => setTahrirPost(null)}
        fields={POSTAVSHIK_MAYDONLAR}
        initial={tahrirPost ?? undefined}
        onSubmit={async (v) => {
          if (!tahrirPost) return;
          try {
            await postTahrir.mutateAsync({ ...(v as any), id: tahrirPost.id });
            toast(t('Saqlandi'), 'ok');
            setTahrirPost(null);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger', undefined, 9000); }
        }}
      />
    </Sahifa>
  );
}

const POSTAVSHIK_MAYDONLAR: ErpField[] = [
  { key: 'nom', label: 'Nomi', type: 'text', required: true, placeholder: 'MCHJ «Qurilish Servis»' },
  { key: 'telefon', label: 'Telefon', type: 'text', placeholder: '+998 90 123 45 67' },
  { key: 'yetkazilganSumma', label: 'Yetkazilgan summa (so‘m)', type: 'money' },
  { key: 'qarzimiz', label: 'Qarzimiz (so‘m)', type: 'money' },
];
