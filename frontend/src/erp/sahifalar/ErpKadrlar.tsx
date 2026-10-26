import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { FmtN } from '../../lib/format';
import {
  useKadrlarData, useIshchiQosh, useTabelBelgila,
  /* ⚡⚡⚡ 2026-08-17 (audit): bu ikki hook YOZILGAN va GAS API si ham BOR edi (`apiIshchiTahrir`, `apiIshchiOchir`) — lekin
     sahifa ularni CHAQIRMASDI: stavka xato kiritilsa oylik ham doim xato chiqardi. Endi tahrir va o'chirish bor. */
  useIshchiTahrir, useIshchiOchir,
} from '../../api/hooks';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { ErpQoshModal, type ErpField } from '../ErpQoshModal';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { t } from '../../i18n/til';
import type { TabelKuni } from '../../api/types';
import { davomatBugun } from '../../lib/kompaniya-ops-korinish';
import { OpsKpi, OpsKpiQator, OpsQidiruv, OpsTaqsimot } from '../../components/kompaniya-ops/OpsUi';

const TABEL_AYLANISH: TabelKuni[] = [null, 'keldi', 'kelmadi', 'kasal'];
/** Tabel katagi: harf + rang (8 — keldi 8 soat, N — kelmadi, B — bemor). */
const KUN: Record<'keldi' | 'kelmadi' | 'kasal', { harf: string; rang: string; fon: string }> = {
  keldi: { harf: '8', rang: 'var(--ok)', fon: 'var(--ok-soft)' },
  kelmadi: { harf: 'N', rang: 'var(--danger)', fon: 'var(--danger-soft)' },
  kasal: { harf: 'B', rang: 'var(--warn)', fon: 'var(--warn-soft)' },
};

export default function ErpKadrlar() {
  const { data, isLoading } = useKadrlarData();
  const [qidiruv, setQidiruv] = useState('');
  const [filtir, setFiltir] = useState('barchasi');
  const [qoshOchiq, setQoshOchiq] = useState(false);
  const [tahrirIshchi, setTahrirIshchi] = useState<any | null>(null);
  const ishchiQosh = useIshchiQosh();
  const ishchiTahrir = useIshchiTahrir();
  const ishchiOchir = useIshchiOchir();
  const tabelBelgila = useTabelBelgila();

  async function ishchiOchirish(ishchi: any) {
    /* Tabel/oylik bilan bog'liq bo'lgani uchun ATAYLAB tasdiqlanadi va nima o'chirilayotgani aniq ko'rsatiladi. */
    const kim = `${ishchi.kasb || ''}${ishchi.brigada ? ' · ' + ishchi.brigada : ''}`;
    if (!(await tasdiqSora({
      sarlavha: t('Ishchini o‘chirish'), xavfli: true, tasdiqMatni: t('O‘chirish'),
      matn: t('«{ism}» ishchi ro‘yxatdan o‘chirilsinmi? {kim}\n\nDiqqat: bu ishchining oldingi tabel yozuvlari saqlanib qolishi mumkin.', { ism: ishchi.ism, kim }),
    }))) return;
    try {
      await ishchiOchir.mutateAsync(ishchi.id);
      toast(t('{ism} o‘chirildi', { ism: ishchi.ism }), 'ok');
    } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger', undefined, 9000); }
  }

  const bugun = new Date().toISOString().split('T')[0];
  const kunBos = (ishchiId: string, kun: number) => {
    const oy = bugun.slice(0, 7);
    const sana = `${oy}-${String(kun).padStart(2, '0')}`;
    const tabel = data?.tabellar.find((x: any) => x.ishchiId === ishchiId);
    const joriy = tabel?.kunlar.find((k: any) => k.sana === kun)?.holat ?? null;
    const keyingi = TABEL_AYLANISH[(TABEL_AYLANISH.indexOf(joriy) + 1) % TABEL_AYLANISH.length];
    tabelBelgila.mutate({ ishchiId, sana, holat: keyingi });
  };

  if (isLoading || !data) return <Sahifa sarlavha="Kadrlar va davomat"><Skelet qatorlar={5} /></Sahifa>;

  /* ⚡ 2026-08-16 (audit H13): filtr BUGUNGI kun davomati bo'yicha ishlaydi. */
  const bugungiKun = new Date().getDate();
  /* ⚡ 2026-08-16 (audit M): oyning haqiqiy kun soni (fevralda 31 katak chizilmaydi). */
  const _bugun = new Date();
  const oyKunlari = new Date(_bugun.getFullYear(), _bugun.getMonth() + 1, 0).getDate();
  const filtrlanganIshchilar = data.ishchilar.filter((ishchi: any) => {
    const mosKeladi = String(ishchi.ism ?? '').toLowerCase().includes(qidiruv.toLowerCase())
      || String(ishchi.kasb ?? '').toLowerCase().includes(qidiruv.toLowerCase());
    if (!mosKeladi) return false;
    if (filtir === 'barchasi') return true;
    const tb = (data.tabellar ?? []).find((x: any) => x.ishchiId === ishchi.id);
    const holat = tb?.kunlar?.find((k: any) => k.sana === bugungiKun)?.holat ?? null;
    return holat === filtir;
  });
  const dav = davomatBugun(data.ishchilar, data.tabellar ?? [], bugungiKun);

  return (
    <Sahifa
      sarlavha="Kadrlar va davomat"
      tavsif="Ishchilar, oylik tabel va hisoblangan maosh. Katakni bosing: bo‘sh → keldi (8) → kelmadi (N) → bemor (B)."
      amallar={<button type="button" onClick={() => setQoshOchiq(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Ishchi qo‘shish')}</button>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Kadrlar ko‘rsatkichlari')}>
          <OpsKpi nom={t('Faol ishchilar')} qiymat={t('{n} kishi', { n: data.jamiFaolIshchilar })} />
          <OpsKpi nom={t('Bugungi davomat')} rang="var(--ok)" qiymat={`${data.bugungiDavomat}%`} />
          <OpsKpi nom={t('Oylik fond (kutilma)')} qiymat={<FmtN val={data.oylikFond} qisqa />} ost={t('so‘m, tabel bo‘yicha')} />
          <OpsKpi nom={t('Berilgan avanslar')} rang="var(--warn)" qiymat={<FmtN val={data.berilganAvanslar} qisqa />} ost={t('so‘m')} />
        </OpsKpiQator>

        <OpsTaqsimot sarlavha={t('Bugun ({kun}-sana) davomat', { kun: bugungiKun })} tanlangan={filtir === 'barchasi' ? null : filtir}
          onTanla={(k) => setFiltir((f) => (f === k || k === 'belgisiz' ? 'barchasi' : k))}
          ong={filtir !== 'barchasi' ? <button type="button" className="fz-chip fz-chip--accent" onClick={() => setFiltir('barchasi')}>{t('barchasi')}</button> : t('bosing — filtr')}
          segmentlar={[
            { kalit: 'keldi', nom: t('Kelganlar'), soni: dav.keldi, rang: 'var(--ok)' },
            { kalit: 'kelmadi', nom: t('Kelmaganlar'), soni: dav.kelmadi, rang: 'var(--danger)' },
            { kalit: 'kasal', nom: t('Bemor / otgul'), soni: dav.kasal, rang: 'var(--warn)' },
            { kalit: 'belgisiz', nom: t('Belgilanmagan'), soni: dav.belgisiz, rang: 'var(--border-strong)' },
          ]} />

        <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('F.I.O yoki kasb bo‘yicha qidiruv…')} />

        <div className="fz-table-wrap max-h-[64vh]">
          <table className="fz-table whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 z-[2]" style={{ minWidth: 220 }}>{t('F.I.O va kasbi')}</th>
                <th className="fz-c-num">{t('Ishlagan')}</th>
                <th className="fz-c-num" style={{ borderRight: '1px solid var(--border)' }}>{t('Hisoblangan')}</th>
                {Array.from({ length: oyKunlari }, (_, i) => (
                  <th key={i} className="text-center" style={{ padding: '0 2px', minWidth: 28, color: i + 1 === bugungiKun ? 'var(--accent-text)' : undefined }}>{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrlanganIshchilar.map((ishchi: any) => {
                const tabel = data.tabellar.find((x: any) => x.ishchiId === ishchi.id) || { kunlar: [], ishlaganKunlar: 0, xisoblanganOylik: 0 };
                return (
                  <tr key={ishchi.id} className="group">
                    <td className="sticky left-0 z-[1]" style={{ background: 'var(--surface)' }}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-text">{ishchi.ism}</div>
                          <div className="truncate text-[11.5px] text-text-mute">
                            {ishchi.kasb}
                            {/* Stavka ko'rinib tursin — «oylik nega bunchalik?» savoliga jadvalning o'zida javob */}
                            {ishchi.stavka ? <> · <FmtN val={ishchi.stavka} />{t('/kun')}</> : null}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button type="button" onClick={() => setTahrirIshchi(ishchi)} aria-label={t('Ishchini tahrirlash')} title={t('Tahrirlash')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><Pencil /></button>
                          <button type="button" onClick={() => void ishchiOchirish(ishchi)} disabled={ishchiOchir.isPending} aria-label={t('Ishchini o‘chirish')} title={t('O‘chirish')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><Trash2 /></button>
                        </div>
                      </div>
                    </td>
                    <td className="fz-c-num">{tabel.ishlaganKunlar} <span className="text-[11px] text-text-mute">{t('kun')}</span></td>
                    <td className="fz-c-num font-semibold" style={{ borderRight: '1px solid var(--border)' }}><FmtN val={tabel.xisoblanganOylik} /></td>
                    {Array.from({ length: oyKunlari }, (_, i) => {
                      const kunHolati = tabel.kunlar.find((k: any) => k.sana === i + 1)?.holat as keyof typeof KUN | null | undefined;
                      const k = kunHolati ? KUN[kunHolati] : null;
                      return (
                        <td key={i} className="text-center" style={{ padding: '2px' }}>
                          <button type="button" onClick={() => kunBos(ishchi.id, i + 1)}
                            title={t('Bosib davomatni belgilang (bo‘sh → keldi → kelmadi → kasal)')} aria-label={t('{kun}-kun davomati', { kun: i + 1 })}
                            className="mx-auto flex h-6 w-6 items-center justify-center rounded-sm border text-[11px] font-semibold"
                            style={{ color: k?.rang ?? 'var(--text-mute)', background: k?.fon ?? 'transparent', borderColor: k ? 'transparent' : 'var(--border)', outline: i + 1 === bugungiKun ? '1px solid var(--accent)' : undefined }}>
                            {k?.harf ?? '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filtrlanganIshchilar.length === 0 && (
                <tr><td colSpan={34} className="py-10 text-center text-text-dim">
                  {data.ishchilar.length === 0 ? t('Hali birorta ishchi kiritilmagan — «Ishchi qo‘shish» tugmasini bosing.') : t('Qidiruvga mos ishchi topilmadi.')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ErpQoshModal
        isOpen={qoshOchiq}
        title={t('Yangi ishchi qo‘shish')}
        isSaving={ishchiQosh.isPending}
        onClose={() => setQoshOchiq(false)}
        fields={ISHCHI_MAYDONLAR}
        onSubmit={async (v) => {
          try {
            await ishchiQosh.mutateAsync(v as any);
            toast(t('Ishchi qo‘shildi'), 'ok');
            setQoshOchiq(false);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
        }}
      />

      {/* Tahrir modali — maydonlar qo'shish bilan AYNI manbadan (`ISHCHI_MAYDONLAR`). */}
      <ErpQoshModal
        isOpen={!!tahrirIshchi}
        title={t('Tahrirlash: {nom}', { nom: tahrirIshchi?.ism ?? '' })}
        isSaving={ishchiTahrir.isPending}
        onClose={() => setTahrirIshchi(null)}
        fields={ISHCHI_MAYDONLAR}
        initial={tahrirIshchi ?? undefined}
        onSubmit={async (v) => {
          if (!tahrirIshchi) return;
          try {
            await ishchiTahrir.mutateAsync({ ...(v as any), id: tahrirIshchi.id });
            toast(t('Saqlandi'), 'ok');
            setTahrirIshchi(null);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger', undefined, 9000); }
        }}
      />
    </Sahifa>
  );
}

/* Qo'shish va tahrirlash uchun YAGONA maydonlar ro'yxati (yorliqlar ErpQoshModal ichida t() orqali). */
const ISHCHI_MAYDONLAR: ErpField[] = [
  { key: 'ism', label: 'F.I.O', type: 'text', required: true, placeholder: 'Azizov Bahrom' },
  { key: 'kasb', label: 'Kasbi', type: 'text', placeholder: 'Prorab' },
  { key: 'stavka', label: 'Kunlik stavka (so‘m)', type: 'money', placeholder: '250000' },
  { key: 'brigada', label: 'Brigada', type: 'text', placeholder: 'Brigada-1' },
  { key: 'obyekt', label: 'Obyekt', type: 'text' },
  { key: 'telefon', label: 'Telefon', type: 'text', placeholder: '+998 90 123 45 67' },
];
