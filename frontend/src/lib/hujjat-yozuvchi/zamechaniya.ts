/**
 * «Замечания (служебный)» varag'i — hujjat tanasiga chiqmasligi kerak bo'lgan ichki ogohlantirishlar (hal qilinmagan joylar, H7).
 * Egasi 2026-11-14: buyurtmachiga beriladigan F-3 / nakopitelniy varag'ida «итог неполный» va yuzlab «нет стоимости по смете» qatori bo'lmasin —
 * ular shu xizmat varag'iga (chop etilmaydi) tushadi. Bir xil sababli qatorlar bitta qatorga (soni bilan, 3 tagacha misol) guruhlanadi.
 */
import { RasmiyVaraq } from './rasmiy';

export type Zamechanie = { nom: string; sabab: string };

/** Bir xil sababli qatorlar bitta qatorga (soni bilan, 3 tagacha nom misol). */
export function diqqatGuruh(d: ReadonlyArray<Zamechanie>): Zamechanie[] {
  const g = new Map<string, string[]>();
  for (const x of d) { const a = g.get(x.sabab) ?? []; a.push(x.nom); g.set(x.sabab, a); }
  return [...g.entries()].map(([sabab, noms]) => noms.length === 1
    ? { nom: noms[0], sabab }
    : { nom: `${noms.length} позиций (например: ${noms.slice(0, 3).join('; ')}${noms.length > 3 ? ' …' : ''})`, sabab });
}

/** Xizmat varag'i (bo'sh ro'yxat — null). `davrMatni` — «за отчетный месяц май 2026 г.» kabi ost sarlavha. */
export function zamechaniyaVaraq(items: ReadonlyArray<Zamechanie>, davrMatni: string): RasmiyVaraq | null {
  if (!items.length) return null;
  const v = new RasmiyVaraq({
    nom: 'Замечания (служебный)', kattaHarf: false, muzlatma: false,
    sarlavha: 'ЗАМЕЧАНИЯ К СПРАВКЕ — СЛУЖЕБНЫЙ ЛИСТ (в документ для заказчика не входит)',
    ostSarlavha: [davrMatni],
    ustunlar: [{ sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' }, { sarlavha: 'Позиция', kenglik: 70, tur: 'matn' }, { sarlavha: 'Причина', kenglik: 80, tur: 'matn' }],
    yonalish: 'landscape',
  });
  items.forEach((d, i) => v.qator('oddiy', [i + 1, d.nom, d.sabab]));
  return v;
}
