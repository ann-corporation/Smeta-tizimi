/**
 * HujjatTomonlari — PTO hujjatlari imzo blokidagi tomonlar nomi (H3).
 *
 * Nom saytdan (foydalanuvchi kiritadi) keladi va shu brauzerda kompaniya
 * bo'yicha eslab qolinadi; bo'sh qoldirilsa hujjatda to'ldirish chizig'i
 * chiqadi — nom hech qachon o'ylab topilmaydi. Barcha eksport tugmalari
 * (Ostatka, АКТ Ф-2, Накопительная, Ресурсная ведомость) bir xil qiymatni
 * ishlatadi.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { t } from '../../i18n/til';
import './hujjat-korinish.css';

const kalit = (kompaniyaId: number | null | undefined) => `hujjat-tomonlari:${kompaniyaId ?? 'umumiy'}`;

function oqi(kompaniyaId: number | null | undefined): ImzoNomlar {
  try {
    const x = JSON.parse(globalThis.localStorage?.getItem(kalit(kompaniyaId)) || '{}');
    return x && typeof x === 'object' ? x as ImzoNomlar : {};
  } catch { return {}; }
}

export function useHujjatTomonlari(kompaniyaId: number | null | undefined): [ImzoNomlar, (next: ImzoNomlar) => void] {
  const [nomlar, setNomlar] = useState<ImzoNomlar>(() => oqi(kompaniyaId));
  useEffect(() => { setNomlar(oqi(kompaniyaId)); }, [kompaniyaId]);
  const saqla = useCallback((next: ImzoNomlar) => {
    setNomlar(next);
    try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(next)); } catch { /* xotira yopiq — faqat shu sessiya */ }
  }, [kompaniyaId]);
  return [nomlar, saqla];
}

const MAYDONLAR: Array<{ k: keyof ImzoNomlar; rol: string; ru: string; izoh?: string }> = [
  { k: 'zakazchik', rol: 'Buyurtmachi', ru: 'ЗАКАЗЧИК' },
  { k: 'pudratchi', rol: 'Pudratchi', ru: 'ПОДРЯДЧИК' },
  { k: 'subpudratchi', rol: 'Subpudratchi', ru: 'СУБПОДРЯДЧИК', izoh: '3 tomonlama bo‘lsa' },
  { k: 'texnadzor', rol: 'Texnik nazorat', ru: 'ТЕХНАДЗОР' },
  { k: 'tuzuvchi', rol: 'Tuzuvchi', ru: 'СОСТАВИЛ' },
];

/** Yig'iladigan panel: hujjat imzo tomonlari — har tomon alohida blok (rol, hujjatdagi rus yozuvi, nom). */
export function HujjatTomonlariPanel({ qiymat, onChange }: { qiymat: ImzoNomlar; onChange: (next: ImzoNomlar) => void }) {
  const tolgan = MAYDONLAR.filter((m) => (qiymat[m.k] ?? '').trim()).length;
  return (
    <details className="ht-panel">
      <summary className="ht-summary">
        <span className="ht-summary__h">{t('Hujjat imzolari')}</span>
        <span className={`fz-chip ${tolgan ? 'fz-chip--accent' : 'fz-chip--warn'}`}>{tolgan ? t('{a} / {b} tomon kiritilgan', { a: tolgan, b: MAYDONLAR.length }) : t('kiritilmagan (hujjatda chiziq)')}</span>
        {Boolean(qiymat.zakazchik || qiymat.pudratchi) && <span className="ht-summary__n">{[qiymat.zakazchik, qiymat.pudratchi].filter(Boolean).join(' / ')}</span>}
      </summary>
      <div className="ht-grid">
        {MAYDONLAR.map((m) => {
          const yorliq = `${t(m.rol)} (${m.ru})${m.izoh ? ` — ${t(m.izoh)}` : ''}`;
          const bor = (qiymat[m.k] ?? '').trim().length > 0;
          return (
            <label key={m.k} className={`ht-blok ${bor ? 'ht-blok--bor' : ''}`}>
              <span className="ht-blok__rol"><b>{t(m.rol)}</b><i>{m.ru}</i></span>
              {m.izoh && <span className="ht-blok__izoh">{t(m.izoh)}</span>}
              <input aria-label={yorliq} value={qiymat[m.k] ?? ''} onChange={(e) => onChange({ ...qiymat, [m.k]: e.target.value })}
                placeholder={t('tashkilot, lavozim, F.I.O.')} className="ht-blok__input" />
              <span className="ht-blok__chiziq" aria-hidden="true">{bor ? '' : t('hujjatda chiziq bo‘ladi')}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
