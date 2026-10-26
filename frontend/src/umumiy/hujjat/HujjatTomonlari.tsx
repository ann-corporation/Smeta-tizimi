/**
 * HujjatTomonlari — PTO hujjatlari imzo blokidagi tomonlar nomi (H3).
 *
 * Nom saytdan (foydalanuvchi kiritadi) keladi va shu brauzerda kompaniya
 * bo'yicha eslab qolinadi; bo'sh qoldirilsa hujjatda to'ldirish chizig'i
 * chiqadi — nom hech qachon o'ylab topilmaydi. Barcha eksport tugmalari
 * (Ostatka, АКТ Ф-2, Накопительная, Ресурсная ведомость) bir xil qiymatni
 * ishlatadi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { kompaniyaSozlamaOl, kompaniyaSozlamaYoz } from '../../api/kompaniya-sozlama';
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

const bosh = (x: ImzoNomlar) => !Object.values(x).some((v) => typeof v === 'string' && v.trim());
const SAQLASH_KECHIKISH = 800;

/**
 * Server-backed (kompaniya sozlamasi `hujjat.imzo_tomonlari`), lekin AVVAL localStorage (tezkor, oflayn-xavfsiz).
 * Server qiymati kelsa — o'sha ustun; serverda yo'q, mahalliy bor va yozish mumkin bo'lsa — bir marta yuklanadi.
 * API 404/403/tarmoq xatosi — jim, mahalliy rejimda qoladi. Oddiy fetch (QueryClient shart emas).
 */
export function useHujjatTomonlari(kompaniyaId: number | null | undefined): [ImzoNomlar, (next: ImzoNomlar) => void] {
  const [nomlar, setNomlar] = useState<ImzoNomlar>(() => oqi(kompaniyaId));
  const yozishRef = useRef(false);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kutilgan = useRef<ImzoNomlar | null>(null);

  const serverga = useCallback((kid: number, qiymat: ImzoNomlar) => {
    void kompaniyaSozlamaYoz({ kompaniya_id: kid, kalit: 'hujjat.imzo_tomonlari', qiymat: bosh(qiymat) ? null : { ...qiymat } }).catch(() => { /* jim — mahalliy saqlangan */ });
  }, []);

  useEffect(() => {
    setNomlar(oqi(kompaniyaId));
    yozishRef.current = false;
    kutilgan.current = null;
    if (kompaniyaId == null) return;
    let bekor = false;
    kompaniyaSozlamaOl(kompaniyaId).then((s) => {
      if (bekor) return;
      yozishRef.current = s.yozish_mumkin;
      const sv = s.sozlamalar['hujjat.imzo_tomonlari']?.qiymat;
      if (sv && typeof sv === 'object') {
        if (kutilgan.current) return; // foydalanuvchi allaqachon tahrirlayapti
        const x = sv as ImzoNomlar;
        setNomlar(x);
        try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(x)); } catch { /* xotira yopiq */ }
      } else if (s.yozish_mumkin) {
        const lokal = oqi(kompaniyaId);
        if (!bosh(lokal)) serverga(kompaniyaId, lokal);
      }
    }).catch(() => { /* jim — mahalliy rejim */ });
    return () => { bekor = true; };
  }, [kompaniyaId, serverga]);

  useEffect(() => () => {
    if (taymer.current) clearTimeout(taymer.current);
  }, []);

  const saqla = useCallback((next: ImzoNomlar) => {
    setNomlar(next);
    try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(next)); } catch { /* xotira yopiq — faqat shu sessiya */ }
    if (kompaniyaId == null) return;
    kutilgan.current = next;
    if (taymer.current) clearTimeout(taymer.current);
    taymer.current = setTimeout(() => {
      taymer.current = null;
      const q = kutilgan.current;
      kutilgan.current = null;
      if (q && yozishRef.current) serverga(kompaniyaId, q);
    }, SAQLASH_KECHIKISH);
  }, [kompaniyaId, serverga]);
  return [nomlar, saqla];
}

export const MAYDONLAR: Array<{ k: keyof ImzoNomlar; rol: string; ru: string; izoh?: string }> = [
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
