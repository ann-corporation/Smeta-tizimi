/**
 * Brauzer qoralamasi (draft himoyasi) — Fakt jurnali va Ish varag'i uchun yagona mexanika (FaktJurnal'dan CHIQARILGAN, xulq o'zgarmagan).
 *
 * Hodisa 2026-11-09: deploydan keyin saqlash o'tmadi, ~30 qator kiritma faqat xotirada edi. Kiritmalar kompaniya+foydalanuvchi+obyekt
 * bo'yicha localStorage'ga yoziladi; sahifa ochilganda tiklanadi. Qator yo'q yoki server fakti qoralamadagidan farq qilsa — JIM
 * qo'llanmaydi, ziddiyat sifatida belgilanadi. Foydalanuvchi id kalitda; id hali noma'lum bo'lsa qoralama o'qilmaydi ham, yozilmaydi ham.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Kiritma } from '../fakt-jurnal';
import { brauzerXotirasi, qoralamaV1Kochir, qoralamaOchir, qoralamaOqi, qoralamaQur, qoralamaTikla, qoralamaYoz, type QoralamaZiddiyat } from '../fakt-jurnal-qoralama';

export function useQoralamaHimoya(o: {
  kompaniyaId: number; obyektId: number; foydalanuvchiId: number | null;
  qatorSoni: number; faktlar: ReadonlyMap<number, number>;
  kiritmalar: Record<number, Kiritma>; setKiritmalar: Dispatch<SetStateAction<Record<number, Kiritma>>>;
  /** Obyekt (yoki foydalanuvchi) almashganda — ommaviy amallar tarixi tozalanadi. */
  tarixTozala: () => void;
  sana: string; setSana: (s: string) => void;
}) {
  const { kompaniyaId, obyektId, foydalanuvchiId, qatorSoni, faktlar, kiritmalar, setKiritmalar, tarixTozala, sana, setSana } = o;
  const qoralamaKalit = `${kompaniyaId}:${foydalanuvchiId}:${obyektId}`;
  const [tiklandi, setTiklandi] = useState<{ kiritmalar: Record<number, Kiritma>; ziddiyatlar: QoralamaZiddiyat[] } | null>(null);
  /** Joriy kiritmalar qaysi kompaniya:obyekt qoralamasiga tegishli (tiklash bajarilgach o'rnatiladi; undan oldin yozilmaydi). */
  const [qoralamaEgasi, setQoralamaEgasi] = useState<string | null>(null);
  const ziddiyatMap = useMemo(() => new Map((tiklandi?.ziddiyatlar ?? []).filter((z) => z.sabab === 'ozgargan').map((z) => [z.yozuv.id, z])), [tiklandi]);
  useEffect(() => {
    if (qoralamaEgasi === qoralamaKalit || !qatorSoni || foydalanuvchiId == null) return;
    const boshqaObyekt = qoralamaEgasi != null; // obyekt (yoki foydalanuvchi) almashdi — eski kiritmalar o'z qoralamasida qoladi
    qoralamaV1Kochir(brauzerXotirasi(), kompaniyaId, obyektId, foydalanuvchiId); // deploydagi eski (v1) saqlanmagan ish yo'qolmasin
    const q = qoralamaOqi(brauzerXotirasi(), kompaniyaId, obyektId, foydalanuvchiId);
    const r = q ? qoralamaTikla(q, faktlar) : null;
    if (boshqaObyekt) tarixTozala();
    setKiritmalar((x) => ({ ...(boshqaObyekt ? {} : x), ...(r?.kiritmalar ?? {}) }));
    if (r?.sana) setSana(r.sana);
    setTiklandi(r && (Object.keys(r.kiritmalar).length || r.ziddiyatlar.length) ? { kiritmalar: r.kiritmalar, ziddiyatlar: r.ziddiyatlar } : null);
    setQoralamaEgasi(qoralamaKalit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tarixTozala/setSana/setKiritmalar: barqaror setter'lar
  }, [qoralamaKalit, qoralamaEgasi, qatorSoni, faktlar, kompaniyaId, obyektId, foydalanuvchiId]);
  /** Qoralamani hozir yozadi (debounce kutmasdan) — saqlash xatosida va sahifani tark etishda. */
  const qoralamaYozDarhol = () => {
    if (qoralamaEgasi !== qoralamaKalit || foydalanuvchiId == null) return;
    qoralamaYoz(brauzerXotirasi(), kompaniyaId, obyektId, foydalanuvchiId, qoralamaQur(kiritmalar, faktlar, Date.now(), sana, tiklandi?.ziddiyatlar.map((z) => z.yozuv)));
  };
  const qoralamaYozRef = useRef(qoralamaYozDarhol);
  qoralamaYozRef.current = qoralamaYozDarhol;
  useEffect(() => {
    if (qoralamaEgasi !== qoralamaKalit) return;
    const h = setTimeout(() => qoralamaYozRef.current(), 400);
    return () => clearTimeout(h);
  }, [kiritmalar, faktlar, sana, tiklandi, qoralamaEgasi, qoralamaKalit]);
  useEffect(() => {
    const yoz = () => qoralamaYozRef.current();
    window.addEventListener('pagehide', yoz);
    return () => { window.removeEventListener('pagehide', yoz); yoz(); };
  }, []);
  /** Faqat tiklangan (o'zgartirilmagan) kiritmalar olib tashlanadi; keyin qo'lda yozilganlarga tegilmaydi. */
  const qoralamaBekor = () => {
    const tk = tiklandi?.kiritmalar ?? {};
    setKiritmalar((x) => { const n = { ...x }; for (const [id, k] of Object.entries(tk)) { const y = n[Number(id)]; if (y && y.rejim === k.rejim && y.qiymat === k.qiymat) delete n[Number(id)]; } return n; });
    setTiklandi(null);
  };
  /** Muvaffaqiyatli saqlashdan keyin: tiklash belgisi va brauzer qoralamasi o'chiriladi. */
  const qoralamaTozala = () => {
    setTiklandi(null);
    if (foydalanuvchiId != null) qoralamaOchir(brauzerXotirasi(), kompaniyaId, obyektId, foydalanuvchiId);
  };
  return { tiklandi, ziddiyatMap, qoralamaYozDarhol, qoralamaBekor, qoralamaTozala };
}
