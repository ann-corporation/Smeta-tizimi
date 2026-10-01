/**
 * NarxlarNative — Narxlar markazining Supabase-only ko‘rinishi.
 *
 * Bu komponent GAS chaqirmaydi. Hisoblash ham qilmaydi: natija va manba
 * `t2_narx_markaz`ning bazadagi ko‘rinishidan olinadi. Flag-off legacy
 * ekran boshqa modulda o‘z holicha qoladi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, Search, ShieldAlert, Tags } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbOqi, sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  sbT2NarxBelgila, sbT2NarxMarkazOl, sbT2NarxSanaQosh,
  sbT2TopilmaganlarOl, type NarxMarkaz, type Topilmagan,
} from '../../api/t2-narx';
import KatalogManbaImport from './KatalogManbaImport';

type NarxRegistr = {
  id: number;
  nom_key: string;
  birlik_key: string;
  versiya: number;
  narx: number;
};

const ERKIN_KAT = ['МАТ', 'ОБ', 'М/К', 'КАБ'];

function kalit(nomKey: string, birlikKey: string) {
  return `${nomKey}|${birlikKey}`;
}

function birlikdanQulfKat(birlik: string | null | undefined) {
  const u = String(birlik || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (['ЧЕЛЧ', 'ЧЕЛСОАТ', 'CHELCH', 'CHELSOAT'].includes(u)) return 'ЧЕЛ';
  if (['МАШЧ', 'МАШСОАТ', 'MASHCH', 'MASHSOAT'].includes(u)) return 'МАШ';
  return null;
}

function xatoXabari(x: unknown) {
  return x instanceof Error ? x.message : 'Narx saqlanmadi';
}

export default function NarxlarNative() {
  const { joriy, yuklanmoqda: kompaniyaYuklanmoqda } = useKompaniya();
  const workspace = usePTOWorkspace();
  const kompaniyaId = joriy?.id ?? null;
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [markaz, setMarkaz] = useState<NarxMarkaz[]>([]);
  const [topilmaganlar, setTopilmaganlar] = useState<Topilmagan[]>([]);
  const [registr, setRegistr] = useState<Record<string, NarxRegistr>>({});
  const [qidiruv, setQidiruv] = useState('');
  const [faqatXavf, setFaqatXavf] = useState(false);
  const [tanlangan, setTanlangan] = useState<NarxMarkaz | Topilmagan | null>(null);
  const [narxKiritma, setNarxKiritma] = useState('');
  const [kat, setKat] = useState('');
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [xabar, setXabar] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) {
      setObyektlar([]); setObyektId(null); setMarkaz([]); setTopilmaganlar([]); setRegistr({});
      return;
    }
    setYuklanmoqda(true); setXato('');
    try {
      const [m, r, o] = await Promise.all([
        sbT2NarxMarkazOl(kompaniyaId),
        sbOqi<NarxRegistr>({
          jadval: 't2_narx',
          ustunlar: 'id,nom_key,birlik_key,versiya,narx',
          filtr: `kompaniya_id=eq.${kompaniyaId}&obyekt_id=is.null`,
          tartib: 'nom_key.asc', limit: 20000,
        }),
        sbT2ObyektlarOlKomp(kompaniyaId),
      ]);
      if (!m.ok) throw new Error(m.error || 'Narxlar markazi o‘qilmadi');
      if (!r.ok) throw new Error(r.error || 'Narx registri o‘qilmadi');
      if (!o.ok) throw new Error(o.error || 'Obyektlar o‘qilmadi');
      setMarkaz((m.qatorlar as NarxMarkaz[]) || []);
      const byKey: Record<string, NarxRegistr> = {};
      for (const row of (r.qatorlar as NarxRegistr[]) || []) byKey[kalit(row.nom_key, row.birlik_key)] = row;
      setRegistr(byKey);
      const obyektlarYangi = (o.qatorlar as T2Obyekt[]) || [];
      setObyektlar(obyektlarYangi);
      setObyektId(oldingi => workspace.scope.objectId ?? oldingi ?? obyektlarYangi[0]?.id ?? null);
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setYuklanmoqda(false);
    }
  }, [kompaniyaId, workspace.scope.objectId]);

  const topilmaganlarniYukla = useCallback(async () => {
    if (!obyektId) { setTopilmaganlar([]); return; }
    const r = await sbT2TopilmaganlarOl(obyektId);
    if (!r.ok) { setXato(r.error || 'Bog‘lanish topilmagan resurslar o‘qilmadi'); return; }
    setTopilmaganlar((r.qatorlar as Topilmagan[]) || []);
  }, [obyektId]);

  useEffect(() => { if (!kompaniyaYuklanmoqda) void yukla(); }, [kompaniyaYuklanmoqda, yukla]);
  useEffect(() => { void topilmaganlarniYukla(); }, [topilmaganlarniYukla]);

  const tanlanganKalit = tanlangan && 'nom_key' in tanlangan
    ? kalit(tanlangan.nom_key, tanlangan.birlik_key) : null;
  const tanlanganRegistr = tanlanganKalit ? registr[tanlanganKalit] : undefined;
  const tanlanganBirlik = tanlangan?.birlik ?? null;
  const qulfKat = birlikdanQulfKat(tanlanganBirlik);

  useEffect(() => {
    if (!tanlangan) { setNarxKiritma(''); setKat(''); return; }
    setNarxKiritma(tanlanganRegistr ? String(tanlanganRegistr.narx) : '');
    setKat(qulfKat || ('kat' in tanlangan ? (tanlangan.kat || '') : ''));
  }, [tanlangan, tanlanganRegistr, qulfKat]);

  const markazSatrlar = useMemo(() => {
    const q = qidiruv.trim().toLocaleLowerCase();
    return markaz.filter(r => {
      if (faqatXavf && !r.xavf) return false;
      return !q || `${r.nom || ''} ${r.birlik || ''}`.toLocaleLowerCase().includes(q);
    });
  }, [markaz, qidiruv, faqatXavf]);
  const topilmaganSatrlar = useMemo(() => {
    const q = qidiruv.trim().toLocaleLowerCase();
    return topilmaganlar.filter(r => !q || `${r.nom || ''} ${r.birlik || ''}`.toLocaleLowerCase().includes(q));
  }, [topilmaganlar, qidiruv]);

  async function narxniSaqlash() {
    if (!tanlangan || !tanlanganKalit) return;
    const narx = Number(narxKiritma.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(narx) || narx <= 0) {
      setXato('Narx musbat son bo‘lishi kerak. Noma’lum qiymat 0 bilan almashtirilmaydi.');
      return;
    }
    setSaqlanmoqda(true); setXato(''); setXabar('');
    try {
      const r = await sbT2NarxBelgila({
        nom: tanlangan.nom || '', birlik: tanlangan.birlik || undefined, narx,
        kat: qulfKat || kat || undefined, kutilganVersiya: tanlanganRegistr?.versiya,
      });
      if (!r.ok) throw new Error(r.sabab === 'STALE_VERSION'
        ? 'Narx boshqa foydalanuvchi tomonidan yangilangan. Sahifani yangilang.'
        : r.error || r.sabab || 'Narx saqlanmadi');
      setXabar('Narx registrga saqlandi. Smetadagi qatordagi narx avtomatik o‘zgarmaydi.');
      setTanlangan(null);
      await yukla(); await topilmaganlarniYukla();
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  async function sanaNarxiniQoshish() {
    if (!tanlangan) return;
    const narx = Number(narxKiritma.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(narx) || narx <= 0) {
      setXato('Sana narxi musbat son bo‘lishi kerak.'); return;
    }
    setSaqlanmoqda(true); setXato(''); setXabar('');
    try {
      const r = await sbT2NarxSanaQosh({
        sana,
        qatorlar: [{ nom: tanlangan.nom || '', birlik: tanlangan.birlik || undefined, narx }],
        manba: 'Narxlar markazi',
      });
      if (!r.ok || r.kafolat !== true || r.kirgan !== (r.yozildi || 0) + (r.tashlandi || 0)) {
        throw new Error(r.error || r.sabab || 'Sana narxi hisob kafolati bilan saqlanmadi');
      }
      setXabar('Sana narxi saqlandi. U bazadagi narx manbalari bilan alohida ko‘rinadi.');
      await yukla();
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  if (kompaniyaYuklanmoqda) return <div className="p-6 text-sm text-text-mute">Kompaniya konteksti yuklanmoqda…</div>;
  if (!kompaniyaId) return <div className="p-6 text-sm text-warn">Narxlarni ko‘rish uchun faol kompaniya tanlanmagan.</div>;

  return (
    <Sahifa
      sarlavha="Narxlar markazi"
      tavsif="Supabase registri: narx manbasi va uning hisobga olinishi aniq ko‘rinadi"
      amallar={<button onClick={() => void yukla()} disabled={yuklanmoqda}
        className="h-9 px-3 inline-flex items-center gap-2 rounded-[10px] karta text-sm text-text disabled:opacity-50">
        <RefreshCw size={15} className={yuklanmoqda ? 'animate-spin' : ''} /> Yangilash
      </button>}
    >
      <div className="space-y-3">
        <KatalogManbaImport />
        <div className="karta p-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-[12px] font-medium text-text">Obyekt
            <select value={obyektId ?? ''} onChange={e => { const id = Number(e.target.value); setObyektId(Number.isSafeInteger(id) && id > 0 ? id : null); workspace.setObjectId(Number.isSafeInteger(id) && id > 0 ? id : null); }}
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-border rounded-lg px-3 py-2 text-[13px] text-text">
              {!obyektlar.length && <option value="">— obyekt yo‘q —</option>}
              {obyektlar.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-[12px] font-medium text-text">Qidiruv
            <span className="relative mt-1.5 block"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={qidiruv} onChange={e => setQidiruv(e.target.value)} placeholder="nom yoki birlik…"
                className="w-full bg-[var(--surface-2)] border border-border rounded-lg pl-8 pr-3 py-2 text-[13px] text-text" />
            </span>
          </label>
          <button onClick={() => setFaqatXavf(v => !v)} className={`h-9 px-3 rounded-lg text-[12px] ${faqatXavf ? 'bg-warn/20 text-warn' : 'bg-white/5 text-text-dim'}`}>
            {faqatXavf ? 'Xavf filtri: yoqilgan' : 'Faqat xavflilar'}
          </button>
        </div>

        {xato && <div className="karta p-3 border-danger/40 bg-danger/5 text-[13px] text-danger"><AlertTriangle size={15} className="inline mr-2" />{xato}</div>}
        {xabar && <div className="karta p-3 border-ok/40 bg-ok/5 text-[13px] text-ok"><CheckCircle2 size={15} className="inline mr-2" />{xabar}</div>}

        <section className="karta p-3">
          <h2 className="text-[13px] font-semibold text-text flex gap-2 items-center"><AlertTriangle size={15} className={topilmaganSatrlar.length ? 'text-warn' : 'text-ok'} />
            Bog‘lanish topilmagan resurslar ({topilmaganSatrlar.length})</h2>
          <p className="text-[11px] text-text-mute mt-1">Bu qatorlar jamiga narx sifatida kirmaydi. Boshqa obyekt narxi taklif bo‘lishi mumkin, lekin avtomatik qo‘llanmaydi.</p>
          <div className="mt-2 max-h-64 overflow-auto divide-y divide-border">
            {topilmaganSatrlar.map(r => <button key={`${r.obyekt_id}|${r.nom_key}|${r.birlik_key}`} onClick={() => setTanlangan(r)}
              className="w-full py-2 text-left flex gap-3 items-center hover:bg-white/[.03] text-[12px]">
              <span className="flex-1 truncate text-text">{r.nom || '—'}</span><span className="w-16 text-text-mute">{r.birlik || '—'}</span>
              <span className="w-20 text-right text-text-dim">{r.qator_soni} qator</span>
              <span className="text-accent">Narx belgilash</span>
            </button>)}
            {!topilmaganSatrlar.length && <p className="py-4 text-center text-[12px] text-ok">Tanlangan obyekt uchun narxi topilmagan resurs yo‘q.</p>}
          </div>
        </section>

        <section className="karta p-3">
          <h2 className="text-[13px] font-semibold text-text flex gap-2 items-center"><Tags size={15} className="text-accent" />Narx registri ({markazSatrlar.length})</h2>
          <div className="mt-2 max-h-[460px] overflow-auto"><table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--surface-1)] text-text-mute"><tr className="border-b border-border text-left">
              <th className="py-2 pr-2">Resurs</th><th className="py-2 pr-2">Birlik</th><th className="py-2 pr-2">Kat.</th><th className="py-2 pr-2 text-right">Smeta max</th><th className="py-2 pr-2 text-right">Belgilangan</th><th className="py-2 pr-2 text-right">Sana max</th><th className="py-2 text-right">Natija</th>
            </tr></thead>
            <tbody>{markazSatrlar.map(r => <tr key={kalit(r.nom_key, r.birlik_key)} onClick={() => setTanlangan(r)} className="border-b border-border/60 cursor-pointer hover:bg-white/[.03]">
              <td className="py-2 pr-2 max-w-[360px] truncate text-text">{r.xavf && <ShieldAlert size={13} className="inline mr-1 text-warn" />}{r.nom || '—'}</td><td className="py-2 pr-2 text-text-mute">{r.birlik || '—'}</td><td className="py-2 pr-2 text-text-mute">{r.kat || '—'}</td><td className="py-2 pr-2 text-right tabular-nums"><FmtN val={r.smeta_max} /></td><td className="py-2 pr-2 text-right tabular-nums"><FmtN val={r.belgilangan_narx} /></td><td className="py-2 pr-2 text-right tabular-nums"><FmtN val={r.sana_max_narx} /></td><td className="py-2 text-right tabular-nums font-medium text-text"><FmtN val={r.natija} /></td>
            </tr>)}</tbody>
          </table></div>
        </section>

        {tanlangan && <section className="karta p-4 border-accent/30">
          <div className="flex justify-between gap-3"><div><h2 className="text-[14px] font-semibold text-text">{tanlangan.nom || 'Nomsiz resurs'}</h2><p className="text-[12px] text-text-mute">{tanlangan.birlik || 'Birlik ko‘rsatilmagan'} · {qulfKat || ('kat' in tanlangan ? tanlangan.kat || 'kategoriya yo‘q' : 'kategoriya yo‘q')}</p></div><button onClick={() => setTanlangan(null)} className="text-[12px] text-text-mute">Yopish</button></div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-[12px] text-text-dim">Narx<input type="number" min="0.000001" value={narxKiritma} onChange={e => setNarxKiritma(e.target.value)} className="mt-1 block w-full input" /></label>
            <label className="text-[12px] text-text-dim">Kategoriya
              {qulfKat ? <span className="mt-1 block h-9 px-3 py-2 rounded input opacity-60">{qulfKat} · birlikdan qulflangan</span> : <select value={kat} onChange={e => setKat(e.target.value)} className="mt-1 w-full input"><option value="">— o‘zgartirmaslik —</option>{ERKIN_KAT.map(x => <option key={x} value={x}>{x}</option>)}</select>}
            </label>
            <label className="text-[12px] text-text-dim">Sana narxi uchun sana<input type="date" value={sana} onChange={e => setSana(e.target.value)} className="mt-1 block w-full input" /></label>
          </div>
          {tanlanganRegistr && <p className="mt-2 text-[11px] text-text-mute">Saqlash paytida mavjud narx qayta tekshiriladi.</p>}
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void narxniSaqlash()} disabled={saqlanmoqda} className="px-3 py-2 rounded-lg bg-accent text-white text-[12px] disabled:opacity-50"><Save size={14} className="inline mr-1" />Belgilangan narxni saqlash</button><button onClick={() => void sanaNarxiniQoshish()} disabled={saqlanmoqda} className="px-3 py-2 rounded-lg bg-white/5 text-text text-[12px] disabled:opacity-50">Sana narxini qo‘shish</button></div>
        </section>}
      </div>
    </Sahifa>
  );
}
