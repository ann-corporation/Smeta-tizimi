/**
 * «Tavsiflab qidirish» (egasi 2026-10-25): oddiy so'z bilan yoziladi (masalan «bloklar o'rniga g'isht terish, 25 sm»)
 * → AI mos NORMATIV pozitsiyalarni taklif qiladi, foydalanuvchi bittasini tanlaydi.
 *
 * Mavjud Smetachi AI qatlami (/api/smeta-ai `tanla`, kompaniya AI byudjeti va hisobi bilan) ishlatiladi:
 * nomzodlar BRAUZERDA normativ katalogdan olinadi (ma'no bo'yicha), model faqat shular orasidan tanlaydi yoki
 * yangi normativ iboralar beradi (2-qidiruv). Model bermagan/katalogda yo'q shifr hech qachon ko'rsatilmaydi.
 * AI hech narsa yozmaydi — tanlangan pozitsiya katalog panelida ochiladi, foydalanuvchi o'zi qabul qiladi.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { t } from '../../i18n/til';
import type { StudioNormCatalog } from '../../lib/catalog-extraction/norm-library';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';
import { manoBoyichaIshlar, nomzodlarTop } from '../../lib/smeta-ai/worker';
import { birlikNormal, type Birlik, type Tanlov, type TanlovNomzodi } from '../../lib/smeta-ai/protokol';
import { smetachiTanla } from '../../api/smeta-ai';
import { katalogIshi } from '../../lib/fakt-normativ';

/** Nomzodlarni birlashtirish (takrorsiz, tartib saqlanadi), ≤ 15 (server chegarasi). */
function birlashtir(...royxat: TanlovNomzodi[][]): TanlovNomzodi[] {
  const out: TanlovNomzodi[] = []; const bor = new Set<string>();
  for (const r of royxat) for (const n of r) if (!bor.has(n.id)) { bor.add(n.id); out.push(n); }
  return out.slice(0, 15);
}

export function NormativAiQidiruv({ katalog, kompaniyaId, birlik, boshlangich = '', onTanla }: {
  katalog: StudioNormCatalog; kompaniyaId: number;
  /** Kutilgan ish birligi (asl qator / forma) — mos birlikdagi pozitsiyalar yuqoriga chiqadi. */
  birlik: string | null;
  boshlangich?: string;
  onTanla: (w: NormWork) => void;
}) {
  const [tavsif, setTavsif] = useState(boshlangich);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [natija, setNatija] = useState<{ nomzodlar: TanlovNomzodi[]; tanlov: Tanlov | null } | null>(null);

  const izla = async () => {
    const matn = tavsif.trim();
    if (matn.length < 3 || band) return;
    setBand(true); setXato(''); setNatija(null);
    try {
      const b = birlikNormal(birlik);
      const sorov = (nomzodlar: TanlovNomzodi[], qidiruv?: string[]) => [{ id: 'z1', tavsif: matn, birlik: (b ?? '') as Birlik, material: null, nomzodlar, ...(qidiruv?.length ? { qidiruv } : {}) }];
      let nomzodlar = manoBoyichaIshlar(katalog, matn, 15);
      let r = await smetachiTanla(kompaniyaId, sorov(nomzodlar));
      if (!r.ok) { setXato(r.message || t('AI javob bermadi ({kod}). Katalog daraxtidan tanlang.', { kod: r.code })); return; }
      let tanlov: Tanlov | null = r.tanlovlar[0] ?? null;
      // Model normativ iboralar berdi (o'zbekcha tavsif katalog tilida emas) → 2-qidiruv shu iboralar bilan.
      if (!tanlov?.ishId && tanlov?.qidiruv?.length) {
        const qidiruv = tanlov.qidiruv;
        const yangi = b ? nomzodlarTop(katalog, { qidiruv, birlik: b, tavsif: matn }, 15) : birlashtir(...qidiruv.map((q) => manoBoyichaIshlar(katalog, q, 10)));
        if (yangi.length) {
          nomzodlar = birlashtir(yangi, nomzodlar);
          r = await smetachiTanla(kompaniyaId, sorov(nomzodlar, qidiruv));
          if (r.ok) tanlov = r.tanlovlar[0] ?? tanlov;
        }
      }
      // Faqat yuborilgan (katalogdagi) nomzodlardan biri tavsiya bo'la oladi.
      if (tanlov?.ishId && !nomzodlar.some((n) => n.id === tanlov!.ishId)) tanlov = { ...tanlov, ishId: null };
      const tanlanganId = tanlov?.ishId;
      const tartib = tanlanganId ? [...nomzodlar.filter((n) => n.id === tanlanganId), ...nomzodlar.filter((n) => n.id !== tanlanganId)] : nomzodlar;
      setNatija({ nomzodlar: tartib, tanlov });
    } catch { setXato(t('AI javob bermadi. Katalog daraxtidan tanlang.')); }
    finally { setBand(false); }
  };

  const och = (n: TanlovNomzodi) => { const w = katalogIshi(katalog, n.id, n.kod); if (w) onTanla(w); else setXato(t('Pozitsiya katalogda topilmadi.')); };

  return <div className="space-y-2" data-testid="normativ-ai">
    <p className="text-[11px] text-text-mute">{t('Oddiy so‘z bilan yozing — AI normativ katalogdagi mos pozitsiyalarni taklif qiladi. AI hech narsa yozmaydi: siz tanlaysiz.')}</p>
    <div className="flex gap-2">
      <input value={tavsif} onChange={(e) => setTavsif(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void izla(); } }}
        placeholder={t('masalan: bloklar o‘rniga g‘isht terish, 25 sm')} aria-label={t('Ishni tavsiflang')} className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none focus:border-accent" />
      <button type="button" onClick={() => void izla()} disabled={band || tavsif.trim().length < 3} className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
        <Sparkles size={13} /> {band ? t('Qidirilmoqda…') : t('AI bilan topish')}</button>
    </div>
    {xato && <p role="alert" className="text-[12px] text-warn">{xato}</p>}
    {natija && <div className="rounded border border-border">
      {natija.nomzodlar.length === 0 && <p className="p-2 text-[12px] text-text-mute">{t('Mos pozitsiya topilmadi — tavsifni aniqlashtiring yoki katalog daraxtidan tanlang.')}</p>}
      {natija.nomzodlar.map((n) => { const ai = natija.tanlov?.ishId === n.id;
        return <div key={n.id} className={`flex items-start gap-2 border-b border-border/60 px-2 py-1.5 text-[12px] ${ai ? 'bg-accent/[.06]' : ''}`} data-testid={ai ? 'ai-tavsiya' : 'ai-nomzod'}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-[11px] text-accent">{n.kod}</span><span className="text-text">{n.nom}</span>{n.birlik && <span className="text-text-mute">{n.birlik}</span>}</div>
            {n.jadval && <div className="truncate text-[10px] text-text-mute" title={n.jadval}>{n.jadval}</div>}
            {ai && <div className="mt-0.5 text-[11px] text-accent"><Sparkles size={11} className="inline" /> {t('AI tavsiyasi')}{natija.tanlov?.sabab ? `: ${natija.tanlov.sabab}` : ''}</div>}
          </div>
          <button type="button" onClick={() => och(n)} className="shrink-0 rounded border border-accent/50 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10" aria-label={t('Pozitsiyani ochish: {kod}', { kod: n.kod })}>{t('Ochish')}</button>
        </div>; })}
      {natija.nomzodlar.length !== 0 && !natija.tanlov?.ishId && <p className="p-2 text-[11px] text-text-mute">{t('AI aniq tanlov qilmadi{sabab} — ro‘yxatdan o‘zingiz tanlang.', { sabab: natija.tanlov?.sabab ? ` (${natija.tanlov.sabab})` : '' })}</p>}
    </div>}
  </div>;
}
