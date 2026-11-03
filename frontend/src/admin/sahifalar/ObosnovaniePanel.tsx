import { useMemo, useState } from 'react';
import type { T2Obyekt, T2Qator, T2QatorHolat } from '../../api/supabase';
import { obosnovanieObyektYukla } from '../../api/t2-obosnovanie';
import {
  obosnovanieModeli, obosnovanieXlsx, sonOqi, type EskiHisobot, type ObosnovanieModel,
} from '../../lib/fakt-obosnovanie';
import { bugunSana, type ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { FileSpreadsheet } from 'lucide-react';

type Rejim = 'obyekt' | 'loyiha';
type Matn = { fakt: string; f2: string; qoldiq: string };

/**
 * «ОБОСНОВАНИЕ ВЫПОЛНЕННЫХ ОБЪЁМОВ, НЕ ЗАКРЫТЫХ Ф-2» — bajarilgan, lekin F2 ga chiqmagan ish tizimning haqiqiy smeta va fakt
 * ma'lumotlaridan pozitsiya bo'yicha. Bitta obyekt yoki loyihaning hamma obyektlari (har obyekt — alohida varaq + Свод).
 * Eski hisobot raqamlari ixtiyoriy, qo'lda kiritiladi (qattiq yozilmaydi) — Svodda farq ko'rsatiladi.
 */
export function ObosnovaniePanel({ kompaniyaId, obyektId, obyektNomi, loyihaId, obyektlar, qatorlar, holatlar, tomonlar }: {
  kompaniyaId: number; obyektId: number; obyektNomi: string; loyihaId: number | null;
  obyektlar: readonly T2Obyekt[]; qatorlar: readonly T2Qator[]; holatlar: readonly T2QatorHolat[]; tomonlar?: ImzoNomlar;
}) {
  const [rejim, setRejim] = useState<Rejim>('obyekt');
  const [sana, setSana] = useState(bugunSana);
  const [f2Oshgan, setF2Oshgan] = useState(true);
  const [eski, setEski] = useState<Record<number, Matn>>({});
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ tur: 'ok' | 'xato'; matn: string } | null>(null);

  const loyihaObyektlari = useMemo(() => (loyihaId == null ? [] : obyektlar.filter((o) => o.loyiha_id === loyihaId && o.kompaniya_id === kompaniyaId && (o.qator_soni ?? 0) > 0)), [obyektlar, loyihaId, kompaniyaId]);
  const royxat = useMemo<Array<{ id: number; nom: string }>>(
    () => (rejim === 'loyiha' && loyihaObyektlari.length ? loyihaObyektlari.map((o) => ({ id: o.id, nom: o.nom })) : [{ id: obyektId, nom: obyektNomi }]),
    [rejim, loyihaObyektlari, obyektId, obyektNomi],
  );
  const matn = (id: number): Matn => eski[id] ?? { fakt: '', f2: '', qoldiq: '' };
  const yoz = (id: number, k: keyof Matn, v: string) => setEski((p) => ({ ...p, [id]: { ...matn(id), ...{ [k]: v } } }));

  const tuz = async () => {
    setBand(true); setXabar(null);
    try {
      const modellar: ObosnovanieModel[] = [];
      const ogoh: string[] = [];
      for (const ob of royxat) {
        const y = await obosnovanieObyektYukla(kompaniyaId, ob, ob.id === obyektId ? { qatorlar, holatlar } : null);
        if (!y.ok) { setXabar({ tur: 'xato', matn: `${y.xato}. ${t('Hujjat tuzilmadi, qayta urinib ko‘ring.')}` }); return; }
        ogoh.push(...y.ogohlantirish);
        modellar.push(obosnovanieModeli(y.kirish, { f2OshganKorsat: f2Oshgan }));
      }
      const eskiXarita = new Map<number, EskiHisobot>();
      for (const ob of royxat) {
        const m = matn(ob.id);
        const e = { fakt: sonOqi(m.fakt), f2: sonOqi(m.f2), qoldiq: sonOqi(m.qoldiq) };
        if (e.fakt != null || e.f2 != null || e.qoldiq != null) eskiXarita.set(ob.id, e);
      }
      const nom = rejim === 'loyiha' && royxat.length > 1 ? `Проект (${royxat.length} объектов)` : obyektNomi;
      const { bytes, faylNomi } = obosnovanieXlsx(modellar, { nom, sana, tuzilgan: bugunSana(), imzo: tomonlar, eski: eskiXarita, f2OshganKorsat: f2Oshgan });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'OBOSNOVANIE', sabab: `Обоснование выполненных объёмов, не закрытых Ф-2 · ${nom}`, obyekt: royxat.length === 1 ? royxat[0].id : null },
        () => downloadBlob(bytes, faylNomi));
      if (!r.ok) { setXabar({ tur: 'xato', matn: r.xabar }); return; }
      const poz = modellar.reduce((s, m) => s + m.pozSoni, 0);
      setXabar({ tur: 'ok', matn: `${poz} ${t('ta pozitsiya')}, ${modellar.length} ${t('ta obyekt')}${ogoh.length ? ` · ${ogoh.length} ${t('ta ogohlantirish (hujjatda ko‘rsatilgan)')}` : ''}${r.xabar ? ' · ' + r.xabar : ''}` });
      if (ogoh.length) toast(ogoh.slice(0, 3).join('; '), 'warn');
    } catch {
      setXabar({ tur: 'xato', matn: t('Excel fayli tuzilmadi. Qayta urinib ko‘ring.') });
    } finally { setBand(false); }
  };

  return (
    <div className="space-y-2 text-[12.5px]" aria-label={t('Bajarilgan, lekin F2 ga chiqmagan ish asosi')}>
      <p className="text-text-mute">{t('Fakt va tasdiqlangan F2 farqi (fakt − F2) pozitsiya bo‘yicha, asos (jurnal, F2 raqami) bilan. Summalar: QQS bilan / ustamali / ustamasiz.')}</p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="block">{t('Qamrov')}
          <select aria-label={t('Qamrov')} value={rejim} onChange={(e) => setRejim(e.target.value as Rejim)} className="mt-1 block rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1.5 text-[13px]">
            <option value="obyekt">{t('Shu obyekt')}</option>
            <option value="loyiha" disabled={loyihaObyektlari.length < 2}>{t('Loyihaning hamma obyektlari')}{loyihaObyektlari.length > 1 ? ` (${loyihaObyektlari.length})` : ''}</option>
          </select></label>
        <label className="block">{t('Holat sanasi')}
          <input aria-label={t('Holat sanasi')} type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="mt-1 block rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1.5 text-[13px]" /></label>
        <label className="inline-flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={f2Oshgan} onChange={(e) => setF2Oshgan(e.target.checked)} /> {t('F2 faktdan oshgan qatorlar ham')}</label>
        <button type="button" disabled={band} onClick={() => void tuz()} className="fz-btn fz-btn--sm"><FileSpreadsheet aria-hidden="true" /> {band ? t('Tuzilmoqda…') : t('Asos hujjati (Excel)')}</button>
      </div>
      <details>
        <summary className="cursor-pointer text-text-dim">{t('Eski hisobot raqamlari bilan solishtirish (ixtiyoriy, QQS bilan, so‘m)')}</summary>
        <div className="fz-table-wrap mt-2"><table className="fz-table">
          <thead><tr><th>{t('Obyekt')}</th><th>{t('Eski fakt')}</th><th>{t('Eski F2 yopilgan')}</th><th>{t('Eski F2 ga chiqmagan')}</th></tr></thead>
          <tbody>{royxat.map((ob) => (
            <tr key={ob.id}>
              <td>{ob.nom}</td>
              {(['fakt', 'f2', 'qoldiq'] as const).map((k) => (
                <td key={k}><input aria-label={`${ob.nom}: ${k}`} inputMode="decimal" value={matn(ob.id)[k]} onChange={(e) => yoz(ob.id, k, e.target.value)} className="w-36 rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1 text-right text-[12.5px]" /></td>
              ))}
            </tr>))}</tbody>
        </table></div>
      </details>
      {xabar && <div role={xabar.tur === 'xato' ? 'alert' : 'status'} className={`fz-note ${xabar.tur === 'xato' ? 'fz-note--danger' : 'fz-note--info'}`}><span>{xabar.matn}</span></div>}
    </div>
  );
}

export default ObosnovaniePanel;
