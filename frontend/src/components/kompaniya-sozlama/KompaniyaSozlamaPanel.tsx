/**
 * KompaniyaSozlamaPanel — kompaniya admin panelidagi «Sozlamalar» yorlig'i (Sozlamalar markazi).
 * Hamma narsa serverda (`/api/kompaniya-sozlama`): barcha xodim va kompyuterlarda bir xil.
 * Rasmiy hujjat matnlari rus tilida qoladi; bu yerda faqat boshqaruv interfeysi.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileSignature, Palette, ShieldCheck } from 'lucide-react';
import { SERVER_YANGILANMAGAN, SozlamaXatosi, useKompaniyaSozlama, useKompaniyaSozlamaSaqla, type F2TasdiqRejimi } from '../../api/kompaniya-sozlama';
import { MAYDONLAR } from '../../umumiy/hujjat/HujjatTomonlari';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { t } from '../../i18n/til';
import { INPUT_SINF, INPUT_STIL, Karta, Nota, Skelet } from '../akkaunt/AkkauntUi';

const MAVQE: Record<string, { nom: string; izoh: string }> = {
  zakazchik: { nom: 'Buyurtmachi', izoh: 'Pudratchi aktlarini qabul qiladi, tasdiqlaydi va to‘lovni nazorat qiladi.' },
  pudratchi: { nom: 'Pudratchi', izoh: 'Smeta, F2 akt va resurs vedomostlarini tayyorlaydi; F2 tasdiqlash tartibi shu yerda qo‘llanadi.' },
  loyihachi: { nom: 'Loyihachi', izoh: 'Loyiha va smeta hujjatlarini tayyorlaydi; hujjat dizayni va imzo tomonlari muhim.' },
};

const REJIMLAR: Array<{ k: F2TasdiqRejimi; nom: string; izoh: string }> = [
  { k: 'shaxsiy', nom: 'Shaxsiy', izoh: 'Bir kishi tayyorlaydi va o‘zi tasdiqlaydi — kichik jamoalar uchun.' },
  { k: 'korporativ', nom: 'Korporativ', izoh: 'Tayyorlovchi, tekshiruvchi va tasdiqlovchi turli kishilar bo‘lishi shart — buni ma’lumotlar bazasi o‘zi majburlaydi.' },
];

export function KompaniyaSozlamaPanel({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useKompaniyaSozlama(kompaniyaId);
  const saqla = useKompaniyaSozlamaSaqla();
  const [imzo, setImzo] = useState<ImzoNomlar>({});
  const [imzoOzgargan, setImzoOzgargan] = useState(false);
  const [rejim, setRejim] = useState<F2TasdiqRejimi | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [saqlandi, setSaqlandi] = useState(false);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverImzo = q.data?.sozlamalar['hujjat.imzo_tomonlari']?.qiymat;
  useEffect(() => { if (!imzoOzgargan) setImzo((serverImzo && typeof serverImzo === 'object' ? serverImzo : {}) as ImzoNomlar); }, [serverImzo, imzoOzgargan]);
  useEffect(() => { if (q.data) setRejim(q.data.f2_tasdiq_rejimi); }, [q.data]);
  useEffect(() => () => { if (taymer.current) clearTimeout(taymer.current); }, []);

  if (q.isLoading) return <Skelet qatorlar={4} />;
  if (q.isError || !q.data) {
    const kod = q.error instanceof SozlamaXatosi ? q.error.code : null;
    if (kod === SERVER_YANGILANMAGAN) return <Nota tur="info">{t('Server hali yangilanmagan: kompaniya sozlamalari API si yoqilmagan. Hozircha hujjat sozlamalari shu brauzerda saqlanadi.')}</Nota>;
    return (
      <Nota tur="danger">
        <span>{t('Kompaniya sozlamalarini o‘qib bo‘lmadi.')}</span>{' '}
        <button type="button" className="fz-btn fz-btn--sm" onClick={() => void q.refetch()}>{t('Qayta urinish')}</button>
      </Nota>
    );
  }

  const d = q.data;
  const yozish = d.yozish_mumkin;
  const mavqe = d.mavqe ? MAVQE[d.mavqe] : undefined;

  const xatoQil = (e: unknown) => setXato(e instanceof SozlamaXatosi && e.code === 'AUTHORIZATION_DENIED'
    ? t('Bu amal uchun ruxsatingiz yo‘q.') : e instanceof SozlamaXatosi && e.code === SERVER_YANGILANMAGAN
      ? t('Server hali yangilanmagan.') : t('Saqlab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.'));

  const rejimTanla = (k: F2TasdiqRejimi) => {
    if (!yozish || k === rejim) return;
    const eski = rejim;
    setRejim(k); setXato(null);
    saqla.mutate({ kompaniya_id: kompaniyaId, kalit: 'f2.tasdiq_rejimi', qiymat: k }, { onError: (e) => { setRejim(eski); xatoQil(e); } });
  };

  const imzoOzgart = (kalit: keyof ImzoNomlar, v: string) => {
    const next = { ...imzo, [kalit]: v };
    setImzo(next); setImzoOzgargan(true); setSaqlandi(false); setXato(null);
    if (taymer.current) clearTimeout(taymer.current);
    taymer.current = setTimeout(() => {
      const toza = Object.fromEntries(Object.entries(next).filter(([, x]) => typeof x === 'string' && x.trim()));
      saqla.mutate({ kompaniya_id: kompaniyaId, kalit: 'hujjat.imzo_tomonlari', qiymat: Object.keys(toza).length ? toza : null }, {
        onSuccess: () => { setSaqlandi(true); setImzoOzgargan(false); }, onError: xatoQil,
      });
    }, 800);
  };

  return (
    <div className="flex flex-col gap-3">
      {!yozish && <Nota tur="info">{t('Sozlamalarni faqat kompaniya profilini o‘zgartirish huquqi bor xodim tahrirlay oladi. Sizda faqat ko‘rish.')}</Nota>}
      {xato && <Nota tur="danger">{xato}</Nota>}

      <Karta sarlavha="Kompaniya turi" tavsif="Mavqe tizim interfeysi va hujjatlar qaysi tomondan tuzilishini belgilaydi.">
        <div className="flex items-start gap-2">
          <Building2 size={16} className="mt-0.5 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text">{mavqe ? t(mavqe.nom) : t('belgilanmagan')}</div>
            <p className="m-0 text-[12px] text-text-dim">{mavqe ? t(mavqe.izoh) : t('Kompaniya turi hali tanlanmagan — Profil yorlig‘ida belgilang.')}</p>
          </div>
        </div>
        <Link to="/admin/kompaniya?tab=profil" className="fz-btn fz-btn--sm self-start">{t('Profilda o‘zgartirish')}</Link>
      </Karta>

      <Karta sarlavha="F2 tasdiqlash tartibi" tavsif="Faqat pudratchining F2 aktlariga tegishli.">
        <div role="radiogroup" aria-label={t('F2 tasdiqlash tartibi')} className="grid gap-2 sm:grid-cols-2">
          {REJIMLAR.map((r) => {
            const faol = rejim === r.k;
            return (
              <button key={r.k} type="button" role="radio" aria-checked={faol} disabled={!yozish || saqla.isPending} onClick={() => rejimTanla(r.k)}
                className={`rounded-md border p-3 text-left transition-colors disabled:opacity-60 ${faol ? 'border-accent bg-accent/5' : 'border-[var(--border)] hover:border-accent'}`}>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text"><ShieldCheck size={14} className={faol ? 'text-accent' : 'text-text-dim'} aria-hidden="true" />{t(r.nom)}</span>
                <span className="mt-1 block text-[12px] text-text-dim">{t(r.izoh)}</span>
              </button>
            );
          })}
        </div>
        {!yozish && <p className="m-0 text-[12px] text-text-dim">{t('O‘zgartirish uchun ruxsat yo‘q.')}</p>}
      </Karta>

      <Karta sarlavha="Hujjat imzo tomonlari" tavsif="Hujjat imzo blokida chiqadigan tashkilotlar. Bo‘sh qoldirilsa hujjatda to‘ldirish chizig‘i chiqadi.">
        <p className="m-0 flex items-center gap-1.5 text-[12px] text-text-dim"><FileSignature size={13} aria-hidden="true" />{t('Barcha xodimlar va kompyuterlarda bir xil')}{saqlandi ? ` · ${t('Saqlandi')}` : ''}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MAYDONLAR.map((m) => (
            <label key={m.k} className="flex flex-col gap-1 text-[12px] text-text-dim">
              <span><b className="text-text">{t(m.rol)}</b> <i>{m.ru}</i>{m.izoh ? ` — ${t(m.izoh)}` : ''}</span>
              <input className={INPUT_SINF} style={INPUT_STIL} disabled={!yozish} aria-label={`${t(m.rol)} (${m.ru})`} value={imzo[m.k] ?? ''}
                placeholder={t('tashkilot, lavozim, F.I.O.')} onChange={(e) => imzoOzgart(m.k, e.target.value)} />
            </label>
          ))}
        </div>
      </Karta>

      <Karta sarlavha="Hujjat dizayni" tavsif="Har bir hujjat turi uchun rang mavzusi (Excel va ko‘rish oynasida).">
        <p className="m-0 flex items-center gap-1.5 text-[12px] text-text-dim"><Palette size={13} aria-hidden="true" />{d.sozlamalar['hujjat.dizayn']?.qiymat ? t('Kompaniya dizayni serverda saqlangan.') : t('Sukut (kulrang) mavzu qo‘llanmoqda.')}</p>
        <Link to="/admin/hujjat-dizayn" className="fz-btn fz-btn--sm self-start">{t('Dizaynni sozlash')}</Link>
      </Karta>
    </div>
  );
}

export default KompaniyaSozlamaPanel;
