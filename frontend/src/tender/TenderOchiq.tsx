/**
 * /tender — ochiq tender vitrinasi (KIRMASDAN): ochiq lotlar ro'yxati, lot sahifasi (hajmlar, muddat, talablar). Narx, smeta va egasi ko'rinmaydi.
 * «Taklif berish» hisob talab qiladi: kirish/ro'yxatdan o'tish sahifasiga yo'naltiriladi (taklif kompaniya a'zosi nomidan, supply.offer ruxsati bilan — mavjud /admin/tender).
 * Takliflar MUHRLANGAN: muddatgacha hech kim (xaridor ham) narxni ko'rmaydi; bu yerda faqat takliflar SONI.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { t } from '../i18n/til';
import { FmtN } from '../lib/format';
import { tnOchiqLot, tnOchiqRoyxat, type OchiqLot, type OchiqLotRoyxat } from '../api/t2-tender-ochiq';

const katta = 'flex min-h-[48px] items-center justify-center rounded-xl px-4 text-[16px] font-semibold';
const TURLAR: Array<[string, string]> = [['material', 'Material'], ['subpudrat', 'Ish / subpudrat'], ['texnika_ijara', 'Texnika ijarasi'], ['xizmat', 'Xizmat']];
const turNomi = (k: string) => t(TURLAR.find(([x]) => x === k)?.[1] ?? k);
const sana = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

function Sarlavha() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <Link to="/tender" className="text-[20px] font-bold">{t('Ochiq tenderlar')}</Link>
      <nav className="flex gap-2 text-[14px]"><Link to="/bozor" className="rounded-lg border border-border px-3 py-2">{t('Bozor')}</Link><Link to="/yuk" className="rounded-lg border border-border px-3 py-2">{t('Yuk tashish')}</Link></nav>
    </header>
  );
}

function Royxat() {
  const [tur, setTur] = useState('');
  const [q, setQ] = useState('');
  const [lotlar, setLotlar] = useState<OchiqLotRoyxat[] | null>(null);
  const [xato, setXato] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => { void tnOchiqRoyxat({ tur: tur || undefined, q: q.trim() || undefined }).then((r) => { if (r.ok) { setLotlar(r.natija.lotlar); setXato(false); } else { setLotlar([]); setXato(true); } }); }, 250);
    return () => clearTimeout(h);
  }, [tur, q]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        <input className="h-12 min-w-[200px] flex-1 rounded-lg border border-border px-3 text-[16px]" type="search" aria-label={t('Qidirish')} placeholder={t('Qidirish')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-12 rounded-lg border border-border px-2" aria-label={t('Tur')} value={tur} onChange={(e) => setTur(e.target.value)}><option value="">{t('Hammasi')}</option>{TURLAR.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}</select>
      </div>
      {xato && <p role="alert" className="text-warn">{t('Tenderlar hozir ochilmadi. Birozdan keyin urinib ko‘ring.')}</p>}
      {lotlar == null ? <p className="text-text-mute">{t('Yuklanmoqda…')}</p> : lotlar.length === 0 && !xato ? <p className="rounded-xl border border-border p-4">{t('Hozircha ochiq tender yo‘q.')}</p> : (
        <ul className="flex flex-col gap-2">
          {lotlar.map((l) => (
            <li key={l.id}><Link to={`/tender/${l.id}`} className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <span className="text-[12px] text-text-mute">{turNomi(l.tur)}{l.raqam ? ` · № ${l.raqam}` : ''}{l.egasi_nom ? ` · ${l.egasi_nom}` : ''}</span>
              <span className="text-[16px] font-semibold">{l.nom}</span>
              <span className="text-[13px] text-text-mute">{t('Muddat')}: {sana(l.muddat)} · {t('pozitsiya')}: {l.qator_soni} · {t('takliflar')}: {l.takliflar_soni}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Lot({ id }: { id: number }) {
  const [d, setD] = useState<OchiqLot | null | false>(null);
  useEffect(() => { void tnOchiqLot(id).then((r) => setD(r.ok ? r.natija : false)); }, [id]);
  if (d === null) return <p className="p-4 text-text-mute">{t('Yuklanmoqda…')}</p>;
  if (d === false) return <p className="p-4">{t('Tender topilmadi yoki yopilgan.')} <Link to="/tender" className="underline">{t('Ro‘yxatga qaytish')}</Link></p>;
  const { lot, qatorlar } = d;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
      <div><span className="text-[12px] text-text-mute">{turNomi(lot.tur)}{lot.raqam ? ` · № ${lot.raqam}` : ''}</span><h1 className="text-[22px] font-bold">{lot.nom}</h1></div>
      <p className="text-[14px]">{t('Taklif muddati')}: <b>{sana(lot.muddat)}</b>{lot.muddat_otgan ? ` — ${t('muddat o‘tgan')}` : ''} · {t('Takliflar soni')}: {lot.takliflar_soni}</p>
      <p role="note" className="rounded-lg bg-surface-2 p-2 text-[13px]">{t('Takliflar muhrlangan: muddat tugaguncha hech kim narxlarni ko‘rmaydi. Narxlar QQS siz birlik narxida beriladi.')}</p>
      {lot.izoh && <p className="whitespace-pre-wrap text-[15px]">{lot.izoh}</p>}
      <dl className="grid gap-1 text-[14px] sm:grid-cols-2">
        {lot.tolov_sharti && <div><dt className="text-text-mute">{t('To‘lov sharti')}</dt><dd>{lot.tolov_sharti}</dd></div>}
        <div><dt className="text-text-mute">{t('Baholash usuli')}</dt><dd>{lot.baholash_usuli === 'ball' ? t('Ball bo‘yicha') : t('Eng past narx')}</dd></div>
        {lot.egasi_nom && <div><dt className="text-text-mute">{t('Buyurtmachi')}</dt><dd>{lot.egasi_nom}</dd></div>}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[14px]">
          <thead><tr className="text-left text-text-mute"><th>№</th><th>{t('Pozitsiya')}</th><th>{t('Birlik')}</th><th className="text-right">{t('Hajm')}</th><th>{t('Joy / sana')}</th></tr></thead>
          <tbody>{qatorlar.map((q) => (
            <tr key={q.qator_no} className="border-t border-border"><td>{q.qator_no}</td><td>{q.nom}{q.lot_nom ? <span className="block text-[12px] text-text-mute">{q.lot_nom}</span> : null}{q.spets ? <span className="block text-[12px] text-text-mute">{q.spets}</span> : null}</td><td>{q.birlik}</td><td className="text-right tabular-nums"><FmtN val={q.miqdor} /></td><td>{[q.yetkazish_joyi, q.talab_sana].filter(Boolean).join(' · ') || '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {!lot.muddat_otgan && <Link to="/" state={{ qaytish: `/admin/tender?id=${lot.id}` }} className={`${katta} bg-blue-600 text-white`}>{t('Taklif berish')}</Link>}
      <p className="text-[12px] text-text-mute">{t('Taklif berish uchun hisob va kompaniya a‘zoligi (ta‘minot ruxsati) kerak. Yakka shaxs bo‘lsangiz kirgach kompaniyangizni o‘zingiz darhol ochasiz.')}</p>
    </div>
  );
}

export default function TenderOchiq() {
  const { lotId } = useParams();
  const n = Number(lotId);
  return <main className="min-h-screen bg-bg text-text"><Sarlavha />{Number.isSafeInteger(n) && n > 0 ? <Lot id={n} /> : <Royxat />}</main>;
}
