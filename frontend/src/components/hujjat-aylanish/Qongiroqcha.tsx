/**
 * Qongiroqcha.tsx — bildirishnomalar qo'ng'irog'i (AdminShell sarlavhasida): o'qilmagan soni + ochiladigan ro'yxat.
 * Manba: t2_outbox → t2_bildirishnoma (t2_bildirishnomalar_v1), shlyuz /api/hujjat-aylanish (bolim=bildirishnomalar).
 * O'qilgan deb belgilash: t2_bildirishnoma_oqildi_v1. Sarlavha — i18n kaliti (`bildirishnoma.<mavzu>`), topilmasa mavzu matni.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { bildirishnomaOqildi, bildirishnomalarOl, type Bildirishnoma } from '../../api/t2-hujjat-aylanish';
import { t } from '../../i18n/til';

const YANGILASH_MS = 60_000;

/** Bildirishnoma bosilganda o'tadigan sahifa: aniq havola yoki mavzu bo'yicha. */
export function bildirishnomaHavolasi(b: Pick<Bildirishnoma, 'havola' | 'mavzu'>): string | null {
  if (b.havola) return b.havola;
  if (b.mavzu.startsWith('hujjat.')) return '/admin/hujjat-aylanish';
  if (b.mavzu.startsWith('tomon.')) return '/admin/murojaatlar';
  return null;
}

export function Qongiroqcha() {
  const [ochiq, setOchiq] = useState(false);
  const [qatorlar, setQatorlar] = useState<Bildirishnoma[]>([]);
  const [oqilmagan, setOqilmagan] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const yukla = useCallback(async () => {
    const r = await bildirishnomalarOl();
    if (r.ok) { setQatorlar(r.natija.qatorlar ?? []); setOqilmagan(r.natija.oqilmagan ?? 0); }
  }, []);

  useEffect(() => {
    void yukla();
    const id = window.setInterval(() => { if (!document.hidden) void yukla(); }, YANGILASH_MS);
    return () => window.clearInterval(id);
  }, [yukla]);

  useEffect(() => {
    if (!ochiq) return;
    const yop = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOchiq(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOchiq(false); };
    document.addEventListener('mousedown', yop);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', yop); document.removeEventListener('keydown', esc); };
  }, [ochiq]);

  const belgila = async (idlar: number[]) => {
    if (!idlar.length) return;
    const r = await bildirishnomaOqildi(idlar);
    if (r.ok) {
      setQatorlar((q) => q.map((x) => (idlar.includes(x.id) ? { ...x, oqildi: x.oqildi ?? new Date().toISOString() } : x)));
      setOqilmagan((n) => Math.max(0, n - idlar.length));
    }
  };
  const bos = (b: Bildirishnoma) => {
    void belgila(b.oqildi ? [] : [b.id]);
    const h = bildirishnomaHavolasi(b);
    if (h) { setOchiq(false); navigate(h); }
  };
  const sarlavha = (b: Bildirishnoma) => t(b.sarlavha_kalit.startsWith('bildirishnoma.') ? b.sarlavha_kalit : `bildirishnoma.${b.mavzu}`);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="fz-btn fz-btn--sm relative" aria-haspopup="true" aria-expanded={ochiq} aria-label={t('Bildirishnomalar')} onClick={() => { setOchiq((o) => !o); if (!ochiq) void yukla(); }}>
        <Bell size={15} />
        {oqilmagan > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 text-white" data-testid="qongiroq-soni">{oqilmagan > 99 ? '99+' : oqilmagan}</span>}
      </button>
      {ochiq && (
        <div className="absolute right-0 z-50 mt-1 w-80 max-w-[90vw] rounded-lg border border-border bg-surface p-2 shadow-lg" role="menu">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold">{t('Bildirishnomalar')}</span>
            {oqilmagan > 0 && <button type="button" className="text-xs text-accent underline" onClick={() => void belgila(qatorlar.filter((x) => !x.oqildi).map((x) => x.id))}>{t('Hammasini o‘qildi deb belgilash')}</button>}
          </div>
          {!qatorlar.length && <p className="px-1 py-2 text-xs text-text-dim">{t('Bildirishnoma yo‘q.')}</p>}
          <ul className="max-h-80 space-y-0.5 overflow-auto">
            {qatorlar.map((b) => (
              <li key={b.id}>
                <button type="button" role="menuitem" className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2 ${b.oqildi ? 'text-text-dim' : 'font-semibold text-text'}`} onClick={() => bos(b)}>
                  <span className="block">{sarlavha(b)}</span>
                  <span className="block text-[11px] font-normal text-text-dim">{new Date(b.yaratildi).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </button>
              </li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
