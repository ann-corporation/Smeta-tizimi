/**
 * NarxManbalari.tsx — narx manbalari reestri (egasi Q4/Q5, 2026-10-01): kataloglar (kvartal),
 * счет-фактуралар, tijorat takliflari (КП), mash-chas kalkulyatsiyalari, chel-chas e'lonlari.
 * Pozitsiyalar Excel'dan (ustunlarni yagona smeta anatomiyasi aniqlaydi, topilmasa operator
 * tanlaydi) yoki qo'lda. Katta katalog bo'laklab yuklanadi. Smeta narxlariga dalil bog'lash —
 * «Narx dalili» sahifasida.
 */
import { useEffect, useMemo, useState } from 'react';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { yangiOperationId } from '../../api/supabase';
import {
  NARX_MANBA_TUR_NOMI, narxManbaniYukla, sbNarxManbaBekor, sbNarxManbalarOl,
  type NarxManba, type NarxManbaMalumot, type NarxManbaQatorKirish, type NarxManbaTur,
} from '../../api/t2-narx-dalil';
import type { XlsxWorkbook } from '../../lib/f2-import-parse';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { katalogniOqi, type KatalogUstunlar } from '../../lib/narx-dalil/katalog-oqish';
import { toast } from '../../umumiy/ui/Toast';

const inp = 'w-full border rounded px-2 py-1 text-sm bg-transparent';
const harf = (i: number) => (i < 0 ? '—' : String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''));

export default function NarxManbalari() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [royxat, setRoyxat] = useState<NarxManba[]>([]);
  const [forma, setForma] = useState<NarxManbaMalumot | null>(null);
  const [kitob, setKitob] = useState<XlsxWorkbook | null>(null);
  const [varaq, setVaraq] = useState('');
  const [qolda, setQolda] = useState<KatalogUstunlar | null>(null);
  const [qoldaQatorlar, setQoldaQatorlar] = useState<NarxManbaQatorKirish[]>([]);
  const [jarayon, setJarayon] = useState<string | null>(null);

  const yukla = () => { if (kompaniyaId) void sbNarxManbalarOl(kompaniyaId).then((r) => setRoyxat(r.ok ? r.qatorlar ?? [] : [])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(yukla, [kompaniyaId]);

  const rows = useMemo(() => (kitob && varaq ? kitob.sheet(varaq)?.rows ?? [] : []), [kitob, varaq]);
  const oqish = useMemo(() => (rows.length ? katalogniOqi(varaq, rows, qolda) : null), [rows, varaq, qolda]);
  const pozitsiyalar = kitob ? oqish?.qatorlar ?? [] : qoldaQatorlar.filter((q) => q.nom.trim());
  const ustunSoni = useMemo(() => rows.slice(0, 50).reduce((m, r) => Math.max(m, r.length), 0), [rows]);

  const faylTanla = async (f: File | undefined) => {
    if (!f) return;
    try {
      const wb = await readXlsxFonda(await f.arrayBuffer());
      setKitob(wb); setVaraq(wb.sheets[0]?.name ?? ''); setQolda(null);
      setForma((x) => ({ ...(x ?? { tur: 'katalog' }), nom: x?.nom || f.name.replace(/\.[^.]+$/, '') }));
    } catch (e) {
      toast('Fayl o‘qilmadi: ' + (e instanceof Error ? e.message : String(e)), 'danger');
    }
  };

  const saqla = async () => {
    if (!kompaniyaId || !forma) return;
    if (!forma.nom?.trim() || !forma.tur) { toast('Manba turi va nomi majburiy', 'warn'); return; }
    if (!pozitsiyalar.length) { toast('Pozitsiyalar yo‘q — Excel yuklang yoki qo‘lda kiriting', 'warn'); return; }
    setJarayon('Yuklanmoqda…');
    const r = await narxManbaniYukla(kompaniyaId, forma, pozitsiyalar, yangiOperationId(), 5000,
      (y, j) => setJarayon(`Yuklanmoqda: ${y.toLocaleString('ru-RU')} / ${j.toLocaleString('ru-RU')}`));
    setJarayon(null);
    if (!r.ok) { toast(r.error || 'Saqlanmadi', 'danger'); return; }
    toast(`✓ Manba saqlandi: ${pozitsiyalar.length.toLocaleString('ru-RU')} pozitsiya`, 'ok');
    setForma(null); setKitob(null); setVaraq(''); setQolda(null); setQoldaQatorlar([]);
    yukla();
  };

  const bekor = async (m: NarxManba) => {
    if (!kompaniyaId || !window.confirm(`«${m.nom}» bekor qilinsinmi? (smeta dalili sifatida ishlatilsa — rad etiladi)`)) return;
    const r = await sbNarxManbaBekor(kompaniyaId, m.id, m.versiya);
    if (r.ok) { toast('Bekor qilindi', 'ok'); yukla(); } else toast(r.error || 'Xato', 'danger');
  };

  const f = (k: keyof NarxManbaMalumot) => (e: { target: { value: string } }) =>
    setForma((x) => ({ ...(x ?? {}), [k]: k === 'yil' || k === 'kvartal' ? (e.target.value ? Number(e.target.value) : null) : e.target.value }));

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Narx manbalari</h1>
          <p className="text-xs text-text-dim">Kataloglar, счет-фактуралар, КП va kalkulyatsiyalar — smeta narxlarining dalili (НАПУ himoyasi).</p>
        </div>
        {!forma && <button type="button" onClick={() => setForma({ tur: 'katalog', nds_holati: 'nomalum' })} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"><Plus size={14} /> Yangi manba</button>}
      </div>

      {forma && (
        <div className="rounded-lg border bg-surface p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <label>Turi<select className={inp} value={forma.tur ?? 'katalog'} onChange={(e) => setForma((x) => ({ ...(x ?? {}), tur: e.target.value as NarxManbaTur }))}>
              {Object.entries(NARX_MANBA_TUR_NOMI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="md:col-span-3">Nomi *<input className={inp} value={forma.nom ?? ''} onChange={f('nom')} placeholder="Каталог текущих цен, 3 кв. 2026" /></label>
            <label>Raqam<input className={inp} value={forma.raqam ?? ''} onChange={f('raqam')} /></label>
            <label>Sana<input type="date" className={inp} value={forma.sana ?? ''} onChange={f('sana')} /></label>
            <label>Yil<input className={inp} inputMode="numeric" value={forma.yil ?? ''} onChange={f('yil')} /></label>
            <label>Kvartal<select className={inp} value={forma.kvartal ?? ''} onChange={f('kvartal')}><option value="">—</option>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label className="md:col-span-2">Yetkazuvchi / nashr etuvchi<input className={inp} value={forma.yetkazuvchi ?? ''} onChange={f('yetkazuvchi')} /></label>
            <label>INN<input className={inp} value={forma.yetkazuvchi_inn ?? ''} onChange={f('yetkazuvchi_inn')} /></label>
            <label>Region<input className={inp} value={forma.region ?? ''} onChange={f('region')} /></label>
            <label>НДС<select className={inp} value={forma.nds_holati ?? 'nomalum'} onChange={(e) => setForma((x) => ({ ...(x ?? {}), nds_holati: e.target.value as NarxManba['nds_holati'] }))}>
              <option value="nomalum">noma’lum</option><option value="nds_siz">без НДС</option><option value="nds_bilan">с НДС</option></select></label>
            <label className="md:col-span-3">Izoh<input className={inp} value={forma.izoh ?? ''} onChange={f('izoh')} /></label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border px-3 py-1.5"><FileUp size={14} /> Excel’dan pozitsiyalar
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void faylTanla(e.target.files?.[0])} /></label>
            {kitob && <select className="border rounded px-2 py-1" value={varaq} onChange={(e) => { setVaraq(e.target.value); setQolda(null); }}>{kitob.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>}
            {!kitob && <button type="button" className="rounded border px-3 py-1.5" onClick={() => setQoldaQatorlar((q) => [...q, { kod: '', nom: '', birlik: '', narx: null }])}>+ qo‘lda pozitsiya</button>}
            {oqish && <span className="text-xs text-text-dim">Ustunlar: {oqish.manba === 'anatomiya' ? 'anatomiya aniqladi' : oqish.manba === 'operator' ? 'operator tanladi' : 'topilmadi — qo‘lda tanlang'} · pozitsiya: {oqish.qatorlar.length.toLocaleString('ru-RU')} · narxsiz: {oqish.narxsiz}</span>}
          </div>

          {kitob && ustunSoni > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {(['kod', 'nom', 'birlik', 'narx'] as const).map((k) => (
                <label key={k}>{k}: <select className="border rounded px-1 py-0.5" value={(qolda ?? oqish?.ustunlar)?.[k] ?? -1}
                  onChange={(e) => setQolda({ ...(qolda ?? oqish?.ustunlar ?? { kod: -1, nom: -1, birlik: -1, narx: -1, boshQator: 0 }), [k]: Number(e.target.value) })}>
                  <option value={-1}>—</option>{Array.from({ length: ustunSoni }, (_, i) => <option key={i} value={i}>{harf(i)}</option>)}</select></label>
              ))}
              <label>1-qator: <input className="w-16 border rounded px-1 py-0.5" type="number" min={1} value={((qolda ?? oqish?.ustunlar)?.boshQator ?? 0) + 1}
                onChange={(e) => setQolda({ ...(qolda ?? oqish?.ustunlar ?? { kod: -1, nom: -1, birlik: -1, narx: -1, boshQator: 0 }), boshQator: Math.max(0, Number(e.target.value) - 1) })} /></label>
            </div>
          )}

          {!kitob && qoldaQatorlar.length > 0 && (
            <div className="space-y-1">
              {qoldaQatorlar.map((q, i) => {
                const set = (p: Partial<NarxManbaQatorKirish>) => setQoldaQatorlar((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="grid grid-cols-[1fr_3fr_1fr_1fr_auto] gap-1">
                    <input className={inp} placeholder="Kod" value={q.kod ?? ''} onChange={(e) => set({ kod: e.target.value })} />
                    <input className={inp} placeholder="Nomi *" value={q.nom} onChange={(e) => set({ nom: e.target.value })} />
                    <input className={inp} placeholder="Birlik" value={q.birlik ?? ''} onChange={(e) => set({ birlik: e.target.value })} />
                    <input className={inp} placeholder="Narx" inputMode="decimal" value={q.narx ?? ''} onChange={(e) => set({ narx: e.target.value === '' ? null : Number(e.target.value.replace(/\s/g, '').replace(',', '.')) })} />
                    <button type="button" onClick={() => setQoldaQatorlar((a) => a.filter((_, j) => j !== i))} className="text-text-dim hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {pozitsiyalar.length > 0 && (
            <div className="max-h-56 overflow-auto rounded border text-xs">
              <table className="w-full"><tbody>
                {pozitsiyalar.slice(0, 50).map((q, i) => <tr key={i} className="border-t"><td className="px-2 py-0.5 text-text-dim">{q.kod}</td><td className="px-2 py-0.5">{q.nom}</td><td className="px-2 py-0.5">{q.birlik}</td><td className="px-2 py-0.5 text-right tabular-nums">{q.narx == null ? <span className="text-warning">narxsiz</span> : q.narx.toLocaleString('ru-RU')}</td></tr>)}
              </tbody></table>
              {pozitsiyalar.length > 50 && <div className="px-2 py-1 text-text-dim">… yana {(pozitsiyalar.length - 50).toLocaleString('ru-RU')} ta</div>}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {jarayon && <span className="text-xs text-text-dim">{jarayon}</span>}
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => { setForma(null); setKitob(null); setQoldaQatorlar([]); }}>Bekor</button>
            <button type="button" disabled={!!jarayon} className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => void saqla()}>Saqlash</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-text-dim"><tr className="text-left"><th className="px-3 py-2">Turi</th><th className="px-3 py-2">Nomi</th><th className="px-3 py-2">Rekvizit</th><th className="px-3 py-2 text-right">Pozitsiya</th><th className="px-3 py-2 text-right">Dalil</th><th /></tr></thead>
          <tbody>
            {royxat.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-text-dim">Manba yo‘q</td></tr>}
            {royxat.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2 text-xs">{NARX_MANBA_TUR_NOMI[m.tur]}</td>
                <td className="px-3 py-2">{m.nom}</td>
                <td className="px-3 py-2 text-xs text-text-dim">{[m.raqam && `№ ${m.raqam}`, m.sana, m.kvartal && m.yil ? `${m.kvartal} кв. ${m.yil}` : m.yil, m.region, m.yetkazuvchi].filter(Boolean).join(' · ')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(m.qator_soni).toLocaleString('ru-RU')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(m.dalil_soni).toLocaleString('ru-RU')}</td>
                <td className="px-3 py-2 text-right"><button type="button" onClick={() => void bekor(m)} className="text-text-dim hover:text-danger" title="Bekor qilish"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
