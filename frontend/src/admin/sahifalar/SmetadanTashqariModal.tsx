import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Repeat2, Trash2, X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { sbFaktSmetadanTashqari, sbIshTurlariOl, smetadanTashqariXato, type IshTuri, type SmetadanTashqariResurs } from '../../api/t2-fakt-smetadan-tashqari';
import { sonOqi, type TezkorQator } from '../../lib/fakt-tezkor';

export type Bolim = { id: number; nom: string; versiya: number };

type ResursQator = { tur: 'mat' | 'ob'; nom: string; birlik: string; hajm: string };

/**
 * Fakt kiritishning o'zida: QO'SHIMCHA ish (resurslari bilan) yoki ZAMENA (material/ish).
 * Bitta saqlash — qator(lar) + fakt bitta tranzaksiyada; natija darhol F2 qoldig'ida.
 */
export function SmetadanTashqariModal({ kompaniyaId, obyektId, sana, bolimlar, zamena, boshBolimId, onYop, onSaqlandi }: {
  kompaniyaId: number; obyektId: number; sana: string;
  bolimlar: Bolim[];
  /** Berilsa — shu qatorni ZAMENA qilish; aks holda qo'shimcha ish. */
  zamena?: TezkorQator | null;
  boshBolimId?: number | null;
  onYop: () => void; onSaqlandi: (xabar: string) => void;
}) {
  const [katalog, setKatalog] = useState<IshTuri[]>([]);
  const [ishTuriId, setIshTuriId] = useState('');
  const [bolimId, setBolimId] = useState(boshBolimId ? String(boshBolimId) : '');
  const [nom, setNom] = useState(''); const [birlik, setBirlik] = useState(zamena?.birlik ?? ''); const [kod, setKod] = useState('');
  const [hajm, setHajm] = useState(''); const [sabab, setSabab] = useState(zamena ? '' : '');
  const [resurslar, setResurslar] = useState<ResursQator[]>([]);
  const [katalogaSaqla, setKatalogaSaqla] = useState(false);
  const [band, setBand] = useState(false); const [xato, setXato] = useState('');
  const operationId = useRef(yangiOperationId());
  const zamenaRejim = !!zamena;
  const ishZamena = zamena?.tur === 'bl';

  useEffect(() => { void sbIshTurlariOl(kompaniyaId).then((r) => setKatalog(r.ok ? r.qatorlar ?? [] : [])); }, [kompaniyaId]);
  const katalogTanla = (id: string) => {
    setIshTuriId(id);
    const t = katalog.find((x) => String(x.id) === id);
    if (t) { setNom(t.nomi); setBirlik(t.birligi); setKod(t.kod); }
  };

  const hajmSon = sonOqi(hajm);
  const resursXato = resurslar.some((r) => !r.nom.trim() || !r.birlik.trim() || !(Number(sonOqi(r.hajm)) > 0));
  const tayyor = !!nom.trim() && !!birlik.trim() && hajmSon != null && hajmSon > 0 && !!sabab.trim() && !resursXato && !band;
  const bolim = useMemo(() => bolimlar.find((b) => String(b.id) === bolimId), [bolimId, bolimlar]);

  const saqla = async () => {
    if (!tayyor) return;
    setBand(true); setXato('');
    try {
      const r = await sbFaktSmetadanTashqari({
        kompaniyaId, obyektId, sana, sabab: sabab.trim(), hajm: hajmSon!,
        command: zamenaRejim ? 'replacement' : 'additional',
        otaQatorId: zamenaRejim ? zamena!.otaId : (bolim?.id ?? null),
        kutilganVersiya: zamenaRejim ? zamena!.otaVersiya : (bolim?.versiya ?? null),
        almashtirilayotganQatorId: zamena?.id,
        nom: nom.trim(), birlik: birlik.trim(), kod: kod.trim() || undefined,
        resurslar: resurslar.map((x): SmetadanTashqariResurs => ({ tur: x.tur, nom: x.nom.trim(), birlik: x.birlik.trim(), hajm: Number(sonOqi(x.hajm)) })),
        ishTuriId: ishTuriId ? Number(ishTuriId) : undefined, katalogaSaqla,
        operationId: operationId.current,
      });
      if (!r.ok) { setXato(smetadanTashqariXato(r)); return; }
      onSaqlandi(zamenaRejim
        ? `Zamena saqlandi: «${nom.trim()}» — fakt ${hajmSon} ${birlik}, F2 ga tayyor.`
        : `Qo‘shimcha ish saqlandi${resurslar.length ? ` (${resurslar.length} ta resurs bilan)` : ''} — fakt F2 ga tayyor.`);
    } catch { setXato('Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz.'); }
    finally { setBand(false); }
  };

  const inp = 'mt-1 block w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={zamenaRejim ? 'Zamena' : 'Smetadan tashqari ish'}>
      <div className="karta mt-8 w-full max-w-2xl space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">{zamenaRejim ? <><Repeat2 size={16} className="text-warn" /> Zamena</> : <><Plus size={16} className="text-accent" /> Smetadan tashqari (qo‘shimcha) ish</>}</h2>
            {zamenaRejim
              ? <p className="mt-1 text-[12px] text-text-dim">Almashtiriladi: <b className="text-text">{zamena!.nom}</b>{zamena!.birlik ? `, ${zamena!.birlik}` : ''}. Eski qator o‘zgarmaydi — yangi qator unga ishora qiladi.</p>
              : <p className="mt-1 text-[12px] text-text-dim">Bajarilgan ish fakt sifatida yoziladi va darhol F2 ga tayyor bo‘ladi.</p>}
          </div>
          <button onClick={onYop} className="rounded p-1 text-text-dim hover:bg-surface-2" aria-label="Yopish"><X size={18} /></button>
        </div>

        {!zamenaRejim && <label className="block text-[12px] font-medium">Bo‘lim
          <select value={bolimId} onChange={(e) => setBolimId(e.target.value)} className={inp} aria-label="Bo‘lim">
            <option value="">«СМЕТАДАН ТАШҚАРИ ИШЛАР» (avtomatik bo‘lim)</option>
            {bolimlar.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>}

        {katalog.length > 0 && <label className="block text-[12px] font-medium">Ish turlari katalogidan
          <select value={ishTuriId} onChange={(e) => katalogTanla(e.target.value)} className={inp} aria-label="Ish turi">
            <option value="">— qo‘lda kiritish —</option>
            {katalog.map((t) => <option key={t.id} value={t.id}>{t.kod} · {t.nomi} ({t.birligi})</option>)}
          </select>
        </label>}

        <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
          <label className="text-[12px] font-medium">{zamenaRejim ? (ishZamena ? 'Yangi ish nomi' : 'Yangi material nomi') : 'Ish nomi'}<input value={nom} onChange={(e) => setNom(e.target.value)} className={inp} aria-label="Nom" /></label>
          <label className="text-[12px] font-medium">Birlik<input value={birlik} onChange={(e) => setBirlik(e.target.value)} className={inp} aria-label="Birlik" /></label>
          <label className="text-[12px] font-medium">Kod<input value={kod} onChange={(e) => setKod(e.target.value)} placeholder="ixtiyoriy" className={inp} aria-label="Kod" /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <label className="text-[12px] font-medium">Bajarilgan hajm<input value={hajm} onChange={(e) => setHajm(e.target.value)} inputMode="decimal" className={`${inp} text-right font-mono`} aria-label="Bajarilgan hajm" /></label>
          <label className="text-[12px] font-medium">Sabab (majburiy)<input value={sabab} onChange={(e) => setSabab(e.target.value)} placeholder={zamenaRejim ? 'masalan: loyihachi xati № …, material yo‘q edi' : 'masalan: buyurtmachi topshirig‘i, dalolatnoma № …'} className={inp} aria-label="Sabab" /></label>
        </div>

        {(!zamenaRejim || ishZamena) && <section className="rounded-lg border border-border p-2.5">
          <div className="flex items-center justify-between"><span className="text-[12px] font-semibold">Resurslar (material / uskuna)</span>
            <button type="button" onClick={() => setResurslar((r) => [...r, { tur: 'mat', nom: '', birlik: '', hajm: '' }])} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-surface-2"><Plus size={12} /> Resurs</button></div>
          {resurslar.length === 0 && <p className="mt-1 text-[11px] text-text-mute">Ixtiyoriy. Ishga sarflangan material yoki uskunani shu yerda qo‘shing — ular ham faktga va F2 ga o‘tadi.</p>}
          {resurslar.map((r, i) => <div key={i} className="mt-1.5 grid grid-cols-[6.5rem_1fr_5rem_6rem_2rem] gap-1.5">
            <select value={r.tur} onChange={(e) => setResurslar((a) => a.map((x, j) => j === i ? { ...x, tur: e.target.value as 'mat' | 'ob' } : x))} className="rounded border border-border bg-bg px-1 text-[12px]" aria-label="Resurs turi"><option value="mat">Material</option><option value="ob">Uskuna</option></select>
            <input value={r.nom} onChange={(e) => setResurslar((a) => a.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))} placeholder="Nomi" className="rounded border border-border bg-bg px-2 py-1 text-[12px]" aria-label="Resurs nomi" />
            <input value={r.birlik} onChange={(e) => setResurslar((a) => a.map((x, j) => j === i ? { ...x, birlik: e.target.value } : x))} placeholder="Birlik" className="rounded border border-border bg-bg px-2 py-1 text-[12px]" aria-label="Resurs birligi" />
            <input value={r.hajm} onChange={(e) => setResurslar((a) => a.map((x, j) => j === i ? { ...x, hajm: e.target.value } : x))} placeholder="Hajm" inputMode="decimal" className="rounded border border-border bg-bg px-2 py-1 text-right font-mono text-[12px]" aria-label="Resurs hajmi" />
            <button type="button" onClick={() => setResurslar((a) => a.filter((_, j) => j !== i))} className="text-text-dim hover:text-danger" aria-label="Resursni olib tashlash"><Trash2 size={14} /></button>
          </div>)}
        </section>}

        {!ishTuriId && <label className="flex items-center gap-2 text-[12px] text-text-dim"><input type="checkbox" checked={katalogaSaqla} onChange={(e) => setKatalogaSaqla(e.target.checked)} /> Shu ishni kompaniya ish turlari katalogiga saqlash (keyingi safar tanlash uchun)</label>}

        {xato && <p role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">{xato}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onYop} className="rounded-lg border border-border px-3 py-2 text-[12px]">Bekor qilish</button>
          <button onClick={() => void saqla()} disabled={!tayyor} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{band ? 'Saqlanmoqda…' : 'Saqlash (fakt + F2 ga)'}</button>
        </div>
      </div>
    </div>
  );
}
