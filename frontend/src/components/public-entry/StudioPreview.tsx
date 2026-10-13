import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { EntryCopy } from './product-scope';

/**
 * Hero preview of the estimate studio's real workflow (LRV → pricing → RES), drawn in HTML so it stays sharp and
 * readable at any size. The figures are an explicitly labelled SAMPLE, not customer data.
 */
type Row = { code: string; name: string; unit: string; value: string; note?: EntryCopy };
const steps: readonly { id: string; title: EntryCopy; hint: EntryCopy; rows: readonly Row[]; total?: EntryCopy }[] = [
  { id: 'lrv', title: ['1 · LRV', '1 · ЛРВ', '1 · LRV'], hint: ['Ishni oddiy so‘z bilan yozing — AI normativ ishlarga ajratadi.', 'Опишите работу словами — AI разложит её на нормативные работы.', 'Describe the work in words — AI splits it into normative works.'],
    rows: [
      { code: 'E6-1-1-1', name: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', unit: '100 м3', value: '0,0288' },
      { code: 'E6-1-97-1', name: 'УСТАНОВКА АРМАТУРЫ', unit: 'т', value: '1,85' },
      { code: 'E6-1-1-22', name: 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ ЖЕЛЕЗОБЕТОННЫХ', unit: '100 м3', value: '0,3456', note: ['koeffitsient taklifi · 1,15 · tekshiriladi', 'предложен коэффициент · 1,15 · на проверке', 'coefficient proposal · 1.15 · under review'] },
    ] },
  { id: 'price', title: ['2 · Narxlash', '2 · Расценка', '2 · Pricing'], hint: ['AI resursni ma’nosi bo‘yicha katalogdan topadi, har narx manbasi bilan.', 'AI находит ресурс в каталоге по смыслу, у каждой цены есть источник.', 'AI finds each resource in the catalogue by meaning; every price keeps its source.'],
    rows: [
      { code: 'МАТ', name: 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', unit: 'м3', value: '90 000', note: ['katalog · 2026-1kv · NDS siz', 'каталог · 2026-1кв · без НДС', 'catalogue · 2026 Q1 · VAT-free'] },
      { code: 'МАТ', name: 'БЕТОН ТЯЖЕЛЫЙ, КЛАСС В15', unit: 'м3', value: '525 672', note: ['klass B15 tekshirildi', 'класс В15 проверен', 'class B15 verified'] },
      { code: 'ЧЕЛ', name: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', unit: 'чел-ч', value: '26 820', note: ['hudud stavkasi', 'ставка региона', 'regional rate'] },
    ] },
  { id: 'res', title: ['3 · RES', '3 · РЕС', '3 · RES'], hint: ['Stavkalar tasdiqlanadi, RES tirik formulalar bilan yuklanadi.', 'Ставки утверждаются, РЕС выгружается с живыми формулами.', 'Rates are confirmed; the RES downloads with live formulas.'],
    rows: [
      { code: '', name: 'ПРЯМЫЕ ЗАТРАТЫ', unit: 'сум', value: '40 232 494' },
      { code: '18%', name: 'ПРОЧИЕ РАСХОДЫ ПОДРЯДЧИКА', unit: 'сум', value: '7 586 118' },
      { code: '12%', name: 'НДС', unit: 'сум', value: '5 986 843' },
    ], total: ['Jami to‘lovga: 55 877 198 so‘m', 'Всего к оплате: 55 877 198 сум', 'Total payable: 55,877,198 UZS'] },
];

export function StudioPreview({ local }: { local: (c: EntryCopy) => string }) {
  const [active, setActive] = useState(0);
  const s = steps[active];
  return <div className="entry-studio" aria-label={local(['Smeta studiyasi namunasi', 'Пример сметной студии', 'Estimate studio sample'])}>
    <div className="entry-studio-top"><Sparkles size={15} aria-hidden="true" /><strong>{local(['Smeta studiyasi', 'Сметная студия', 'Estimate studio'])}</strong>
      <span>{local(['namuna', 'пример', 'sample'])}</span></div>
    <div className="entry-studio-tabs" role="tablist">{steps.map((x, i) =>
      <button key={x.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)}>{local(x.title)}</button>)}</div>
    <p className="entry-studio-hint">{local(s.hint)}</p>
    <ul className="entry-studio-rows">{s.rows.map(r => <li key={r.name}>
      <div><b>{r.code}</b><span>{r.name}</span>{r.note && <small>{local(r.note)}</small>}</div>
      <em>{r.value}<i>{r.unit}</i></em>
    </li>)}</ul>
    {s.total && <p className="entry-studio-total">{local(s.total)}</p>}
  </div>;
}
