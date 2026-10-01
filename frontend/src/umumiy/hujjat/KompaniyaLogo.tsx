/**
 * KompaniyaLogo.tsx — kompaniya logosi: ko'rsatish (sidebar burchagi,
 * hujjatlar) va yuklash (Kompaniya → Profil). Logo `t2_kompaniya_logo`
 * jadvalida base64 sifatida saqlanadi (PNG/JPEG, ≤ 300 KB); yozish faqat
 * boss/admin (server `kompaniya_logo_saqla` darvozasi).
 */
import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { sbKompaniyaLogoSaqla } from '../../api/t2-ijro';
import { kalit, useKompaniyaLogo } from './useKompaniyaLogo';

const MAX_BAYT = 300 * 1024;

/** Logo rasmi; logo bo'lmasa `zaxira` ko'rsatiladi. */
export function KompaniyaLogoRasm({ kompaniyaId, className, zaxira }: { kompaniyaId: number | null | undefined; className?: string; zaxira?: ReactNode }) {
  const q = useKompaniyaLogo(kompaniyaId);
  if (!q.data) return <>{zaxira ?? null}</>;
  return <img src={`data:${q.data.mime};base64,${q.data.data_b64}`} alt="Kompaniya logosi" className={className} />;
}

function base64ga(fayl: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(fayl);
  });
}

/** Profil sahifasidagi logo bo'limi. `isDirector` bo'lmasa faqat ko'rish. */
export function KompaniyaLogoYuklash({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const qc = useQueryClient();
  const q = useKompaniyaLogo(kompaniyaId);
  const input = useRef<HTMLInputElement>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const saqla = async (mime: 'image/png' | 'image/jpeg' | null, data: string | null) => {
    setBand(true); setXato(null);
    const r = await sbKompaniyaLogoSaqla(kompaniyaId, mime, data);
    setBand(false);
    if (!r.ok) { setXato(r.error || r.sabab || 'Saqlab bo‘lmadi'); return; }
    await qc.invalidateQueries({ queryKey: kalit(kompaniyaId) });
  };

  const tanla = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'image/png' && f.type !== 'image/jpeg') { setXato('Faqat PNG yoki JPEG.'); return; }
    if (f.size > MAX_BAYT) { setXato(`Fayl ${Math.round(f.size / 1024)} KB — ruxsat ≤ 300 KB.`); return; }
    await saqla(f.type, await base64ga(f));
  };

  return (
    <div className="karta p-4 max-w-2xl mt-4">
      <div className="text-[13px] font-semibold text-text mb-3">Kompaniya logosi</div>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg border border-border bg-surface-2 flex items-center justify-center overflow-hidden shrink-0">
          {q.isLoading ? <Loader2 className="animate-spin text-text-dim" size={16} />
            : <KompaniyaLogoRasm kompaniyaId={kompaniyaId} className="max-w-full max-h-full object-contain" zaxira={<span className="text-[11px] text-text-mute">logo yo‘q</span>} />}
        </div>
        <div className="space-y-2 text-[12px]">
          <p className="text-text-dim">АОСР, F2 va boshqa hujjatlarda ishlatiladi. PNG/JPEG, ≤ 300 KB.</p>
          {isDirector ? (
            <div className="flex items-center gap-2">
              <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={tanla} />
              <button type="button" className="tugma-asosiy" disabled={band} onClick={() => input.current?.click()}>
                {band ? <Loader2 className="animate-spin" size={14} /> : <><ImagePlus size={14} className="inline mr-1" /> {q.data ? 'Almashtirish' : 'Yuklash'}</>}
              </button>
              {q.data && (
                <button type="button" className="text-rose-300 hover:text-rose-200 flex items-center gap-1" disabled={band}
                  onClick={() => { if (confirm('Logo olib tashlansinmi?')) void saqla(null, null); }}>
                  <Trash2 size={12} /> olib tashlash
                </button>
              )}
            </div>
          ) : <p className="text-amber-200">Logoni faqat direktor (boss/admin) o‘zgartiradi.</p>}
          {xato && <p className="text-rose-300">{xato}</p>}
        </div>
      </div>
    </div>
  );
}
