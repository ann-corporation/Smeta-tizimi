/**
 * AosrTaklif — ESKI reestrdan kelgan, smeta qatoriga bog'lanmagan АОСР lar uchun TAKLIFLAR.
 * Har akt uchun 1–3 faol smeta ishi taklif qilinadi (lib/aosr-taklif: ish turi + element + idf nom + razdel + fakt>0);
 * PTO BITTA bosish bilan tasdiqlaydi yoki boshqa qatorni tanlaydi; razdel bo'yicha ommaviy tasdiq ham bor.
 * Hech qachon o'zi bog'lamaydi: yozish faqat tugma bosilganda (`t2_aosr_bog_saqla`, sbAosrBogSaqla).
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Link2, Search } from 'lucide-react';
import { sbAosrBogSaqla, type AosrCoverage, type QatorMetaYozuv } from '../api/t2-aosr';
import type { AosrV2 } from '../api/t2-ijro';
import { bogChaqiruvlari, boglanmaganEskiAktlar, ishNomzodlari, razdelBoyicha, takliflarQur, type TaklifIsh } from '../lib/aosr-taklif';
import { toast } from '../umumiy/ui/Toast';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { t } from '../i18n/til';

type Props = { aktlar: AosrV2[]; qatorMeta: QatorMetaYozuv[]; coverage: AosrCoverage[]; onTayyor: () => void };

const KO_RSAT = 25;
const foiz = (b: number) => `${Math.round(b * 100)}%`;

function BoshqaQator({ ishlar, onTanla }: { ishlar: readonly TaklifIsh[]; onTanla: (id: number) => void }) {
  const [q, setQ] = useState('');
  const topilgan = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k.length < 2 ? [] : ishlar.filter((i) => i.nom.toLowerCase().includes(k)).slice(0, 10);
  }, [q, ishlar]);
  return (
    <details className="mt-1 text-[12px]">
      <summary className="cursor-pointer text-accent">{t('Boshqa qatorni tanlash')}</summary>
      <div className="mt-1 flex items-center gap-1"><Search size={12} aria-hidden="true" />
        <input aria-label={t('Smeta ishini qidirish')} className="h-7 w-full max-w-xs px-2 text-[12px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Smeta ishi nomidan qidiring…')} />
      </div>
      <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
        {topilgan.map((i) => (
          <li key={i.id}><button type="button" className="fz-btn fz-btn--ghost fz-btn--sm h-auto w-full justify-start text-left" onClick={() => onTanla(i.id)}>
            <span className="min-w-0 flex-1 truncate">{i.nom}</span><span className="text-text-mute">{i.razdelNom}</span></button></li>
        ))}
      </ul>
    </details>
  );
}

export function AosrTaklif({ aktlar, qatorMeta, coverage, onTayyor }: Props) {
  const [tanlov, setTanlov] = useState<Map<number, number>>(new Map());
  const [band, setBand] = useState(false);
  const [ko, setKo] = useState<Map<string, number>>(new Map());

  const eskiIds = useMemo(() => boglanmaganEskiAktlar(aktlar), [aktlar]);
  const aktXarita = useMemo(() => new Map(aktlar.map((a) => [a.id, a] as const)), [aktlar]);
  const faktQatorlar = useMemo(() => new Set(coverage.filter((c) => Number(c.fakt_hajm) > 0).map((c) => c.qator_id)), [coverage]);
  const ishlar = useMemo(() => ishNomzodlari(qatorMeta, faktQatorlar), [qatorMeta, faktQatorlar]);
  const ishXarita = useMemo(() => new Map(ishlar.map((i) => [i.id, i] as const)), [ishlar]);
  const takliflar = useMemo(() => takliflarQur(eskiIds.map((id) => aktXarita.get(id)!).filter(Boolean), ishlar), [eskiIds, aktXarita, ishlar]);
  const { guruhlar, taklifsiz } = useMemo(() => razdelBoyicha(eskiIds, takliflar), [eskiIds, takliflar]);

  if (eskiIds.length === 0 || ishlar.length === 0) return null;

  const tanlangan = (aktId: number): number | null => tanlov.get(aktId) ?? takliflar.get(aktId)?.[0]?.qatorId ?? null;

  /** Tasdiqlangan juftliklarni yozadi (har qator alohida chaqiruv — M:N kesishma bo'lmasin). */
  const bogla = async (juftlar: Array<{ aktId: number; qatorId: number }>) => {
    if (!juftlar.length || band) return;
    setBand(true);
    try {
      let n = 0; let xato = '';
      for (const c of bogChaqiruvlari(juftlar)) {
        const r = await sbAosrBogSaqla(c.aosrIds, c.qatorIds);
        if (!r.ok) { xato = r.error || t('Xato'); break; }
        n += c.aosrIds.length;
      }
      if (n) toast(t('✓ {n} ta akt smeta qatoriga bog‘landi', { n }), 'ok');
      if (xato) toast(t('Bog‘lanmadi: {x}', { x: xato }), 'danger');
      onTayyor();
    } finally { setBand(false); }
  };

  const bittasi = (aktId: number) => { const q = tanlangan(aktId); if (q != null) void bogla([{ aktId, qatorId: q }]); };
  const razdelHammasi = async (nom: string, ids: readonly number[]) => {
    const juftlar = ids.map((aktId) => ({ aktId, qatorId: tanlangan(aktId) })).filter((j): j is { aktId: number; qatorId: number } => j.qatorId != null);
    if (!juftlar.length) return;
    const ok = await tasdiqSora(t('«{nom}» razdeli: {n} ta aktni ko‘rsatilgan smeta qatorlariga bog‘laysizmi?', { nom: nom || t('Razdelsiz'), n: juftlar.length }));
    if (ok) await bogla(juftlar);
  };

  const aktSatr = (aktId: number) => {
    const a = aktXarita.get(aktId); if (!a) return null;
    const tk = takliflar.get(aktId) ?? [];
    const tan = tanlangan(aktId);
    const boshqa = tan != null && !tk.some((x) => x.qatorId === tan) ? ishXarita.get(tan) : null;
    return (
      <li key={aktId} className="border-t border-border py-2" data-testid="aosr-taklif-akt">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <b>№ {a.raqam ?? '—'}</b>
          <span className="min-w-0 flex-1 truncate" title={a.ish_nomi ?? ''}>{a.ish_nomi || t('(nomsiz akt)')}</span>
          <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || tan == null} onClick={() => bittasi(aktId)}><Link2 /> {t('Tasdiqlash')}</button>
        </div>
        <div className="mt-1 space-y-0.5" role="radiogroup" aria-label={t('Taklif qilingan smeta ishlari')}>
          {tk.map((x) => (
            <label key={x.qatorId} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="radio" name={`taklif-${aktId}`} checked={tan === x.qatorId} onChange={() => setTanlov((m) => new Map(m).set(aktId, x.qatorId))} />
              <span className="min-w-0 flex-1 truncate" title={`${x.nom} — ${x.razdelNom}`}>{x.nom}</span>
              <span className="text-text-mute">{x.razdelNom}</span>
              <span className="fz-chip" title={x.sabab.map((s) => t(s)).join(', ')}>{foiz(x.ball)}{x.faktBor ? ` · ${t('fakt bor')}` : ''}</span>
            </label>
          ))}
          {boshqa && (
            <label className="flex items-center gap-2 text-[12.5px]"><input type="radio" checked readOnly name={`taklif-${aktId}`} /><span className="min-w-0 flex-1 truncate">{boshqa.nom}</span><span className="text-text-mute">{boshqa.razdelNom}</span><span className="fz-chip">{t('o‘zingiz tanladingiz')}</span></label>
          )}
          {tk.length === 0 && !boshqa && <p className="m-0 text-[12px] text-text-mute">{t('Mos smeta ishi topilmadi — qatorni o‘zingiz tanlang.')}</p>}
        </div>
        <BoshqaQator ishlar={ishlar} onTanla={(id) => setTanlov((m) => new Map(m).set(aktId, id))} />
      </li>
    );
  };

  const kalitOl = (k: string) => ko.get(k) ?? KO_RSAT;
  const kolTaklifsiz = kalitOl('taklifsiz');
  const kengaytir = (k: string) => setKo((m) => new Map(m).set(k, kalitOl(k) + KO_RSAT));

  const yanaTugma = (jami: number, kol: number, k: string) => {
    if (jami <= kol) return null;
    return <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm mt-1" onClick={() => kengaytir(k)}>{t('Yana ko‘rsatish ({n})', { n: jami - kol })}</button>;
  };

  return (
    <section className="fz-card" aria-label={t('Eski aktlarni smeta qatoriga bog‘lash')} data-testid="aosr-taklif">
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-1.5"><CheckCircle2 size={16} className="text-accent" />{t('Eski aktlarni smeta qatoriga bog‘lash: {n} ta', { n: eskiIds.length })}</h2>
          <p className="fz-card__sub">{t('Har akt uchun mos smeta ishi taklif qilinadi. Hech narsa o‘zi bog‘lanmaydi — siz tasdiqlaysiz.')}</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {guruhlar.map((g) => {
          const k = String(g.razdelId ?? 'razdelsiz');
          const kol = kalitOl(k);
          return (
            <details key={k} className="group px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <ChevronDown size={14} className="text-text-mute transition-transform group-open:rotate-180" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{g.razdelNom || t('Razdelsiz ishlar')}</span>
                <span className="fz-chip fz-chip--warn">{t('{n} akt', { n: g.aktlar.length })}</span>
                <button type="button" disabled={band} className="fz-btn fz-btn--sm" onClick={(e) => { e.preventDefault(); void razdelHammasi(g.razdelNom, g.aktlar); }}><Link2 /> {t('Razdelni tasdiqlash ({n})', { n: g.aktlar.length })}</button>
              </summary>
              <ul className="m-0 mt-2 list-none p-0">{g.aktlar.slice(0, kol).map(aktSatr)}</ul>
              {yanaTugma(g.aktlar.length, kol, k)}
            </details>
          );
        })}
        {taklifsiz.length > 0 && (
          <details className="px-4 py-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-3"><span className="min-w-0 flex-1 text-[13px] font-medium">{t('Taklifsiz aktlar — qatorni o‘zingiz tanlang')}</span><span className="fz-chip">{taklifsiz.length}</span></summary>
            <ul className="m-0 mt-2 list-none p-0">{taklifsiz.slice(0, kolTaklifsiz).map(aktSatr)}</ul>
            {yanaTugma(taklifsiz.length, kolTaklifsiz, 'taklifsiz')}
          </details>
        )}
      </div>
    </section>
  );
}
