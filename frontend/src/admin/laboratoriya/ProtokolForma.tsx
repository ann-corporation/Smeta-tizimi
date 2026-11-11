/**
 * ProtokolForma.tsx — laboratoriya protokolni to'ldiradi: tur bo'yicha tuzilgan maydonlar, natija (mos / mos emas), fayl (R2), hisob-faktura.
 * Natija maslahati faqat taklif; tanlov va mas'uliyat laboratoriyada. Yuborilgach protokol АОSR va ish qatoriga avtomat ilova bo'ladi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { natijaYubor, sorovTafsilotOl, type SorovTafsilot } from '../../api/t2-lab-sorov';
import { maydonXatosi, maydonYuki, natijaMaslahati } from '../../lib/laboratoriya/sinov-maslahat';
import { t } from '../../i18n/til';
import { inp, tugmaAsosiy } from '../zakazchik/tomon-yordam';

const QARZ_MATNI: Record<string, string> = {
  yozildi: 'Hisob pudratchining qarzdorligiga yozildi',
  shartnoma_yoq: 'Pudratchida laboratoriya shartnomasi yo‘q — qarzga yozilmadi',
  shartnoma_noaniq: 'Pudratchida bir nechta laboratoriya shartnomasi — qarzga yozilmadi',
  summa_yoq: '',
};

export function ProtokolForma({ kompaniyaId, id, onTayyor }: { kompaniyaId: number; id: number; onTayyor: () => void }) {
  const [d, setD] = useState<SorovTafsilot | null>(null);
  const [qiymat, setQiymat] = useState<Record<string, string>>({});
  const [natija, setNatija] = useState<'mos' | 'mos_emas' | ''>('');
  const [raqam, setRaqam] = useState('');
  const [sana, setSana] = useState(new Date().toISOString().slice(0, 10));
  const [xulosa, setXulosa] = useState('');
  const [summa, setSumma] = useState('');
  const [invRaqam, setInvRaqam] = useState('');
  const [invSana, setInvSana] = useState('');
  const [muddat, setMuddat] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [fayllar, setFayllar] = useState<File[]>([]);
  const [band, setBand] = useState(false);

  const ol = useCallback(async () => {
    const r = await sorovTafsilotOl(kompaniyaId, id);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    const s = r.natija.sorov;
    setD(r.natija);
    setQiymat(Object.fromEntries(Object.entries(s.natija_maydon ?? {}).map(([k, v]) => [k, String(v)])));
    setNatija(s.natija === 'kutilmoqda' ? '' : s.natija);
    setRaqam(s.protokol_raqam ?? ''); setXulosa(s.xulosa ?? ''); setSumma(s.summa == null ? '' : String(s.summa));
    setInvRaqam(s.invoys_raqam ?? ''); setInvSana(s.invoys_sana ?? ''); setFayllar([]);
    if (s.protokol_sana) setSana(s.protokol_sana);
  }, [kompaniyaId, id]);
  useEffect(() => { setD(null); void ol(); }, [ol]);

  const maslahat = useMemo(() => (d ? natijaMaslahati(d.sorov.sinov_turi, qiymat) : null), [d, qiymat]);
  if (!d) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const s = d.sorov;
  const yopiq = s.holat !== 'ochiq' && s.holat !== 'bajarildi';

  const yubor = async () => {
    const xato = maydonXatosi(s.maydonlar, qiymat);
    if (xato) { toast(xato, 'danger'); return; }
    if (!natija) { toast(t('Natijani tanlang: mos yoki mos emas'), 'danger'); return; }
    if (!raqam.trim()) { toast(t('Protokol raqamini kiriting'), 'danger'); return; }
    setBand(true);
    const idlar: number[] = [];
    if (fayllar.length) {
      const lr = await sbLoyihaUmumiy(kompaniyaId);
      if (!lr.ok || !lr.id) { setBand(false); toast(lr.error || t('Fayl uchun loyiha topilmadi'), 'danger'); return; }
      for (const file of fayllar) {
        const u = await hujjatYukla({ file, kompaniyaId, loyihaId: lr.id, documentType: 'lab_protokol' });
        if (!u.ok) { setBand(false); toast(u.xato || t('Fayl yuklanmadi'), 'danger'); return; }
        idlar.push(u.data.document_id);
      }
    }
    const r = await natijaYubor(kompaniyaId, { murojaatId: s.id, versiya: s.versiya, natija, protokolRaqam: raqam, protokolSana: sana, maydon: maydonYuki(s.maydonlar, qiymat),
      xulosa, summa, invoysRaqam: invRaqam, invoysSana: invSana, bartarafMuddati: muddat, documentIds: idlar });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(natija === 'mos_emas' ? t('Protokol yuborildi — pudratchiga predpisaniya ochildi') : t('Protokol yuborildi va АОСР ga ilova qilindi'), 'ok');
    const q = QARZ_MATNI[r.natija.qarz];
    if (q) toast(t(q), r.natija.qarz === 'yozildi' ? 'ok' : 'warn');
    onTayyor(); void ol();
  };

  return (
    <div className="space-y-3" data-testid="protokol-forma">
      <div className="space-y-0.5">
        <div className="text-sm font-semibold">{s.sinov_nom}{s.konstruksiya ? ` — ${s.konstruksiya}` : ''}</div>
        <div className="text-xs text-text-dim">{s.beruvchi_nom} · {s.obyekt_nom ?? '—'}{s.aosr_raqam ? ` · АОСР № ${s.aosr_raqam}` : ''}{s.joy ? ` · ${s.joy}` : ''}{s.namuna_soni ? ` · ${t('namuna')}: ${s.namuna_soni}` : ''}{s.muddat ? ` · ${t('muddat')}: ${s.muddat}` : ''}</div>
        {s.standart && <div className="text-[11px] text-text-dim">{t('Norma')}: {s.standart}</div>}
        {s.matn && <p className="whitespace-pre-wrap rounded border border-border px-2 py-1 text-xs">{s.matn}</p>}
      </div>
      {!s.men_laboratoriyaman && (
        <div className="space-y-1 text-sm" data-testid="protokol-korish">
          <div>{t('Natija')}: <b>{s.natija === 'kutilmoqda' ? t('Kutilmoqda') : s.natija === 'mos' ? t('Mos') : t('Mos emas')}</b>{s.protokol_raqam ? ` · № ${s.protokol_raqam}` : ''}{s.protokol_sana ? ` · ${s.protokol_sana}` : ''}</div>
          {s.maydonlar.filter((m) => s.natija_maydon[m.kalit] != null).map((m) => <div key={m.kalit} className="text-xs text-text-dim">{m.nom}: {String(s.natija_maydon[m.kalit])}{m.birlik ? ` ${m.birlik}` : ''}</div>)}
          {s.xulosa && <p className="whitespace-pre-wrap rounded border border-border px-2 py-1 text-xs">{s.xulosa}</p>}
          {s.predpisaniya_id != null && <p className="text-xs text-danger">{t('Predpisaniya ochilgan — «Murojaatlar» sahifasida; tuzatgach qayta sinov so‘rang.')}</p>}
          <ul>{d.hujjatlar.map((h) => (
            <li key={h.document_id} className="text-xs"><a className="text-accent underline" href={hujjatYuklabOlishUrl(h.document_id)}><Paperclip size={11} className="mr-1 inline" />{h.fayl ?? `#${h.document_id}`}</a></li>))}</ul>
        </div>
      )}
      {s.men_laboratoriyaman && yopiq && (
        <p className="text-sm text-text-dim">{t('So‘rov yopilgan — tahrirlab bo‘lmaydi.')}</p>
      )}
      {s.men_laboratoriyaman && !yopiq && (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {s.maydonlar.map((m) => (
              <label key={m.kalit} className="text-xs text-text-dim">{m.nom}{m.birlik ? ` (${m.birlik})` : ''}{m.majburiy ? ' *' : ''}
                <input type={m.tur === 'sana' ? 'date' : 'text'} inputMode={m.tur === 'son' ? 'decimal' : undefined} className={`${inp} mt-1 block w-full`} value={qiymat[m.kalit] ?? ''}
                  onChange={(e) => setQiymat((x) => ({ ...x, [m.kalit]: e.target.value }))} /></label>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold">{t('Natija')} *</div>
            <div className="flex flex-wrap items-center gap-3">
              {(['mos', 'mos_emas'] as const).map((n) => (
                <label key={n} className="inline-flex items-center gap-1.5 text-sm"><input type="radio" name="lab-natija" checked={natija === n} onChange={() => setNatija(n)} />{n === 'mos' ? t('Mos') : t('Mos emas')}</label>))}
              {maslahat && natija !== maslahat.natija && (
                <button type="button" className="text-[11px] text-accent underline" onClick={() => setNatija(maslahat.natija)}>
                  {t('Maslahat')}: {maslahat.natija === 'mos' ? t('mos') : t('mos emas')} ({maslahat.sabab})</button>)}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs text-text-dim">{t('Protokol №')} *<input className={`${inp} mt-1 block w-full`} value={raqam} onChange={(e) => setRaqam(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Protokol sanasi')}<input type="date" className={`${inp} mt-1 block w-full`} value={sana} onChange={(e) => setSana(e.target.value)} /></label>
            {natija === 'mos_emas' && <label className="text-xs text-text-dim">{t('Bartaraf etish muddati')}<input type="date" className={`${inp} mt-1 block w-full`} value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>}
            <label className="text-xs text-text-dim md:col-span-3">{t('Xulosa')}{natija === 'mos_emas' ? ' *' : ''}<textarea className={`${inp} mt-1 block h-14 w-full`} value={xulosa} onChange={(e) => setXulosa(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Hisob summasi (QQS bilan)')}<input inputMode="decimal" className={`${inp} mt-1 block w-full`} value={summa} onChange={(e) => setSumma(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Hisob-faktura №')}<input className={`${inp} mt-1 block w-full`} value={invRaqam} onChange={(e) => setInvRaqam(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Hisob-faktura sanasi')}<input type="date" className={`${inp} mt-1 block w-full`} value={invSana} onChange={(e) => setInvSana(e.target.value)} /></label>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold">{t('Protokol fayli (PDF / skan)')}{s.fayl_document_id ? '' : ' *'}</div>
            <ul>{d.hujjatlar.map((h) => (
              <li key={h.document_id} className="text-xs"><a className="text-accent underline" href={hujjatYuklabOlishUrl(h.document_id)}><Paperclip size={11} className="mr-1 inline" />{h.fayl ?? `#${h.document_id}`}</a></li>))}</ul>
            <input type="file" multiple accept=".pdf,image/*" className="block text-xs" aria-label={t('Protokol fayli')} onChange={(e) => setFayllar(Array.from(e.target.files ?? []))} />
          </div>
          <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void yubor()}>{s.natija === 'kutilmoqda' ? t('Protokolni yuborish') : t('Protokolni yangilash')}</button>
        </>
      )}
    </div>
  );
}
