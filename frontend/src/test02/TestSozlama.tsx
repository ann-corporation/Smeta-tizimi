import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sbSozlamaOl, sbSozlamaSaqla } from '../api/t2-sozlama';
import { Save, ShieldAlert, Building2, CreditCard, Link as LinkIcon, ChevronRight, Info } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { t } from '../i18n/til';

/** Tizim sozlamalari (Firuza, 2026-10-25): chapda bo'limlar, o'ngda bitta karta; saqlash — sarlavhadagi asosiy tugma. */
export default function TestSozlama() {
  const { joriy, superadmin } = useKompaniya();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>({});
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [activeTab, setActiveTab] = useState<'umumiy' | 'moliya' | 'integratsiya' | 'xavfsizlik'>('umumiy');

  useEffect(() => {
    if (!joriy?.id) return;
    setYuklanmoqda(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sbSozlamaOl(joriy.id).then((r: any) => {
      setData(r || {});
      setYuklanmoqda(false);
    });
  }, [joriy]);

  const saqlash = async () => {
    if (!joriy?.id) return;
    setSaqlanmoqda(true);
    try {
      await sbSozlamaSaqla(joriy.id, data);
      toast(t('Sozlamalar muvaffaqiyatli saqlandi'), 'ok');
    } catch {
      toast(t('Xatolik yuz berdi'), 'danger');
    }
    setSaqlanmoqda(false);
  };

  /* Egasi 2026-10-27: tizimga oid qismlar (GAS ko'prigi, texnik audit qobig'i) — faqat platforma superadmini. */
  const tabs = [
    { id: 'umumiy', nomi: 'Umumiy akkaunt', izoh: 'Rekvizitlar qayerda', icon: Building2 },
    { id: 'moliya', nomi: 'Moliya va nazorat', izoh: 'Valyuta, qat’iy nazorat', icon: CreditCard },
    { id: 'integratsiya', nomi: 'Integratsiyalar', izoh: superadmin ? 'Didox, Google Sheets' : 'Didox', icon: LinkIcon },
    ...(superadmin ? [{ id: 'xavfsizlik', nomi: 'Xavfsizlik va audit', izoh: 'O‘zgarmas jurnal', icon: ShieldAlert }] as const : []),
  ] as const;
  const yorliq = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-mute';
  const sarlavha = (matn: string) => <h2 className="fz-card__title border-b border-border pb-2">{matn}</h2>;

  return (
    <Sahifa sarlavha="Tizim sozlamalari" tavsif="Akkaunt sozlamalari, moliyaviy nazorat va integratsiyalar"
      amallar={<button type="button" onClick={() => void saqlash()} disabled={saqlanmoqda || yuklanmoqda} className="fz-btn fz-btn--primary">
        <Save size={16} />{saqlanmoqda ? t('Saqlanmoqda…') : t('Saqlash')}</button>}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav role="tablist" aria-orientation="vertical" aria-label={t('Sozlama bo‘limlari')} className="fz-card flex flex-col gap-1 p-2 md:w-64 md:shrink-0">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={activeTab === x.id} onClick={() => setActiveTab(x.id)}
              className={`fz-nav__item ${activeTab === x.id ? 'fz-nav__item--active' : ''}`} style={{ height: 'auto', padding: '8px 22px 8px 10px' }}>
              <x.icon size={16} />
              <span className="flex min-w-0 flex-col leading-tight"><span>{t(x.nomi)}</span><small className="text-[11.5px] font-normal text-text-mute">{t(x.izoh)}</small></span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {yuklanmoqda ? (
            <div className="skel min-h-[220px] max-w-3xl rounded-lg" aria-label={t('Kompaniya ma’lumotlari yuklanmoqda…')} />
          ) : (
            <section role="tabpanel" className="fz-card fz-card__body flex max-w-3xl flex-col gap-4">
              {activeTab === 'umumiy' && (<>
                {sarlavha(t('Tashkilot ma’lumotlari'))}
                <p className="text-[13px] text-text-dim">{t('Kompaniya rekvizitlari (nom, STIR, manzil, tizimdagi roli) endi bitta joyda — Kompaniya sahifasida boshqariladi: ikkita alohida oyna va jim ajralib ketadigan nusxa yo‘q.')}</p>
                <Link to="/admin/kompaniya" className="fz-btn fz-btn--primary self-start"><Building2 size={16} /> {t('Kompaniya sahifasiga o‘tish')} <ChevronRight size={15} /></Link>
                <p className="fz-note fz-note--info"><Info aria-hidden="true" />{t('Bu sahifada faqat ilova sozlamalari qoladi: valyuta, qat’iy nazorat, integratsiyalar, audit.')}</p>
              </>)}

              {activeTab === 'moliya' && (<>
                {sarlavha(t('Moliyaviy va qat’iy nazorat'))}
                <div>
                  <label className={yorliq} htmlFor="sozlama-valyuta">{t('Asosiy valyuta')}</label>
                  <select id="sozlama-valyuta" value={data?.valyuta || 'UZS'} onChange={(e) => setData({ ...data, valyuta: e.target.value })} className="input w-64 p-2 text-[13px]">
                    <option value="UZS">{t('UZS (O‘zbek so‘mi)')}</option>
                    <option value="USD">{t('USD (AQSh dollari)')}</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-4">
                  <input type="checkbox" checked={data?.qatiy_nazorat || false} onChange={(e) => setData({ ...data, qatiy_nazorat: e.target.checked })} className="mt-1 h-4 w-4" />
                  <span>
                    <span className="flex items-center gap-2 font-medium text-text">{t('Qat’iy moliyaviy nazorat (idempotentlik)')}<span className={`fz-stamp ${data?.qatiy_nazorat ? 'fz-stamp--ok' : ''}`}>{data?.qatiy_nazorat ? t('yoqilgan') : t('o‘chirilgan')}</span></span>
                    <span className="mt-1 block max-w-xl text-[12px] leading-relaxed text-text-mute">{t('Yoqilsa, smetadan tashqari ortiqcha xarajatlar va limitdan oshgan F2 lar tizim tomonidan avtomatik bloklanadi. Har bir operatsiya rahbariyat tasdig‘ini (E-imzo) talab qiladi.')}</span>
                  </span>
                </label>
              </>)}

              {activeTab === 'integratsiya' && (<>
                {sarlavha(t('Integratsiyalar (API)'))}
                <div>
                  <label className={yorliq} htmlFor="sozlama-didox">{t('Didox / EHF API kaliti')}</label>
                  <div className="flex gap-2">
                    <input id="sozlama-didox" type="password" value={data?.didox_key || ''} onChange={(e) => setData({ ...data, didox_key: e.target.value })} className="input flex-1 p-2 font-mono text-[13px]" placeholder={'dx_live_*******************'} />
                    <button type="button" disabled className="fz-btn" title={t('Kalitni tekshirish hali ulanmagan')}>{t('Tekshirish')}</button>
                  </div>
                  <p className="mt-2 text-[12px] text-text-mute">{t('Elektron hisob-fakturalarni (EHF) avtomatlashtirish uchun.')}</p>
                </div>
                {superadmin && <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text">
                  <input type="checkbox" checked={data?.avto_sinxronizatsiya || false} onChange={(e) => setData({ ...data, avto_sinxronizatsiya: e.target.checked })} className="h-4 w-4" />
                  {t('Google Sheets (GAS) bilan uzluksiz sinxronizatsiya')}
                </label>}
              </>)}

              {activeTab === 'xavfsizlik' && superadmin && (<>
                <h2 className="fz-card__title flex items-center gap-2 border-b border-border pb-2"><ShieldAlert size={18} className="text-danger" />{t('Xavfsizlik va jurnallar')}</h2>
                <p className="text-[13px] text-text-dim">{t('Tizimdagi barcha kiritish, o‘zgartirish va o‘chirish amallari o‘zgartirib bo‘lmaydigan (immutable) jurnallarda (PostgreSQL triggerlari orqali) saqlanadi.')}</p>
                <Link to="/admin/test/tizim" className="group flex flex-col rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-accent">
                  <span className="flex items-center gap-2 font-medium text-text">{t('Audit jurnali (qora quti)')} <ChevronRight size={16} className="text-text-mute" /></span>
                  <span className="mt-1 text-[12px] text-text-mute">{t('Barcha foydalanuvchilar harakati, IP manzillar va o‘chirilgan fayllar arxivini ko‘rish.')}</span>
                </Link>
              </>)}
            </section>
          )}
        </div>
      </div>
    </Sahifa>
  );
}
