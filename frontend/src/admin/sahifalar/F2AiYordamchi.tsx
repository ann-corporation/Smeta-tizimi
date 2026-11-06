/**
 * F2 tayyorlash AI yordamchisi: umumiy AiYordamchiPanel + F2 vositalari (lib/ai-yordamchi/f2-vositalar).
 * Bajarish — faqat sahifa kiritmalari (hajm, narx, «narxsiz»); qoralama/F2 yaratish va Excel — foydalanuvchi tugmasi bilan.
 * Narx faqat bazadagi manbadan (narx vositasi ko'rsatgan aniq qiymat) — to'qilgan narx bajarilmaydi.
 */
import { useMemo, useRef } from 'react';
import { t } from '../../i18n/til';
import { F2AiRejaBolim } from './F2AiRejaBolim';
import { AiYordamchiPanel } from '../../umumiy/ui/ai-yordamchi/AiYordamchiPanel';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import type { SahifaVositalar } from '../../lib/ai-yordamchi/sikl';
import type { SahifaAmal } from '../../lib/ai-yordamchi/protokol';
import { F2_AMAL_NOMI, f2AmalTafsiloti, f2AmalTekshir, f2Indeks, f2Kalit, f2Kontekst, f2OlinadiganBolimlar, f2Oqi, type F2Malumot, type F2NarxVarianti, type F2UstamaliFn, type NarxRuxsat } from '../../lib/ai-yordamchi/f2-vositalar';
import { sonMatn, type F2Bolim, type F2Resurs } from '../../lib/f2-tayyor';
import { narxTakliflari, type NarxManba } from '../../api/t2-ish-abc';

const MANBA: Record<NarxManba, string> = { smeta_obyekt: 'shu obyekt smetasi', smeta_shartnoma: 'shu shartnoma smetalari', smeta: 'kompaniya smetalari', katalog: 'narx katalogi', qolda: 'qo‘lda' };

export type F2AiAmallar = {
  hajm: (id: number, qiymat: string) => void;
  narx: (id: number, qiymat: string) => void;
  narxsiz: (id: number) => void;
  bolimniOl: (bs: F2Bolim[]) => void;
  korsat: (nom: string) => void;
};

export function F2AiYordamchi({ kompaniyaId, obyektId, malumot, amallar }: {
  kompaniyaId: number; obyektId: number; malumot: Omit<F2Malumot, 'ustamali'>; amallar: F2AiAmallar;
}) {
  const h = useUstamaliSumma(obyektId, { kompaniyaId });
  const ustamali: F2UstamaliFn = (k) => {
    const u = h.hisobla(k);
    if (u?.ustamali == null) return { ustamali: null, taxminiy: false };
    const nomalum = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
    if (nomalum && u.ustamasiz === 0) return { ustamali: null, taxminiy: false };
    return { ustamali: nomalum ? u.ustamali + u.nomalum.summa : u.ustamali, taxminiy: nomalum };
  };
  const mRef = useRef<F2Malumot>({ ...malumot, ustamali }); mRef.current = { ...malumot, ustamali };
  const aRef = useRef(amallar); aRef.current = amallar;
  const narxlar = useRef<NarxRuxsat>(new Map());

  const vositalar = useMemo((): SahifaVositalar => {
    const narxManbalari = async (r: F2Resurs): Promise<F2NarxVarianti[]> => {
      const [v] = await narxTakliflari(obyektId, [{ nom: r.nom, birlik: r.birlik ?? '' }]);
      return (v ?? []).filter((x) => Number.isFinite(x.narx) && x.narx >= 0).slice(0, 8).map((x) => ({ narx: x.narx, manba: MANBA[x.manba] ?? x.manba, izoh: x.izoh || null }));
    };
    return {
      sahifa: 'f2',
      kontekst: () => f2Kontekst(mRef.current),
      oqi: (s) => f2Oqi(mRef.current, s, narxlar.current, { narxManbalari }),
      tekshir: (a) => f2AmalTekshir(mRef.current, a, narxlar.current),
      nomi: (a) => `${t(F2_AMAL_NOMI[a.tur] ?? a.tur)}${f2AmalTafsiloti(mRef.current, a)}`,
      bajar: async (list: SahifaAmal[]) => {
        const m = mRef.current; const A = aRef.current; const ind = f2Indeks(m); const out: string[] = [];
        let hajm = 0; let narx = 0;
        for (const a of list) {
          if (f2AmalTekshir(m, a, narxlar.current)) { out.push(`✗ ${t('O‘tkazildi: qator topilmadi yoki taklif yaroqsiz')}`); continue; }
          if (a.tur === 'faktdan_ol') {
            const kalit = f2Kalit(a.qiymat ?? a.qator);
            const bs = f2OlinadiganBolimlar(m, kalit);
            A.bolimniOl(bs);
            out.push(`✓ ${t('Faktdan mumkin hajm kiritmaga olindi: {n} bo‘lim', { n: bs.length })}`);
            continue;
          }
          const j = a.qator != null ? ind.get(a.qator) : undefined;
          if (!j) continue;
          if (a.tur === 'f2_hajm') { A.hajm(a.qator!, sonMatn(Number(String(a.qiymat).replace(/\s/g, '').replace(',', '.')))); hajm++; }
          else if (a.tur === 'narx') {
            if ((a.qiymat ?? '').trim().toLowerCase() === 'narxsiz') A.narxsiz(a.qator!);
            else A.narx(a.qator!, sonMatn(Number(String(a.qiymat).replace(/\s/g, '').replace(',', '.'))));
            narx++;
          } else if (a.tur === 'korsat') A.korsat(j.tur === 'ish' ? (j.ish.kod || j.ish.nom) : (j.r.kod || j.r.nom));
        }
        if (hajm) out.push(`✓ ${t('{n} ta F2 hajmi kiritmaga tushdi — tekshiring', { n: hajm })}`);
        if (narx) out.push(`✓ ${t('{n} ta narx kiritmaga tushdi (manba ko‘rsatilgan)', { n: narx })}`);
        if (out.some((x) => x.startsWith('✓'))) out.push(t('Qoralama F2 yaratish — sahifadagi tugma bilan (Ctrl+Enter).'));
        return out;
      },
    };
  }, [obyektId]);

  return <AiYordamchiPanel kompaniyaId={kompaniyaId} vositalar={vositalar} saqlashKalit={`f2:${kompaniyaId}:${obyektId}`}
    qoshimcha={<F2AiRejaBolim bolimlar={malumot.bolimlar} kompaniyaId={kompaniyaId}
      onQoshish={(hajm) => { for (const [id, v] of Object.entries(hajm)) amallar.hajm(Number(id), v); }} />}
    sarlavha={t('F2 AI yordamchisi')}
    namunalar={[t('Qaysi uchastkada F2 ga olinadigan hajm bor?'), t('Joriy F2 ni tekshir: narxsiz va xatolar'), t('F2 summasini ustamasiz va ustamali tushuntir'), t('Narxi yo‘q resurslarga narx manbalarini top')]} />;
}
