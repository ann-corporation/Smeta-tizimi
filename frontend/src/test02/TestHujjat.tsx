import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sbHujjatlarOl, sbHujjatYoz, sbHujjatOchir, uploadFayl, driveNusxaYubor, type ObyektHujjat } from '../api/t2-hujjat';
import { sbT2ObyektlarOlKomp } from '../api/supabase';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { FileText, Upload, Trash2, FolderOpen } from 'lucide-react';

/* ⚠️ 2026-08-27 (Claude): avval bu sahifa "Cloudflare R2 Chizmalar
 * Arxivi" nomi bilan obyektga UMUMAN bog'lanmagan, ro'yxatsiz
 * bitta-fayl-yuklovchi edi (foydalanuvchi shikoyati: "arxiv r2 degan
 * tabingni nomini o'zi noto'g'ri, bu har bir obyekt tabida bo'lishi
 * kerak va unga tasdiqlangan loyiha va hujjatlar yuklab borilishi
 * kerak"). Endi: obyekt tanlanadi (yoki mindmap/obyekt sahifasidan
 * ?obyektId= bilan ochiladi), fayl haqiqiy R2 ga yuklanadi va
 * t2_obyekt_hujjat ga (turi: loyiha|hujjat) yozib boriladi — ro'yxat,
 * o'chirish bilan birga. */
export default function TestHujjat() {
  const { joriy } = useKompaniya();
  const [params] = useSearchParams();
  const obyektIdParam = params.get('obyektId');

  const [obyektlar, setObyektlar] = useState<any[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(obyektIdParam ? Number(obyektIdParam) : null);
  const [data, setData] = useState<ObyektHujjat[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  const [fayl, setFayl] = useState<File | null>(null);
  const [turi, setTuri] = useState<'loyiha' | 'hujjat'>('hujjat');
  const [izoh, setIzoh] = useState('');
  const [yozilmoqda, setYozilmoqda] = useState(false);

  useEffect(() => {
    if (!joriy?.id) return;
    sbT2ObyektlarOlKomp(joriy.id).then((r: any) => setObyektlar(r?.qatorlar || r || []));
  }, [joriy]);

  const yukla = () => {
    if (!obyektId) { setData([]); return; }
    setYuklanmoqda(true);
    setXato('');
    sbHujjatlarOl(obyektId).then((r) => {
      setYuklanmoqda(false);
      if (r.ok) setData(r.qatorlar || []);
      else setXato(r.error || 'O\'qilmadi');
    });
  };

  useEffect(() => { yukla(); }, [obyektId]);

  const yuklashVaSaqlash = async () => {
    if (!obyektId || !joriy?.id) { toast('Avval obyekt tanlang', 'danger'); return; }
    if (!fayl) { toast('Fayl tanlanmagan', 'danger'); return; }
    const obyektNomi = obyektlar.find((o: any) => o.id === obyektId)?.nom;
    setYozilmoqda(true);
    try {
      /* 1) R2 — asosiy nusxa, tartibli manzilda: kompaniya/obyekt/turi/asl_nom */
      const yuk = await uploadFayl(fayl, { kompaniyaId: joriy.id, obyektId, turi });
      if (!yuk.ok || !yuk.url) { toast('Fayl yuklanmadi: ' + (yuk.error || ''), 'danger'); setYozilmoqda(false); return; }

      const r = await sbHujjatYoz({ obyektId, turi, nom: fayl.name, url: yuk.url, izoh: izoh || undefined });
      if (!r.ok) { toast('Saqlanmadi: ' + (r.error || ''), 'danger'); setYozilmoqda(false); return; }

      /* 2) Drive — DUAL-STORAGE qo'shimcha nusxasi (best-effort, R2 yozuvini
         bloklamaydi — obyekt nomi Drive papkasida topilmasa ham hujjat R2/DB
         da saqlangan bo'ladi, foydalanuvchiga faqat ogohlantirish ko'rinadi). */
      if (obyektNomi) {
        driveNusxaYubor(fayl, obyektNomi, turi).then((d) => {
          if (!d.ok) toast('R2 ga saqlandi, lekin Drive nusxasi ketmadi: ' + (d.error || ''), 'danger');
        });
      }

      toast('Hujjat saqlandi', 'ok');
      setFayl(null); setIzoh('');
      yukla();
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message || String(e)), 'danger');
    }
    setYozilmoqda(false);
  };

  const ochirish = async (h: ObyektHujjat) => {
    if (!confirm('"' + h.nom + '" hujjatini o\'chirasizmi?')) return;
    const r = await sbHujjatOchir(h.id);
    if (r.ok) { toast('O\'chirildi', 'ok'); yukla(); }
    else toast('O\'chirilmadi: ' + (r.error || ''), 'danger');
  };

  return (
    <div className="p-6 bg-[var(--surface)] text-[var(--text)] min-h-screen">
      <div className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-bold text-[var(--accent-text)] flex items-center gap-2">
          <FolderOpen /> Obyekt hujjatlari
        </h1>
        <p className="text-sm text-[var(--text-dim)] mt-1">
          Tasdiqlangan loyiha chizmalari va boshqa hujjatlar — har biri aniq obyektga bog'lanadi.
        </p>
      </div>

      <div className="mb-4 max-w-md">
        <label className="block text-sm text-[var(--text-dim)] mb-1">Obyekt</label>
        <select
          value={obyektId ?? ''}
          onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded"
        >
          <option value="">— tanlang —</option>
          {obyektlar.map((o: any) => (
            <option key={o.id} value={o.id}>{o.nom}</option>
          ))}
        </select>
      </div>

      {!obyektId ? (
        <div className="p-8 text-center text-[var(--text-mute)] font-medium border border-[var(--border)] rounded-lg">
          Hujjatlarni ko'rish/yuklash uchun avval obyekt tanlang.
        </div>
      ) : (
        <>
          <div className="border border-[var(--border)] p-4 bg-[var(--bg)] rounded-lg mb-6 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-[var(--text-mute)] mb-1">Fayl</label>
              <input type="file" onChange={(e) => setFayl(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-mute)] mb-1">Turi</label>
              <select value={turi} onChange={(e) => setTuri(e.target.value as any)} className="bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded text-sm">
                <option value="hujjat">Boshqa hujjat</option>
                <option value="loyiha">Loyiha chizmasi (tasdiqlangan)</option>
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-[var(--text-mute)] mb-1">Izoh</label>
              <input value={izoh} onChange={(e) => setIzoh(e.target.value)} className="w-full bg-[var(--surface-2)] border border-[var(--border)] p-2 rounded text-sm" placeholder="ixtiyoriy" />
            </div>
            <button onClick={yuklashVaSaqlash} disabled={yozilmoqda || !fayl}
              className="bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 px-4 py-2 rounded flex items-center gap-2 text-sm">
              <Upload size={16} /> {yozilmoqda ? 'Yuklanmoqda...' : 'Yuklash'}
            </button>
          </div>

          {xato && <div className="mb-4 p-3 bg-[var(--danger-soft)] border border-[var(--danger)] text-[var(--danger)] rounded-lg text-sm">{xato}</div>}

          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            {yuklanmoqda ? (
              <div className="p-8 text-center text-[var(--text-mute)] animate-pulse">Yuklanmoqda...</div>
            ) : data.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-mute)] font-medium">Bu obyektda hali hujjat yo'q.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--surface-2)] text-[var(--text-dim)]">
                  <tr>
                    <th className="p-3">Nomi</th>
                    <th className="p-3">Turi</th>
                    <th className="p-3">Izoh</th>
                    <th className="p-3">Kim / Qachon</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((h) => (
                    <tr key={h.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-3)]">
                      <td className="p-3">
                        <a href={h.url} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] hover:underline flex items-center gap-2">
                          <FileText size={14} /> {h.nom}
                        </a>
                      </td>
                      <td className="p-3">
                        <span className={'px-2 py-0.5 rounded text-xs ' + (h.turi === 'loyiha' ? 'bg-[var(--ok-soft)] text-[var(--ok)]' : 'bg-[var(--surface-2)] text-[var(--text-dim)]')}>
                          {h.turi === 'loyiha' ? 'Loyiha chizmasi' : 'Hujjat'}
                        </span>
                      </td>
                      <td className="p-3 text-[var(--text-dim)]">{h.izoh || '-'}</td>
                      <td className="p-3 text-[var(--text-mute)] text-xs">{h.kim || '-'} · {(h.yaratildi || '').substring(0, 10)}</td>
                      <td className="p-3">
                        <button onClick={() => ochirish(h)} className="text-[var(--danger)] hover:text-[var(--danger)]">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
