import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { sbKadrlarOl, sbKadrYarat, sbTexnikalarOl, sbTexnikaYarat, sbResursBekor, type KadrMustaqil, type TexnikaMustaqil } from '../api/t2-resurs';
import { Users, Truck, ShieldCheck, Plus, HardHat, RefreshCw, Save, Trash2, Network } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { onEntityChanged } from '../api/entity-consistency';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { OpsBoshQator, OpsKpi, OpsKpiQator, OpsMaydon, OpsOyna, OpsQidiruv, OpsTablar } from '../components/kompaniya-ops/OpsUi';

/**
 * ERP — kompaniyaning markaziy kadrlari va texnika parki (egasi 2026-10-25: Firuza ko'rinishi).
 * Resurs obyektga biriktirilsa — «obyektda / ishlamoqda», aks holda — «zaxirada / garajda».
 */
type Modul = 'kadrlar' | 'texnika' | 'sifat';

export default function TestErp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { joriy } = useKompaniya();
  const [modul, setModul] = useState<Modul>(params.get('modul') === 'sifat' ? 'sifat' : params.get('modul') === 'kadrlar' ? 'kadrlar' : 'texnika');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [fNomi, setFNomi] = useState('');
  const [fToifa, setFToifa] = useState('');
  const [fNarx, setFNarx] = useState('');
  const [qidiruv, setQidiruv] = useState('');

  const [kadrlarList, setKadrlarList] = useState<KadrMustaqil[]>([]);
  const [texnikaList, setTexnikaList] = useState<TexnikaMustaqil[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlamoqda, setSaqlamoqda] = useState(false);

  const yukla = async () => {
    if (!joriy) return;
    setYuklanmoqda(true);
    try {
      if (modul === 'kadrlar') return; // yo'naltiriladi: /admin/hr
      if (modul === 'texnika') setTexnikaList((await sbTexnikalarOl(joriy.id)).qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [joriy, modul]);
  useEffect(() => onEntityChanged((event) => {
    const type = modul === 'kadrlar' ? 'kadr' : modul === 'texnika' ? 'texnika' : null;
    if (joriy && type && event.detail.kompaniyaId === joriy.id && event.detail.type === type) void yukla();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [joriy, modul]);

  const saqlash = async () => {
    if (!joriy) return;
    if (!fNomi) return toast(t('Nomini / F.I.Sh kiriting'), 'warn');
    setSaqlamoqda(true);
    try {
      if (modul === 'kadrlar') {
        await sbKadrYarat({ kompaniyaId: joriy.id, ismSharif: fNomi, lavozim: fToifa || 'Ishchi', oylikMaosh: Number(fNarx) || undefined });
      } else if (modul === 'texnika') {
        await sbTexnikaYarat({ kompaniyaId: joriy.id, nomi: fNomi, davlatRaqami: fToifa || undefined, yoqilgiMejori: Number(fNarx) || undefined });
      }
      toast(t('Muvaffaqiyatli saqlandi!'), 'ok');
      setIsFormOpen(false);
      setFNomi(''); setFToifa(''); setFNarx('');
      void yukla();
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setSaqlamoqda(false);
    }
  };

  const bekorQil = async (tur: 'kadr' | 'texnika', id: number, version: number, nom: string) => {
    if (!joriy) return;
    if (!(await tasdiqSora({ sarlavha: t('Yozuvni olib tashlash'), matn: t('«{nom}» ro‘yxatdan olib tashlansinmi? Tarix saqlanadi.', { nom }), tasdiqMatni: t('Olib tashlash'), bekorMatni: t('Qaytish'), xavfli: true }))) return;
    const r = await sbResursBekor(tur, joriy.id, id, version);
    if (r.ok) {
      toast(t('Olib tashlandi'), 'ok');
      /* Qator darhol ro'yxatdan ketadi (qo'lda «Yangilash» kerak emas). Qayta o'qish YO'Q: kesh eski qatorni qaytarib ko'rsatardi. */
      if (tur === 'kadr') setKadrlarList((l) => l.filter((x) => x.id !== id)); else setTexnikaList((l) => l.filter((x) => x.id !== id));
    } else toast(r.error || t('Olib tashlanmadi'), 'danger');
  };

  const q = qidiruv.toLowerCase();
  const kadrlar = kadrlarList.filter((k) => `${k.ism_sharif} ${k.lavozim}`.toLowerCase().includes(q));
  const texnikalar = texnikaList.filter((x) => `${x.nomi} ${x.davlat_raqami ?? ''}`.toLowerCase().includes(q));
  const kadrObyektda = kadrlarList.filter((k) => k.obyektlar?.length > 0).length;
  const texIshda = texnikaList.filter((x) => x.obyektlar?.length > 0).length;

  /* Xodimlar ro'yxati YAGONA: /admin/hr (HR). ERP faqat texnika va sifat; eski havolalar (?modul=kadrlar) shu yerga yo'naltiriladi. */
  if (modul === 'kadrlar') return <Navigate to="/admin/hr" replace />;

  return (
    <Sahifa
      sarlavha="Korxona resurslari (ERP)"
      tavsif="Markaziy kadrlar va texnika parki — obyektlarga biriktiriladi; biriktirilmagani zaxirada turadi."
      amallar={<>
        <button type="button" onClick={() => void yukla()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        {modul !== 'sifat' && (
          <button type="button" onClick={() => setIsFormOpen(true)} className="fz-btn fz-btn--primary"><Plus /> {modul === 'kadrlar' ? t('Yangi xodim') : t('Yangi texnika')}</button>
        )}
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('ERP ko‘rsatkichlari')}>
          {modul === 'texnika' ? <>
            <OpsKpi nom={t('Texnikalar')} qiymat={texnikaList.length} />
            <OpsKpi nom={t('Ishlamoqda (obyektda)')} rang="var(--ok)" qiymat={texIshda} />
            <OpsKpi nom={t('Garajda')} rang="var(--border-strong)" qiymat={texnikaList.length - texIshda} />
          </> : <>
            <OpsKpi nom={t('Xodimlar')} qiymat={kadrlarList.length} />
            <OpsKpi nom={t('Obyektda')} rang="var(--ok)" qiymat={kadrObyektda} />
            <OpsKpi nom={t('Zaxirada')} rang="var(--border-strong)" qiymat={kadrlarList.length - kadrObyektda} ost={t('hech bir obyektga biriktirilmagan')} />
          </>}
        </OpsKpiQator>

        <OpsTablar<Modul> yorliq={t('ERP bo‘limlari')} joriy={modul} onTanla={(m) => { if (m === 'kadrlar') { navigate('/admin/hr'); return; } setModul(m); setQidiruv(''); }} tablar={[
          { id: 'kadrlar', nom: t('Xodimlar va brigadalar'), ikon: <Users /> },
          { id: 'texnika', nom: t('Texnika parki'), ikon: <Truck /> },
          { id: 'sifat', nom: t('Mehnat muhofazasi va sifat'), ikon: <ShieldCheck /> },
        ]} />

        {modul !== 'sifat' && <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={modul === 'kadrlar' ? t('F.I.Sh yoki lavozim bo‘yicha…') : t('Texnika nomi yoki davlat raqami bo‘yicha…')} />}

        {modul === 'kadrlar' && (
          <div className="fz-table-wrap">
            <table className="fz-table">
              <thead><tr><th>{t('F.I.Sh')}</th><th>{t('Lavozim')}</th><th>{t('Obyektlar')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Amallar')}</th></tr></thead>
              <tbody>
                {kadrlar.length === 0 && !yuklanmoqda && <OpsBoshQator ustun={5} matn={kadrlarList.length ? t('Qidiruvga mos xodim topilmadi.') : t('Hali xodimlar kiritilmagan.')} />}
                {kadrlar.map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium text-text"><span className="inline-flex items-center gap-2"><HardHat size={14} className="text-text-mute" />{k.ism_sharif}</span></td>
                    <td className="text-text-dim">{k.lavozim}</td>
                    <td className="text-[12px] text-text-dim">{k.obyektlar?.length ? t('{n} ta obyekt', { n: k.obyektlar.length }) : '—'}</td>
                    <td><span className={`fz-stamp ${k.obyektlar?.length > 0 ? 'fz-stamp--ok' : ''}`}>{k.obyektlar?.length > 0 ? t('Obyektda') : t('Zaxirada')}</span></td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => navigate('/admin/mindmap?tugun=kadr:' + k.id)} className="fz-btn fz-btn--ghost fz-btn--sm" title={t('Mindmapda ko‘rish')}><Network /> {t('Mindmap')}</button>
                        <button type="button" onClick={() => void bekorQil('kadr', k.id, k.versiya, k.ism_sharif)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Bekor qilish (tarix saqlanadi)')} aria-label={t('Bekor qilish')}><Trash2 /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modul === 'texnika' && (
          <div className="fz-table-wrap">
            <table className="fz-table">
              <thead><tr><th>{t('Texnika')}</th><th>{t('Davlat raqami')}</th><th className="fz-c-num">{t('Yoqilg‘i me’yori')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Amallar')}</th></tr></thead>
              <tbody>
                {texnikalar.length === 0 && !yuklanmoqda && <OpsBoshQator ustun={5} matn={texnikaList.length ? t('Qidiruvga mos texnika topilmadi.') : t('Hali texnikalar kiritilmagan.')} />}
                {texnikalar.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium text-text"><span className="inline-flex items-center gap-2"><Truck size={14} className="text-text-mute" />{x.nomi}</span></td>
                    <td>{x.davlat_raqami ? <span className="fz-c-shifr rounded border border-border px-1.5 py-0.5">{x.davlat_raqami}</span> : '—'}</td>
                    <td className="fz-c-num">{x.yoqilgi_mejori ?? '—'}</td>
                    <td><span className={`fz-stamp ${x.obyektlar?.length > 0 ? 'fz-stamp--ok' : ''}`}>{x.obyektlar?.length > 0 ? t('Ishlamoqda') : t('Garajda')}</span></td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => navigate('/admin/mindmap?tugun=texnika:' + x.id)} className="fz-btn fz-btn--ghost fz-btn--sm" title={t('Mindmapda ko‘rish')}><Network /> {t('Mindmap')}</button>
                        <button type="button" onClick={() => void bekorQil('texnika', x.id, x.versiya, x.nomi)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Bekor qilish (tarix saqlanadi)')} aria-label={t('Bekor qilish')}><Trash2 /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modul === 'sifat' && (
          <section className="fz-note fz-note--info"><ShieldCheck /><span><b>{t('Sifat va mehnat muhofazasi jurnallari')}</b>{' — '}{t('yong‘in xavfsizligi, instruktaj jurnallari va sifat nazorati aktlari shu yerda yuritiladi (jarayonda). Nuqsonlar hozir «ERP · Sifat» sahifasida.')}</span></section>
        )}
      </div>

      <OpsOyna ochiq={isFormOpen} onYop={() => setIsFormOpen(false)} band={saqlamoqda}
        ikon={modul === 'kadrlar' ? <HardHat /> : <Truck />}
        sarlavha={modul === 'kadrlar' ? t('Xodimni ro‘yxatga olish') : t('Texnikani ro‘yxatga olish')}
        amallar={<>
          <button type="button" onClick={() => setIsFormOpen(false)} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
          <button type="button" onClick={() => void saqlash()} disabled={saqlamoqda} className="fz-btn fz-btn--primary">
            {saqlamoqda ? <RefreshCw className="animate-spin" /> : <Save />} {t('Saqlash')}
          </button>
        </>}>
        <OpsMaydon nom={modul === 'kadrlar' ? t('F.I.Sh') : t('Texnika nomi / markasi')} majburiy>
          <input type="text" value={fNomi} onChange={(e) => setFNomi(e.target.value)} placeholder={modul === 'kadrlar' ? t('G‘aniyev Zafar') : t('CAT 320 ekskavator')} />
        </OpsMaydon>
        <div className="grid grid-cols-2 gap-3">
          <OpsMaydon nom={modul === 'kadrlar' ? t('Lavozim / kasb') : t('Davlat raqami')}>
            <input type="text" value={fToifa} onChange={(e) => setFToifa(e.target.value)} />
          </OpsMaydon>
          <OpsMaydon nom={modul === 'kadrlar' ? t('Oylik maosh') : t('Yoqilg‘i / motochas')}>
            <MoneyInput grouping={modul === 'kadrlar'} ungroupedType="text" value={fNarx}
              onValueChange={(moneyValue) => setFNarx(moneyValue.replace(/[^0-9]/g, ''))} className="h-8 w-full px-2 text-right text-[13px] tabular-nums" />
          </OpsMaydon>
        </div>
      </OpsOyna>
    </Sahifa>
  );
}
