/**
 * FotoDalil — YAGONA qayta ishlatiladigan foto-dalil komponenti (ekotizim V3, P2).
 * Texnadzor, usta, loyihachi, АОСР, fakt, predpisaniya — hammasi shu komponentni ulaydi:
 *
 *   <FotoDalil kompaniyaId={k} obyektId={o} manba={{ turi: 'aosr', id: aktId }} nomzodlar={[...]} />
 *
 * - manba berilsa: faqat shu manbaga (qator/fakt/aosr/predpisaniya/...) bog'langan fotolar ko'rinadi va yuklanadi;
 *   berilmasa: butun obyekt fotolari, yuklash 'umumiy' (manbasiz) bo'ladi.
 * - Yuklash: brauzerda <=1600 px -> kanonik hujjat yo'li (R2) -> bog'lash. Bazada faqat kalit/sha/meta.
 * - AI (ixtiyoriy, token yechadi): qisqa izoh + qaysi ishga tegishli TAKLIFI. Foydalanuvchi «Qabul qilish» bosmaguncha hech narsa o'zgarmaydi.
 * Tomon kabineti (boshqa kompaniya) uchun xuddi shu komponent chaqiriladi — nusxa emas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Sparkles, Trash2, X } from 'lucide-react';
import { fotoAiTavsif, fotoOchir, fotoRoyxatOl, fotoYangila, fotoYukla, rasmKichraytir } from '../../api/t2-foto-dalil';
import { fotoIzohi, fotoUrl, manbaNomi, type FotoElement, type FotoTaklif } from '../../lib/foto-dalil';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

export type FotoNomzod = { tur: string; id: number; nom: string };
export type FotoDalilProps = {
  kompaniyaId: number;
  obyektId: number;
  loyihaId?: number | null;
  /** Manba: qator/fakt/aosr/predpisaniya/... Berilmasa butun obyekt. */
  manba?: { turi: string; id: number | null };
  /** AI taklif qilishi mumkin bo'lgan ishlar (ko'pi bilan 40 ta ishlatiladi). Bo'sh bo'lsa AI faqat izoh yozadi. */
  nomzodlar?: readonly FotoNomzod[];
  /** Yozish (yuklash/olib tashlash) tugmalari; sukut: true. Faqat ko'rish rejimi uchun false. */
  yozish?: boolean;
  /** AI tugmasi; sukut: true. */
  ai?: boolean;
  /** Joylashuvni (geotag) so'rash tugmasi; sukut: true. */
  joylashuv?: boolean;
  /** Ixcham ko'rinish (kichik tasvirlar, katta sarlavhasiz). */
  ixcham?: boolean;
  onChange?: (soni: number) => void;
};

function joyOl(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 4000, maximumAge: 60000 });
  });
}

export function FotoDalil({ kompaniyaId, obyektId, loyihaId, manba, nomzodlar = [], yozish = true, ai = true, joylashuv = true, ixcham = false, onChange }: FotoDalilProps) {
  const [fotolar, setFotolar] = useState<FotoElement[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [band, setBand] = useState<number | null>(null);
  const [katta, setKatta] = useState<FotoElement | null>(null);
  const [joyBelgisi, setJoyBelgisi] = useState(false);
  const [taklif, setTaklif] = useState<Record<number, { izoh: string; taklif: FotoTaklif | null }>>({});
  const input = useRef<HTMLInputElement>(null);
  const manbaTuri = manba?.turi ?? null; const manbaId = manba?.id ?? null;

  const yangila = useCallback(async () => {
    try {
      const r = await fotoRoyxatOl(kompaniyaId, obyektId, { manbaTuri: manbaTuri, manbaId: manbaId, limit: ixcham ? 60 : 120 });
      setFotolar(r.fotolar); onChange?.(r.jami);
    } catch (e) { toast((e as Error).message, 'warn'); }
  }, [kompaniyaId, obyektId, manbaTuri, manbaId, ixcham, onChange]);
  useEffect(() => { void yangila(); }, [yangila]);

  const tanlandi = async (fayllar: FileList | null) => {
    if (!fayllar || !fayllar.length) return;
    setYuklanmoqda(true);
    try {
      const joy = joyBelgisi ? await joyOl() : null;
      let ok = 0;
      for (const file of Array.from(fayllar).slice(0, 20)) {
        const r = await fotoYukla({ file, kompaniyaId, loyihaId, obyektId, manba, lat: joy?.lat ?? null, lng: joy?.lng ?? null });
        if (r.ok) ok++; else toast(`${file.name}: ${r.xato || r.code}`, 'warn');
      }
      if (ok) toast(t('{n} ta foto saqlandi', { n: ok }), 'ok');
      await yangila();
    } finally { setYuklanmoqda(false); if (input.current) input.current.value = ''; }
  };

  const olibTashla = async (f: FotoElement) => {
    if (!window.confirm(t('Bu fotoni olib tashlaysizmi?'))) return;
    const r = await fotoOchir(kompaniyaId, f.id);
    if (!r.ok) { toast(r.error || t('Olib tashlanmadi'), 'warn'); return; }
    setKatta(null); await yangila();
  };

  const aiSora = async (f: FotoElement) => {
    setBand(f.id);
    try {
      const blob = await (await fetch(fotoUrl(f.document_id))).blob();
      const kichik = await rasmKichraytir(new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' }), 1024);
      const r = await fotoAiTavsif(kompaniyaId, kichik, nomzodlar.slice(0, 40).map((n) => ({ tur: n.tur, id: n.id, nom: n.nom })));
      if (!r.ok) { toast(r.xabar, 'warn'); return; }
      setTaklif((p) => ({ ...p, [f.id]: { izoh: r.izoh, taklif: r.taklif } }));
      await fotoYangila(kompaniyaId, f.id, { aiIzoh: r.izoh || null, aiTaklif: r.taklif });
    } catch (e) { toast((e as Error).message || t('AI ishlamadi'), 'warn'); } finally { setBand(null); }
  };

  const qabul = async (f: FotoElement) => {
    const tk = taklif[f.id]; if (!tk) return;
    const r = await fotoYangila(kompaniyaId, f.id, { izoh: f.izoh || tk.izoh || null, ...(tk.taklif ? { manba: { turi: tk.taklif.manba_turi, id: tk.taklif.manba_id } } : {}) });
    if (!r.ok) { toast(r.error || t('Saqlanmadi'), 'warn'); return; }
    setTaklif((p) => { const n = { ...p }; delete n[f.id]; return n; });
    await yangila();
  };

  const izohSaqla = async (f: FotoElement, v: string) => {
    if ((f.izoh ?? '') === v.trim()) return;
    const r = await fotoYangila(kompaniyaId, f.id, { izoh: v.trim() });
    if (!r.ok) toast(r.error || t('Saqlanmadi'), 'warn'); else setFotolar((l) => l.map((x) => (x.id === f.id ? { ...x, izoh: v.trim() || null } : x)));
  };

  const o = ixcham ? 'h-20 w-20' : 'h-28 w-28';
  return (
    <section aria-label={t('Foto-dalil')} data-testid="foto-dalil">
      {yozish && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="fz-btn" disabled={yuklanmoqda} onClick={() => input.current?.click()}>
            <Camera size={14} aria-hidden /> {yuklanmoqda ? t('Yuklanmoqda…') : t('Foto qo‘shish')}
          </button>
          <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void tanlandi(e.target.files)} />
          {joylashuv && <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={joyBelgisi} onChange={(e) => setJoyBelgisi(e.target.checked)} /> {t('Joylashuvni qo‘shish')}</label>}
          {manba && <span className="text-[12px] opacity-70">{manbaNomi(manba.turi)}{manba.id ? ` #${manba.id}` : ''}</span>}
        </div>
      )}
      {!fotolar.length && <p className="text-[12px] opacity-70">{t('Hali foto yo‘q')}</p>}
      <ul className="flex flex-wrap gap-2">
        {fotolar.map((f) => (
          <li key={f.id} className="relative">
            <button type="button" onClick={() => setKatta(f)} aria-label={t('Fotoni kattalashtirish')}>
              <img src={fotoUrl(f.document_id)} alt={fotoIzohi(f) || f.original_filename || ''} loading="lazy" className={`${o} rounded border object-cover`} />
            </button>
            <span className="absolute bottom-0 left-0 right-0 truncate rounded-b bg-black/55 px-1 text-[10px] text-white">{f.sana}</span>
          </li>
        ))}
      </ul>
      {katta && (
        <div role="dialog" aria-modal="true" aria-label={t('Foto')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={() => setKatta(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded bg-white p-3 text-black" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span>{katta.sana} · {katta.razdel_nom || t('Razdelsiz')} · {manbaNomi(katta.manba_turi)}{katta.manba_nom ? `: ${katta.manba_nom}` : ''}</span>
              <button type="button" aria-label={t('Yopish')} onClick={() => setKatta(null)}><X size={16} /></button>
            </div>
            <img src={fotoUrl(katta.document_id)} alt={fotoIzohi(katta)} className="mx-auto max-h-[60vh] w-auto" />
            {katta.lat != null && katta.lng != null && <p className="mt-1 text-[11px]">{katta.lat.toFixed(5)}, {katta.lng.toFixed(5)}</p>}
            <label className="mt-2 block text-[12px]">{t('Izoh')}
              <input key={katta.id} className="input mt-1 block w-full" defaultValue={katta.izoh ?? ''} disabled={!yozish} maxLength={500} onBlur={(e) => void izohSaqla(katta, e.target.value)} />
            </label>
            {katta.ai_izoh && !katta.izoh && <p className="mt-1 text-[12px] italic">{t('AI izohi (taklif)')}: {katta.ai_izoh}</p>}
            {taklif[katta.id] && (
              <div className="mt-2 rounded border border-amber-400 p-2 text-[12px]" data-testid="foto-ai-taklif">
                <b>{t('AI taklifi — tasdiqlang')}:</b> {taklif[katta.id].izoh || '—'}
                {taklif[katta.id].taklif
                  ? <div>{t('Bog‘lash')}: {manbaNomi(taklif[katta.id].taklif!.manba_turi)} · {taklif[katta.id].taklif!.nom} ({Math.round(taklif[katta.id].taklif!.ishonch * 100)}%)</div>
                  : <div>{t('Mos ish topilmadi')}</div>}
                <button type="button" className="fz-btn mt-1" onClick={() => void qabul(katta)}>{t('Qabul qilish')}</button>
              </div>
            )}
            {yozish && (
              <div className="mt-2 flex gap-2">
                {ai && <button type="button" className="fz-btn" disabled={band === katta.id} onClick={() => void aiSora(katta)}><Sparkles size={14} aria-hidden /> {band === katta.id ? t('AI o‘qiyapti…') : t('AI tavsifi (token yechadi)')}</button>}
                <button type="button" className="fz-btn" onClick={() => void olibTashla(katta)}><Trash2 size={14} aria-hidden /> {t('Olib tashlash')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default FotoDalil;
