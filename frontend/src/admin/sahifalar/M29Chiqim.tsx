import { useEffect, useMemo, useState } from 'react';
import { PackageMinus, RotateCcw } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { m29Bajar, m29Bekor, m29ChiqimTaklifi, m29HujjatOl, type M29ChiqimQator, type M29Hujjat } from '../../api/t2-m29';
import type { M29Material } from '../../lib/m29';

/**
 * M-29 bajarish — ombordan chiqim (egasi 2026-10-21, ADR-3). Fakt omborni kamaytirmaydi; davr uchun M-29 bajarilganda
 * materiallar (miqdor — davr norma sarfi, foydalanuvchi o'zgartiradi) ombordan chiqim qilinadi. Bitta davr — bitta faol hujjat;
 * bekor qilish mumkin (chiqim qaytadi). Eski avtomatik (Fakt-trigger) chiqimlar va yetmaydigan qoldiq — aniq tasdiq bilan.
 */
const fmt = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

export function M29Chiqim({ kompaniyaId, obyektId, davr, materiallar, onYangilandi }: {
  kompaniyaId: number; obyektId: number; davr: string; materiallar: readonly M29Material[]; onYangilandi: () => void;
}) {
  const [hujjat, setHujjat] = useState<M29Hujjat | null | undefined>(undefined);
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const taklif = useMemo(() => m29ChiqimTaklifi(materiallar), [materiallar]);
  const [qatorlar, setQatorlar] = useState<M29ChiqimQator[]>(taklif);
  useEffect(() => { setQatorlar(taklif); setOchiq(false); }, [taklif]);

  useEffect(() => {
    let faol = true;
    setHujjat(undefined);
    void m29HujjatOl(obyektId, davr).then((h) => { if (faol) setHujjat(h); }, () => { if (faol) setHujjat(undefined); });
    return () => { faol = false; };
  }, [obyektId, davr]);

  const bajar = async () => {
    const yuboriladi = qatorlar.filter((q) => q.miqdor > 0);
    if (!yuboriladi.length) { toast(t('Chiqim qilinadigan material yo‘q (miqdor 0 dan katta bo‘lsin).'), 'warn'); return; }
    setBand(true);
    const operationId = yangiOperationId();
    try {
      let triggerBekor = false, manfiy = false;
      for (let urinish = 0; urinish < 3; urinish++) {
        const r = await m29Bajar({ kompaniyaId, obyektId, davr, qatorlar: yuboriladi, operationId, triggerBekor, manfiygaRuxsat: manfiy });
        if (r.ok) {
          toast(t('M-29 bajarildi: {n} ta material ombordan chiqim qilindi.', { n: r.qator_soni })
            + (r.trigger_bekor_soni ? ' ' + t('{n} ta eski avtomatik yozuv bekor qilindi (o‘chirilmadi).', { n: r.trigger_bekor_soni }) : ''), 'ok');
          setOchiq(false); onYangilandi();
          setHujjat(await m29HujjatOl(obyektId, davr).catch(() => null));
          return;
        }
        if (r.code === 'TRIGGER_CHIQIM_BOR' && !triggerBekor) {
          const n = r.trigger?.length ?? 0;
          if (!window.confirm(t('Bu davrda Fakt kiritilganda {n} ta material omborda avtomatik chiqim qilingan (eski tartib). M-29 ular o‘rniga yoziladi: eski yozuvlar o‘chirilmaydi, «bekor» deb belgilanadi va qoldiqqa qaytariladi — ikki marta yechilmaydi. Davom etilsinmi?', { n }))) return;
          triggerBekor = true; continue;
        }
        if (r.code === 'QOLDIQ_YETMAYDI' && !manfiy) {
          const ro = (r.yetmaydi ?? []).slice(0, 8).map((y) => `• ${y.nomi}: ${t('kerak')} ${fmt(y.kerak)}, ${t('omborda')} ${fmt(y.bor)} ${y.birligi ?? ''}`).join('\n');
          if (!window.confirm(t('Omborda yetarli qoldiq yo‘q ({n} ta material) — kirim kiritilmagan bo‘lishi mumkin:', { n: r.yetmaydi?.length ?? 0 })
            + '\n' + ro + '\n\n' + t('Baribir chiqim qilinsinmi? Qoldiq minusga tushadi (keyin kirim kiritsangiz tenglashadi).'))) return;
          manfiy = true; continue;
        }
        toast(t(r.xato), 'danger');
        if (r.code === 'DAVR_BAJARILGAN') setHujjat(await m29HujjatOl(obyektId, davr).catch(() => null));
        return;
      }
    } finally { setBand(false); }
  };

  const bekor = async () => {
    if (!hujjat) return;
    const sabab = window.prompt(t('M-29 bekor qilinadi: ombordan chiqimlar qaytariladi. Sababini yozing:'));
    if (!sabab?.trim()) return;
    setBand(true);
    try {
      const r = await m29Bekor({ kompaniyaId, hujjatId: hujjat.id, sabab: sabab.trim() });
      if (!r.ok) { toast(t(r.xato ?? 'Bekor qilinmadi.'), 'danger'); return; }
      toast(t('M-29 bekor qilindi — chiqimlar omborga qaytarildi.'), 'ok');
      setHujjat(null); onYangilandi();
    } finally { setBand(false); }
  };

  if (hujjat === undefined) return null;
  return (
    <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('Ombordan chiqim (M-29)')}>
      <div className="flex flex-wrap items-center gap-2">
        <PackageMinus size={16} className="text-accent" />
        <span className="font-semibold text-text">{t('Ombordan chiqim (M-29)')}</span>
        {hujjat
          ? <span className="text-ok">{t('Bajarilgan: {n} ta material · {sana}', { n: hujjat.qator_soni, sana: String(hujjat.bajarildi).slice(0, 10) })}{hujjat.manfiy_qoldiq ? ' · ' + t('qoldiq minusga tushgan') : ''}</span>
          : <span className="text-text-dim">{t('Bu davr uchun hali bajarilmagan — ombor Fakt bilan emas, M-29 bilan kamayadi.')}</span>}
        <span className="ml-auto flex gap-1.5">
          {hujjat
            ? <button type="button" disabled={band} onClick={() => void bekor()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text"><RotateCcw size={13} />{t('Bekor qilish')}</button>
            : <button type="button" disabled={band || !taklif.length} onClick={() => setOchiq((x) => !x)} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"><PackageMinus size={13} />{ochiq ? t('Yopish') : t('Ombordan chiqim qilish')}</button>}
        </span>
      </div>
      {!hujjat && !taklif.length && <p className="text-text-mute">{t('Bu davrda norma bo‘yicha sarflangan material yo‘q (tasdiqlangan F2 yo‘q).')}</p>}
      {!hujjat && ochiq && (
        <div className="space-y-2">
          <p className="text-text-mute">{t('Miqdor — davrning norma bo‘yicha sarfi; haqiqatda boshqacha bo‘lsa o‘zgartiring. 0 — chiqim qilinmaydi.')}</p>
          <div className="max-h-[50vh] overflow-auto rounded border border-border/60">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-[11px] text-text-mute">
                <tr><th className="px-2 py-1">{t('Material')}</th><th className="px-2">{t('Birlik')}</th><th className="px-2 text-right">{t('Chiqim miqdori')}</th></tr>
              </thead>
              <tbody>
                {qatorlar.map((q, i) => (
                  <tr key={q.nomi + '|' + q.birligi} className="border-t border-border/40">
                    <td className="px-2 py-1 text-text">{q.nomi}</td>
                    <td className="px-2 text-text-dim">{q.birligi ?? '—'}</td>
                    <td className="px-2 text-right">
                      <input type="number" min={0} step="any" aria-label={t('Chiqim miqdori')} value={Number.isFinite(q.miqdor) ? q.miqdor : 0}
                        onChange={(e) => { const v = Number(e.target.value); setQatorlar((s) => s.map((x, j) => (j === i ? { ...x, miqdor: Number.isFinite(v) && v > 0 ? v : 0 } : x))); }}
                        className="input h-7 w-32 text-right tabular-nums" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={band} onClick={() => void bajar()} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
              {band ? '…' : t('M-29 ni bajarish — ombordan chiqim')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
