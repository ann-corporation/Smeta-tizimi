/**
 * smeta-flatten.ts — AktNode daraxtini kanonik import qatorlariga yoyadi.
 *
 * BITTA nusxa, ikki chaqiruvchi: Cloudflare Function (`/api/smeta-yukla`
 * ning eski bitta-o'tishli yo'li) va brauzer (bo'lakli yuborish uchun
 * qatorlarni O'ZI yoyishi kerak -- daraxtni bo'laklab bo'lmaydi, chunki
 * ota-bola aloqasi bo'lak chegarasidan o'tib ketadi).
 *
 * Tartib -- HUJJAT TARTIBI (pre-order): ota har doim bolasidan oldin
 * keladi va `tartib` ustuni shu ketma-ketlikni saqlaydi.
 */
import type { AktNode } from './f2-match-engine';

export interface SmetaFlatQator {
  local_id: string;
  parent_local_id: string | null;
  tur: string;
  kod: string | null;
  nom: string | null;
  birlik: string | null;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  /** T2-SMETA-NORMA-CASCADE-001: ish (bl) hajmiga nisbatan resurs sarfi
   *  normasi (T1 LRV faylining "Норма на единицу" ustuni, `treeBuild.ts`
   *  tomonidan node'ga tashib qo'yiladi). FAQAT 'rs' qatorlarida ma'noli
   *  -- boshqa turlarda backend buni baribir e'tiborsiz qoldiradi
   *  (`t2_smeta_import_yakunla_v1`/`_bulk_v1`), chunki `treeBuild.ts` rs
   *  bo'lmagan tugunlarga 0 qo'yadi, bu esa haqiqiy nol emas. */
  norma: number | null;
  /** ALL RES blok podvali isbotlagan kategoriya (faqat `kat_manba='hujjat_blok'` bilan; server shu qator uchun
   *  registr va beton trigger'idan ustun qo'yadi). Yo'q bo'lsa — kalit umuman yuborilmaydi (eski xatti-harakat). */
  kat?: string;
  kat_manba?: 'hujjat_blok';
}

export function smetaDaraxtniYoy(
  nodes: AktNode[], parentLocalId: string | null = null, out: SmetaFlatQator[] = [],
): SmetaFlatQator[] {
  for (const node of nodes) {
    const ext = node as unknown as { norma?: number; kat?: string; kat_manba?: string };
    const norma = ext.norma;
    out.push({
      local_id: node.uid, parent_local_id: parentLocalId, tur: node.type,
      kod: node.kod ?? null, nom: node.nom ?? null, birlik: node.bir ?? null,
      hajm: node.hajm ?? null, narx: node.narx ?? null, summa: node.summa ?? null,
      norma: node.type === 'rs' && norma ? norma : null,
      ...(ext.kat_manba === 'hujjat_blok' && ext.kat && (node.type === 'rs' || node.type === 'mat' || node.type === 'ob')
        ? { kat: ext.kat, kat_manba: 'hujjat_blok' as const } : {}),
    });
    if (node.children && node.children.length) smetaDaraxtniYoy(node.children, node.uid, out);
  }
  return out;
}

/** Qatorlarni teng bo'laklarga bo'ladi (oxirgisi kichikroq bo'lishi mumkin). */
export function bolaklarga<T>(rows: T[], bolakHajmi: number): T[][] {
  if (bolakHajmi <= 0) return rows.length ? [rows] : [];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += bolakHajmi) out.push(rows.slice(i, i + bolakHajmi));
  return out;
}
