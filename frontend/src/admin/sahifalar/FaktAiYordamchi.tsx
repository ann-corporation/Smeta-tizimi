/**
 * Fakt oynasi AI yordamchisi: umumiy AiYordamchiPanel + fakt vositalari (lib/ai-yordamchi/fakt-vositalar).
 * Bajarish — faqat mavjud yo'llar: kiritmaga yozish (saqlash — foydalanuvchi, Ctrl+S), mavjud zamena / «bajarilmaydi»
 * oynalari (u yerda foydalanuvchi «Saqlash» ni bosadi). AI to'g'ridan-to'g'ri hech narsa yozmaydi; asl smeta o'zgarmaydi.
 */
import { useMemo, useRef } from 'react';
import { t } from '../../i18n/til';
import { AiYordamchiPanel } from '../../umumiy/ui/ai-yordamchi/AiYordamchiPanel';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import type { SahifaVositalar } from '../../lib/ai-yordamchi/sikl';
import type { SahifaAmal } from '../../lib/ai-yordamchi/protokol';
import { FAKT_AMAL_NOMI, faktAmalTafsiloti, faktAmalTekshir, faktHajmOqi, faktIndeks, faktKontekst, faktOqi, type FaktMalumot, type UstamaliFn } from '../../lib/ai-yordamchi/fakt-vositalar';
import type { JurnalQator, Kiritma } from '../../lib/fakt-jurnal';
import { normKatalogOch } from '../../lib/fakt-normativ';
import { manoBoyichaIshlar } from '../../lib/smeta-ai/worker';

export type FaktAiAmallar = {
  kirit: (id: number, k: Kiritma) => void;
  materiallarniOl: (ishIdlar: readonly number[]) => void;
  korsat: (q: JurnalQator) => void;
  zamena: (q: JurnalQator, normativId: string | null) => void;
  bajarilmaydi: (q: JurnalQator, hajm: number | null) => void;
};

/** Normativ katalogdan ma'no bo'yicha nomzodlar (Studio va zamena oynasi bilan bir xil katalog, AI chaqiruvisiz). */
async function normativNomzodlar(tavsif: string) {
  const k = await normKatalogOch();
  return manoBoyichaIshlar(k, tavsif, 12).map((n) => ({ id: n.id, kod: n.kod, nom: n.nom, birlik: n.birlik, jadval: n.jadval ?? null }));
}

export function FaktAiYordamchi({ kompaniyaId, obyektId, malumot, amallar }: {
  kompaniyaId: number; obyektId: number; malumot: Omit<FaktMalumot, 'ustamali'>; amallar: FaktAiAmallar;
}) {
  const h = useUstamaliSumma(obyektId, { kompaniyaId });
  const ustamali: UstamaliFn = (s) => {
    const u = h.hisobla(s.kesim);
    if (u?.ustamali == null) return { ustamali: null, taxminiy: false };
    const nomalum = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
    if (nomalum && u.ustamasiz === 0) return { ustamali: null, taxminiy: false };
    return { ustamali: nomalum ? u.ustamali + u.nomalum.summa : u.ustamali, taxminiy: nomalum };
  };
  const m: FaktMalumot = { ...malumot, ustamali };
  const mRef = useRef(m); mRef.current = m;
  const aRef = useRef(amallar); aRef.current = amallar;
  /** Normativ vositasi bergan pozitsiyalar — zamena faqat shulardan (katalogda BOR). */
  const normativlar = useRef(new Set<string>());

  const vositalar = useMemo((): SahifaVositalar => ({
    sahifa: 'fakt',
    kontekst: () => faktKontekst(mRef.current),
    oqi: (s) => faktOqi(mRef.current, s, normativlar.current, { normativ: normativNomzodlar }),
    tekshir: (a) => faktAmalTekshir(mRef.current, a, normativlar.current),
    nomi: (a) => `${t(FAKT_AMAL_NOMI[a.tur] ?? a.tur)}${faktAmalTafsiloti(mRef.current, a)}`,
    bajar: async (list: SahifaAmal[]) => {
      const ind = faktIndeks(mRef.current); const A = aRef.current; const out: string[] = [];
      let kiritildi = 0; const matIshlar: number[] = []; let oyna = false;
      for (const a of list) {
        const j = a.qator != null ? ind.get(a.qator) : undefined;
        if (!j || faktAmalTekshir(mRef.current, a, normativlar.current)) { out.push(`✗ ${t('O‘tkazildi: qator topilmadi yoki taklif yaroqsiz')}`); continue; }
        if (a.tur === 'fakt_hajm') { const k = faktHajmOqi(a.qiymat); if (k) { A.kirit(j.q.id, k); kiritildi++; } }
        else if (a.tur === 'material_ol') matIshlar.push(j.q.id);
        else if (a.tur === 'korsat') A.korsat(j.q);
        else if (oyna) out.push(`• ${t('Keyingi oyna navbatda: {nom} — avvalgisini yopgach yordamchidan qayta so‘rang', { nom: j.q.nom })}`);
        else if (a.tur === 'zamena') { oyna = true; A.zamena(j.q, j.q.tur === 'bl' && a.qiymat ? a.qiymat.replace(/^N:/i, '') : null); out.push(`✓ ${t('Zamena oynasi ochildi — tekshirib «Saqlash» ni bosing')}`); }
        else if (a.tur === 'bajarilmaydi') { oyna = true; A.bajarilmaydi(j.q, a.qiymat ? Number(a.qiymat.replace(',', '.')) : null); out.push(`✓ ${t('«Bajarilmaydi» oynasi ochildi — sababni tanlab saqlang')}`); }
      }
      if (matIshlar.length) A.materiallarniOl(matIshlar);
      if (kiritildi) out.unshift(`✓ ${t('{n} ta fakt hajmi kiritmaga tushdi — tekshirib saqlang (Ctrl+S)', { n: kiritildi })}`);
      return out;
    },
  }), []);

  return <AiYordamchiPanel kompaniyaId={kompaniyaId} vositalar={vositalar} saqlashKalit={`fakt:${kompaniyaId}:${obyektId}`} sarlavha={t('Fakt AI yordamchisi')}
    namunalar={[t('Fakt nega kam? Qaysi bo‘limlar 0%?'), t('Qoldiqdan oshgan ishlarni ko‘rsat'), t('Beton ishlarini top'), t('F2 faktdan ko‘p bo‘lgan ishlar qaysi?')]} />;
}
