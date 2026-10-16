/**
 * LRV: «по проекту» resurslarning loyiha materiali (egasi 2026-10-16). Normada «БЕТОН (КЛАСС ПО ПРОЕКТУ)», «АРМАТУРА ... КЛАСС
 * И ДИАМЕТР ПО ПРОЕКТУ» — smetaga aniq material yoziladi ("Бетон B20", "Арматура A500C Ø12"). Kiritilmaguncha resurs
 * narxlanmaydi. Bir ishda bir nechta bo'lsa ";" bilan: "Кирпич керамический М100; Раствор цементный М100".
 */
import { useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc, Occurrence } from '../../lib/smeta-studio/model';
import { loyihaBoyicha, talabMateriali } from '../../lib/smeta-studio/loyiha-material';

const loyihaResurslari = (o: Occurrence) => o.recipe.map(r => o.overrides[r.recipeId]?.substitution?.resource ?? r.resource).filter(r => r && loyihaBoyicha(r.name));

export function MateriallarPaneli({ doc, command }: { doc: EstimateDoc; command: (c: StudioCommand) => boolean }) {
  const works = Object.values(doc.occurrences).filter(o => loyihaResurslari(o).length);
  if (!works.length) return null;
  const yetishmaydi = works.filter(o => loyihaResurslari(o).some(r => !talabMateriali(o.material, r!.name))).length;
  return <section aria-label={t('Loyiha materiallari')} className="karta space-y-2 p-2 text-[12.5px]">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Loyiha materiallari («по проекту»)')}</strong>
      <span className={`text-xs ${yetishmaydi ? 'text-danger' : 'text-ok'}`}>{yetishmaydi ? t('{n} ishda material ko‘rsatilmagan — smetaga va narxlashga kirmaydi', { n: yetishmaydi }) : t('Hammasi ko‘rsatilgan')}</span>
    </div>
    {works.map(o => <MaterialQatori key={o.id} o={o} command={command} />)}
  </section>;
}

function MaterialQatori({ o, command }: { o: Occurrence; command: (c: StudioCommand) => boolean }) {
  const [qiymat, setQiymat] = useState(o.material ?? '');
  useEffect(() => setQiymat(o.material ?? ''), [o.material]);
  const res = loyihaResurslari(o);
  return <div className="rounded border border-border p-1.5">
    <p className="font-medium"><span className="font-mono text-accent">{o.source.code}</span> {o.source.name}</p>
    <ul className="mt-0.5 space-y-0.5 text-[11.5px]">{res.map((r, i) => {
      const tm = talabMateriali(o.material, r!.name);
      return <li key={i}>{r!.name} → {tm ? <b className="text-ok">{tm.toUpperCase()}</b> : <span className="text-danger">{t('ko‘rsatilmagan')}</span>}</li>;
    })}</ul>
    <form className="mt-1 flex flex-wrap gap-1" onSubmit={e => { e.preventDefault(); command({ type: 'SET_MATERIAL', occurrenceId: o.id, material: qiymat.trim() || null }); }}>
      <input aria-label={t('Loyiha materiali')} className="input h-7 flex-1 min-w-[240px] text-[11.5px]" value={qiymat} onChange={e => setQiymat(e.target.value)}
        placeholder={t('Masalan: Бетон B20; Арматура A500C Ø12')} />
      <button type="submit" className="tugma h-7 px-2 text-[11.5px]" disabled={(o.material ?? '') === qiymat.trim()}>{t('Saqlash')}</button>
    </form>
  </div>;
}
