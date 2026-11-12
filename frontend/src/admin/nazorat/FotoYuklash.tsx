/**
 * FotoYuklash.tsx - texnadzor/pudratchi uchun foto-dalil: rasm tanlanadi (telefonda kamera) va darhol R2 ga yuklanadi
 * (mavjud /api/hujjat-yukla). Qaytadi: hujjat ID lari. Rasm bayti DB ga emas, faqat ID bandga yoziladi.
 */
import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

export function FotoYuklash({ kompaniyaId, idlar, onOzgardi, hujjatTuri = 'tekshiruv_foto', max = 10 }: {
  kompaniyaId: number; idlar: readonly number[]; onOzgardi: (yangi: number[]) => void; hujjatTuri?: string; max?: number;
}) {
  const [band, setBand] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function tanlandi(fayllar: File[]) {
    if (!fayllar.length) return;
    if (idlar.length + fayllar.length > max) { toast(t('Ko‘pi bilan {n} ta foto', { n: max }), 'danger'); return; }
    setBand(true);
    try {
      const lr = await sbLoyihaUmumiy(kompaniyaId);
      if (!lr.ok || !lr.id) { toast(lr.error || t('Fayl uchun loyiha topilmadi'), 'danger'); return; }
      const yangi: number[] = [...idlar];
      for (const file of fayllar) {
        const r = await hujjatYukla({ file, kompaniyaId, loyihaId: lr.id, documentType: hujjatTuri });
        if (!r.ok) { toast(r.xato || t('Foto yuklanmadi'), 'danger'); break; }
        yangi.push(r.data.document_id);
      }
      onOzgardi(yangi);
    } finally { setBand(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="foto-yuklash">
      {idlar.map((id) => (
        <span key={id} className="relative inline-block">
          <a href={hujjatYuklabOlishUrl(id)} target="_blank" rel="noreferrer"><img src={hujjatYuklabOlishUrl(id)} alt={t('Foto')} className="h-16 w-16 rounded-md border border-border object-cover" loading="lazy" /></a>
          <button type="button" className="absolute -right-1 -top-1 rounded-full bg-bg p-0.5 shadow" aria-label={t('Fotoni olib tashlash')} onClick={() => onOzgardi(idlar.filter((x) => x !== id))}><X size={12} /></button>
        </span>
      ))}
      <label className={`fz-btn fz-btn--sm inline-flex cursor-pointer items-center gap-1 ${band ? 'opacity-60' : ''}`}>
        <Camera size={14} />{band ? t('Yuklanmoqda…') : t('Foto qo‘shish')}
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={band} onChange={(e) => void tanlandi(Array.from(e.target.files ?? []))} aria-label={t('Foto qo‘shish')} />
      </label>
    </div>
  );
}
