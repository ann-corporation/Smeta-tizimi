import { MoneyInput } from '../umumiy/ui/MoneyInput';
/**
 * TestNarxlar.tsx — TIZIM_02: NARX BAZASI VA NARXLANMAGANLAR
 * ═══════════════════════════════════════════════════════════════════
 *
 * Foydalanuvchi: «qayerdan narxlarni tekshiraman, qayerdan bog'lanishlarni
 * tekshiraman?»
 *
 * Ikki savol — ikki ro'yxat:
 *
 *   1) NARX BAZASI (`t2_narx`) — svodkadan yig'ilgan narxlar. Bu yerda
 *      «shubhali» belgisi ham bor: svodkada narx × hajm ≠ summa bo'lsa
 *      qator shubhali deb belgilanadi (svodkaning o'zida xato bo'lishi
 *      mumkin).
 *
 *   2) NARXLANMAGANLAR (`t2_qator` dan `narx is null`) — bog'lanish
 *      TOPILMAGAN resurslar. Bu eng muhim ro'yxat: har bir shunday qator
 *      jamiga KIRMAYDI, ya'ni obyekt summasi to'liq emas.
 *
 * ⚠️ NARX O'ZIDAN TO'QILMAYDI. Topilmagan narx bo'sh qoladi va shu
 * yerda ochiq ko'rsatiladi. Uni «taxminan» to'ldirish — soxta hujjat
 * yasash demak.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sbT2NarxBelgila } from '../api/t2-narx';
import { Tags, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { FmtN } from '../lib/format';
import { sbOqi, sbT2ObyektlarOlKomp, type T2Obyekt } from '../api/supabase';
import { useKompaniya } from './KompaniyaTanlov';

type T2Narx = {
  id: number; obyekt_id: number | null;
  nom: string | null; birlik: string | null;
  narx: number | null; kat: string | null;
  manba: string | null; shubhali: boolean | null; belgilangan: boolean | null;
};

type Narxsiz = {
  id: number; nom: string | null; birlik: string | null;
  hajm: number | null; tur: string | null; kat: string | null;
};

export default function TestNarxlar() {
  const { joriy, yuklanmoqda: kompYuk } = useKompaniya();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);

  const [narxlar, setNarxlar] = useState<T2Narx[] | null>(null);
  const [narxsizlar, setNarxsizlar] = useState<Narxsiz[] | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [yuk, setYuk] = useState(false);
  const [narxQoyish, setNarxQoyish] = useState<number | null>(null);
  const [yangiNarx, setYangiNarx] = useState('');
  const [xato, setXato] = useState('');

  useEffect(() => {
    if (kompYuk) return;
    if (!joriy?.id) { setObyektlar([]); setObyektId(null); return; }
    sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      if (!r.ok) return;
      const o = (r.qatorlar as T2Obyekt[]) || [];
      setObyektlar(o);
      setObyektId((oldingi) => oldingi ?? (o[0]?.id ?? null));
    });
  }, [joriy?.id, kompYuk]);

  const yukla = useCallback(async () => {
    if (!obyektId) return;
    setYuk(true); setXato('');

    const [n, ns] = await Promise.all([
      sbOqi<T2Narx>({
        jadval: 't2_narx',
        filtr: 'obyekt_id=eq.' + obyektId,
        tartib: 'nom.asc', limit: 20000,
      }),
      sbOqi<Narxsiz>({
        jadval: 't2_qator',
        /* Faqat resurs turlari — razdel/ish narxlanmaydi, ular jamlanma */
        filtr: 'obyekt_id=eq.' + obyektId + '&narx=is.null&tur=in.(rs,mat,ob)',
        ustunlar: 'id,nom,birlik,hajm,tur,kat',
        tartib: 'nom.asc', limit: 20000,
      }),
    ]);

    setYuk(false);
    if (!n.ok) { setXato(n.error || 'Narxlar o\'qilmadi'); return; }
    setNarxlar((n.qatorlar as T2Narx[]) || []);
    setNarxsizlar(ns.ok ? ((ns.qatorlar as Narxsiz[]) || []) : []);
  }, [obyektId]);

  useEffect(() => { yukla(); }, [yukla]);

  const suz = <T extends { nom: string | null }>(r: T[] | null) => {
    const s = qidiruv.trim().toLowerCase();
    if (!s) return r || [];
    return (r || []).filter((x) => String(x.nom || '').toLowerCase().includes(s));
  };

  const belgilash = async (r: Narxsiz) => {
    if(!yangiNarx) return setNarxQoyish(null);
    setYuk(true);
    await sbT2NarxBelgila({ nom: r.nom || '', birlik: r.birlik || '', narx: Number(yangiNarx), kat: r.kat || undefined });
    setNarxQoyish(null); setYangiNarx(''); yukla();
  };
  const shubhaliSoni = useMemo(
    () => (narxlar || []).filter((x) => x.shubhali).length, [narxlar]);

  return (
    <Sahifa
      sarlavha="Narxlar (Tizim_02)"
      tavsif="Narx bazasi va bog'lanish topilmagan resurslar"
      amallar={
        <button onClick={yukla} disabled={yuk || !obyektId}
          className="h-9 px-3 inline-flex items-center gap-2 rounded-[10px] karta text-sm
                     text-text hover:border-[var(--accent)]/50 transition-colors
                     disabled:opacity-50">
          <RefreshCw size={15} className={yuk ? 'animate-spin' : ''} /> Yangilash
        </button>
      }
    >
      <div className="space-y-3">
        <div className="karta p-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="text-[12px] font-medium text-text block mb-1.5">Obyekt</label>
            <select value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}
              className="w-full bg-[var(--surface-2)] border border-border rounded-lg
                         px-3 py-2 text-[13px] text-text outline-none focus:border-accent/50">
              {!obyektlar.length && <option value="">— obyekt yo'q —</option>}
              {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="text-[12px] font-medium text-text block mb-1.5">Qidiruv</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)}
                placeholder="resurs nomi…"
                className="w-full bg-[var(--surface-2)] border border-border rounded-lg
                           pl-7 pr-3 py-2 text-[13px] text-text outline-none focus:border-accent/50" />
            </div>
          </div>
        </div>

        {xato && (
          <div className="karta p-4 border-danger/40 bg-danger/5">
            <p className="text-[13px] text-danger flex items-center gap-2">
              <AlertTriangle size={15} /> {xato}
            </p>
          </div>
        )}

        {/* ── NARXLANMAGANLAR — eng muhim ro'yxat, tepada ── */}
        <div className="karta p-3">
          <p className="text-[12px] font-medium text-text mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className={narxsizlar?.length ? 'text-warn' : 'text-ok'} />
            Bog'lanish topilmagan resurslar
            <span className={narxsizlar?.length ? 'text-warn' : 'text-ok'}>
              ({narxsizlar?.length ?? 0})
            </span>
          </p>
          {!narxsizlar?.length ? (
            <p className="text-[12px] text-ok">
              Hammasi narxlangan — obyekt jamiga ishonish mumkin.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-warn mb-2">
                Bu qatorlar jamiga KIRMAYDI — obyekt summasi to'liq emas.
                Narx svodkada topilmagan yoki nom/birlik mos kelmagan.
              </p>
              <div className="max-h-64 overflow-auto space-y-0.5">
                {suz(narxsizlar).slice(0, 300).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-[11px] py-1
                                             border-b border-border last:border-0">
                    <span className="flex-1 text-text truncate">{r.nom || '—'}</span>
                    <span className="text-text-mute w-20 truncate">{r.birlik || ''}</span>
                    <span className="text-text-dim w-16 text-right tabular-nums">
                      {r.hajm ?? ''}
                    </span>
                    <span className="text-text-mute w-12">{r.tur}</span>
                    {narxQoyish === r.id ? (
                      <div className="flex items-center gap-1">
                        <MoneyInput  autoFocus value={yangiNarx} onValueChange={(moneyValue) => setYangiNarx(moneyValue)} className="w-20 px-1 py-0.5 bg-black border border-zinc-700 text-white rounded outline-none" />
                        <button onClick={() => belgilash(r)} className="text-accent font-bold px-2 py-0.5 bg-accent/20 rounded">OK</button>
                      </div>
                    ) : (
                      <button onClick={() => { setNarxQoyish(r.id); setYangiNarx(''); }} className="text-accent hover:underline">+Narx</button>
                    )}
                  </div>
                ))}
                {suz(narxsizlar).length > 300 && (
                  <p className="text-[10px] text-text-mute pt-1">
                    … va yana {suz(narxsizlar).length - 300} ta
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── NARX BAZASI ── */}
        <div className="karta p-3">
          <p className="text-[12px] font-medium text-text mb-2 flex items-center gap-2">
            <Tags size={14} className="text-accent" />
            Narx bazasi ({narxlar?.length ?? 0})
            {shubhaliSoni > 0 && (
              <span className="text-warn">· {shubhaliSoni} shubhali</span>
            )}
          </p>
          {shubhaliSoni > 0 && (
            <p className="text-[11px] text-warn mb-2">
              «Shubhali» — svodkada narx × hajm ≠ summa. Svodkaning o'zida
              xato bo'lishi mumkin, tekshirib ko'ring.
            </p>
          )}
          {yuk && !narxlar && <div className="skel h-24 rounded" />}
          {!!narxlar?.length && (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[var(--surface-1)]">
                  <tr className="border-b border-border text-text-dim">
                    <th className="text-left py-1.5 font-medium">Resurs</th>
                    <th className="text-left py-1.5 font-medium w-20">Birlik</th>
                    <th className="text-right py-1.5 font-medium w-28">Narx</th>
                    <th className="text-left py-1.5 font-medium w-16">Kat</th>
                    <th className="text-left py-1.5 font-medium w-20">Manba</th>
                  </tr>
                </thead>
                <tbody>
                  {suz(narxlar).slice(0, 500).map((n) => (
                    <tr key={n.id} className={`border-b border-border last:border-0 ${
                      n.shubhali ? 'bg-warn/5' : ''}`}>
                      <td className="py-1 text-text truncate max-w-[280px]">{n.nom}</td>
                      <td className="py-1 text-text-mute">{n.birlik}</td>
                      <td className="py-1 text-right tabular-nums text-text">
                        <FmtN val={Number(n.narx) || 0} />
                      </td>
                      <td className="py-1 text-text-mute">{n.kat || ''}</td>
                      <td className="py-1 text-text-mute">
                        {n.manba}{n.shubhali ? ' ⚠️' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suz(narxlar).length > 500 && (
                <p className="text-[10px] text-text-mute pt-1">
                  … va yana {suz(narxlar).length - 500} ta
                </p>
              )}
            </div>
          )}
          {narxlar && !narxlar.length && (
            <p className="text-[12px] text-text-mute italic">
              Narx bazasi bo'sh — svodka import qilinganmi?
            </p>
          )}
        </div>
      </div>
    </Sahifa>
  );
}

