import { useMemo, useState } from 'react';
import { CalendarClock, Plus, Pencil, Truck, UserRound } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsBoshQator } from '../components/kompaniya-ops/OpsUi';
import { toast } from '../umumiy/ui/Toast';
import type { Haydovchi, Hujjat, Mashina } from '../api/t2-transport';
import { useTPark, useTYoz } from './hooks';
import { FormOyna, type Maydon } from './FormOyna';
import { son } from './format';
import { xatoMatn } from './xato';

const TUR = ['yuk', 'samosval', 'beton_mikser', 'kran', 'ekskavator', 'yuklagich', 'buldozer', 'avtobus', 'yengil', 'boshqa'] as const;
const turNom = (x: string) => ({ yuk: t('Yuk mashinasi'), samosval: t('Samosval'), beton_mikser: t('Beton mikser'), kran: t('Kran'), ekskavator: t('Ekskavator'), yuklagich: t('Yuklagich'),
  buldozer: t('Buldozer'), avtobus: t('Avtobus'), yengil: t('Yengil mashina'), boshqa: t('Boshqa') } as Record<string, string>)[x] ?? x;
const YOQ = ['dizel', 'benzin', 'metan', 'propan', 'elektr'] as const;
const yoqNom = (x: string) => ({ dizel: t('Dizel'), benzin: t('Benzin'), metan: t('Metan'), propan: t('Propan'), elektr: t('Elektr') } as Record<string, string>)[x] ?? x;
const HUJ = ['sugurta', 'texkoruv', 'guvohnoma', 'ruxsatnoma', 'boshqa'] as const;
const hujNom = (x: string) => ({ sugurta: t('Sug‘urta'), texkoruv: t('Texnik ko‘rik'), guvohnoma: t('Haydovchilik guvohnomasi'), ruxsatnoma: t('Ruxsatnoma'), boshqa: t('Boshqa') } as Record<string, string>)[x] ?? x;

type D = Record<string, unknown>;
const SIGNAL: Record<string, string> = { otgan: 'fz-stamp--danger', yaqin: 'fz-stamp--warn', ok: 'fz-stamp--ok' };

export default function ParkTab({ kompaniyaId, yozish }: { kompaniyaId: number; yozish: boolean }) {
  const park = useTPark(kompaniyaId);
  const yoz = useTYoz(kompaniyaId);
  const [forma, setForma] = useState<null | { tur: 'mashina' | 'haydovchi' | 'hujjat'; qiymat: Record<string, unknown> }>(null);
  const mashinalar = park.data?.mashinalar ?? [], haydovchilar = park.data?.haydovchilar ?? [], hujjatlar = park.data?.hujjatlar ?? [];
  const hayNom = useMemo(() => new Map(haydovchilar.map((h) => [h.id, h.ism])), [haydovchilar]);
  const egaNom = (h: Hujjat) => (h.egasi_turi === 'mashina' ? mashinalar.find((m) => m.id === h.egasi_id)?.nomi : hayNom.get(h.egasi_id)) ?? '—';

  const maydonlar: Record<'mashina' | 'haydovchi' | 'hujjat', Maydon[]> = {
    mashina: [
      { k: 'nomi', nom: t('Nomi'), tur: 'matn', majburiy: true }, { k: 'davlat_raqami', nom: t('Davlat raqami'), tur: 'matn' },
      { k: 'turi', nom: t('Turi'), tur: 'tanlov', majburiy: true, variantlar: TUR.map((x) => ({ v: x, nom: turNom(x) })) },
      { k: 'egalik', nom: t('Egalik'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'oz', nom: t('O‘zimizniki') }, { v: 'ijara', nom: t('Ijara') }] },
      { k: 'yuk_t', nom: t('Yuk sig‘imi, t'), tur: 'son' }, { k: 'yuk_m3', nom: t('Hajm, m³'), tur: 'son' },
      { k: 'yoqilgi_turi', nom: t('Yoqilg‘i'), tur: 'tanlov', majburiy: true, variantlar: YOQ.map((x) => ({ v: x, nom: yoqNom(x) })) },
      { k: 'norma_100km', nom: t('Me‘yor, L/100 km'), tur: 'son' }, { k: 'norma_motosoat', nom: t('Me‘yor, L/moto-soat'), tur: 'son' },
      { k: 'odometr_km', nom: t('Odometr, km'), tur: 'son' }, { k: 'motosoat', nom: t('Moto-soat'), tur: 'son' },
      { k: 'amort_km', nom: t('Amortizatsiya, so‘m/km (QQS siz)'), tur: 'pul' }, { k: 'amort_soat', nom: t('Amortizatsiya, so‘m/soat'), tur: 'pul' },
      { k: 'ijara_km', nom: t('Ijara, so‘m/km'), tur: 'pul' }, { k: 'ijara_soat', nom: t('Ijara, so‘m/soat'), tur: 'pul' }, { k: 'ijara_kun', nom: t('Ijara, so‘m/kun'), tur: 'pul' },
      { k: 'kutish_soat_narx', nom: t('Bekor turish, so‘m/soat'), tur: 'pul' },
      { k: 'haydovchi_id', nom: t('Asosiy haydovchi'), tur: 'tanlov', variantlar: haydovchilar.map((h) => ({ v: String(h.id), nom: h.ism })) },
      { k: 'holat', nom: t('Holati'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'faol', nom: t('Faol') }, { v: 'remontda', nom: t('Ta‘mirda') }, { v: 'nofaol', nom: t('Nofaol') }] },
    ],
    haydovchi: [
      { k: 'ism', nom: t('F.I.Sh.'), tur: 'matn', majburiy: true, keng: true }, { k: 'telefon', nom: t('Telefon'), tur: 'matn' },
      { k: 'tolov_turi', nom: t('Ish haqi turi'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'reys', nom: t('Reys uchun') }, { v: 'km', nom: t('Km uchun') }, { v: 'soat', nom: t('Soat uchun') }, { v: 'oylik', nom: t('Oylik (26 kunga bo‘linadi)') }] },
      { k: 'tolov_stavka', nom: t('Stavka, so‘m'), tur: 'pul' }, { k: 'ijtimoiy_foiz', nom: t('Ijtimoiy soliq, %'), tur: 'son' },
      { k: 'foydalanuvchi_id', nom: t('Tizim foydalanuvchi ID (o‘z reyslarini ko‘rishi uchun)'), tur: 'son', keng: true },
      { k: 'holat', nom: t('Holati'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'faol', nom: t('Faol') }, { v: 'nofaol', nom: t('Nofaol') }] },
    ],
    hujjat: [
      { k: 'egasi_turi', nom: t('Kimniki'), tur: 'tanlov', majburiy: true, variantlar: [{ v: 'mashina', nom: t('Mashina') }, { v: 'haydovchi', nom: t('Haydovchi') }] },
      { k: 'egasi_id', nom: t('Egasi'), tur: 'tanlov', majburiy: true, variantlar: [...mashinalar.map((m) => ({ v: String(m.id), nom: `${t('Mashina')}: ${m.nomi}` })), ...haydovchilar.map((h) => ({ v: String(h.id), nom: `${t('Haydovchi')}: ${h.ism}` }))] },
      { k: 'turi', nom: t('Hujjat turi'), tur: 'tanlov', majburiy: true, variantlar: HUJ.map((x) => ({ v: x, nom: hujNom(x) })) },
      { k: 'raqam', nom: t('Raqami'), tur: 'matn' }, { k: 'boshlanish', nom: t('Boshlanish sanasi'), tur: 'sana' }, { k: 'muddat', nom: t('Amal qilish muddati'), tur: 'sana', majburiy: true },
      { k: 'izoh', nom: t('Izoh'), tur: 'matn', keng: true },
    ],
  };

  const saqla = (tur: 'mashina' | 'haydovchi' | 'hujjat') => async (data: D) => {
    const d: D = { ...data };
    if (tur === 'hujjat' && d.egasi_id != null) d.egasi_id = Number(d.egasi_id);
    if (tur === 'mashina' && d.haydovchi_id != null) d.haydovchi_id = Number(d.haydovchi_id);
    try { await yoz.mutateAsync({ amal: `${tur}_saqla` as 'mashina_saqla', data: d }); toast(t('Saqlandi')); }
    catch (e) { throw new Error(xatoMatn(e)); }
  };
  const ochiq = (tur: 'mashina' | 'haydovchi' | 'hujjat', qiymat: D = {}) => setForma({ tur, qiymat });
  const tahr = yozish ? (tur: 'mashina' | 'haydovchi' | 'hujjat', q: Mashina | Haydovchi | Hujjat) => (
    <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Tahrirlash')} onClick={() => ochiq(tur, q as unknown as D)}><Pencil /></button>
  ) : () => null;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold"><Truck className="h-4 w-4" />{t('Mashina va texnika')}</h3>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => ochiq('mashina', { turi: 'yuk', egalik: 'oz', yoqilgi_turi: 'dizel', holat: 'faol' })}><Plus />{t('Mashina qo‘shish')}</button>}
        </div>
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('Nomi')}</th><th>{t('Raqam')}</th><th>{t('Turi')}</th><th>{t('Yuk, t')}</th><th>{t('Me‘yor L/100 km')}</th><th>{t('Odometr')}</th><th>{t('Egalik')}</th><th>{t('Haydovchi')}</th><th>{t('Holat')}</th><th /></tr></thead>
          <tbody>
            {mashinalar.length === 0 && <OpsBoshQator ustun={10} matn={t('Mashinalar kiritilmagan')} izoh={t('Reys rejalashtirish uchun avval mashina qo‘shing.')} />}
            {mashinalar.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.nomi}</td><td>{m.davlat_raqami ?? '—'}</td><td>{turNom(m.turi)}</td><td className="num">{son(m.yuk_t)}</td>
                <td className="num">{son(m.norma_100km)}</td><td className="num">{son(m.odometr_km, 0)}</td><td>{m.egalik === 'oz' ? t('O‘zimizniki') : t('Ijara')}</td>
                <td>{m.haydovchi_id ? hayNom.get(m.haydovchi_id) ?? '—' : '—'}</td>
                <td><span className={`fz-stamp ${m.holat === 'faol' ? 'fz-stamp--ok' : m.holat === 'remontda' ? 'fz-stamp--danger' : 'fz-stamp--warn'}`}>{m.holat === 'faol' ? t('Faol') : m.holat === 'remontda' ? t('Ta‘mirda') : t('Nofaol')}</span></td>
                <td>{tahr('mashina', m)}</td>
              </tr>))}
          </tbody></table></div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold"><UserRound className="h-4 w-4" />{t('Haydovchi va operatorlar')}</h3>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => ochiq('haydovchi', { tolov_turi: 'reys', ijtimoiy_foiz: 12, holat: 'faol' })}><Plus />{t('Haydovchi qo‘shish')}</button>}
        </div>
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('F.I.Sh.')}</th><th>{t('Telefon')}</th><th>{t('Ish haqi')}</th><th>{t('Stavka, so‘m')}</th><th>{t('Holat')}</th><th /></tr></thead>
          <tbody>
            {haydovchilar.length === 0 && <OpsBoshQator ustun={6} matn={t('Haydovchilar kiritilmagan')} />}
            {haydovchilar.map((h) => (
              <tr key={h.id}><td className="font-medium">{h.ism}</td><td>{h.telefon ?? '—'}</td>
                <td>{({ reys: t('Reys uchun'), km: t('Km uchun'), soat: t('Soat uchun'), oylik: t('Oylik') } as Record<string, string>)[h.tolov_turi]}</td>
                <td className="num">{son(h.tolov_stavka, 0)}</td><td>{h.holat === 'faol' ? t('Faol') : t('Nofaol')}</td><td>{tahr('haydovchi', h)}</td></tr>))}
          </tbody></table></div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold"><CalendarClock className="h-4 w-4" />{t('Hujjatlar va muddatlar')}</h3>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => ochiq('hujjat', { egasi_turi: 'mashina', turi: 'sugurta', holat: 'faol' })}><Plus />{t('Hujjat qo‘shish')}</button>}
        </div>
        <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
          <thead><tr><th>{t('Egasi')}</th><th>{t('Hujjat')}</th><th>{t('Raqami')}</th><th>{t('Muddat')}</th><th>{t('Qolgan kun')}</th><th /></tr></thead>
          <tbody>
            {hujjatlar.length === 0 && <OpsBoshQator ustun={6} matn={t('Hujjatlar kiritilmagan')} izoh={t('Sug‘urta, texnik ko‘rik, guvohnoma muddati tugashidan 30 kun oldin signal beradi.')} />}
            {hujjatlar.map((h) => (
              <tr key={h.id}><td>{egaNom(h)}</td><td>{hujNom(h.turi)}</td><td>{h.raqam ?? '—'}</td><td>{h.muddat}</td>
                <td><span className={`fz-stamp ${SIGNAL[h.signal]}`}>{h.signal === 'otgan' ? t('{n} kun o‘tgan', { n: Math.abs(h.qolgan_kun) }) : t('{n} kun', { n: h.qolgan_kun })}</span></td>
                <td>{tahr('hujjat', h)}</td></tr>))}
          </tbody></table></div>
      </section>

      {forma && (
        <FormOyna ochiq sarlavha={forma.tur === 'mashina' ? t('Mashina / texnika') : forma.tur === 'haydovchi' ? t('Haydovchi') : t('Hujjat')}
          maydonlar={maydonlar[forma.tur]} boshlangich={forma.qiymat} onSaqla={saqla(forma.tur)} onYop={() => setForma(null)} />
      )}
    </div>
  );
}
