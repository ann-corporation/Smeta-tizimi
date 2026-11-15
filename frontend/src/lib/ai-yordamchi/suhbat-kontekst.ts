/** Bounded context selection, not a replacement for canonical full conversation storage. */
export type KontekstXabar = { rol: 'user' | 'assistant'; matn: string };
export const KONTEKST_XABAR_MAX = 16;
export const KONTEKST_MATN_MAX = 6000;
export const KONTEKST_JAMI_MAX = 24000;
export function suhbatKonteksti(raw: unknown): { xabarlar: KontekstXabar[]; tashlangan: number; qisqartirilgan: boolean } {
  if (!Array.isArray(raw)) return { xabarlar: [], tashlangan: 0, qisqartirilgan: false };
  // Read a bounded prefix and tail, preserving the initial goal and recent exchanges.
  const indexes = [...new Set([...Array.from({length:Math.min(32,raw.length)},(_,i)=>i), ...Array.from({length:Math.min(128,raw.length)},(_,i)=>Math.max(0,raw.length-128)+i)])].sort((a,b)=>a-b);
  const valid = indexes.flatMap(index => {
    const r=raw[index];
    if (!r || typeof r !== 'object' || (r.rol !== 'user' && r.rol !== 'assistant') || typeof r.matn !== 'string' || !r.matn.trim()) return [];
    const cut=r.matn.length>KONTEKST_MATN_MAX;
    const matn=cut ? r.matn.slice(0,KONTEKST_MATN_MAX-24)+'\n[TRUNCATED BY LIMIT]' : r.matn;
    return [{index,cut,x:{rol:r.rol as KontekstXabar['rol'],matn}}];
  });
  const goal=valid.find(r=>r.x.rol==='user');
  const selected=goal?[goal]:[];let size=goal?.x.matn.length??0;
  for(let i=valid.length-1;i>=0;i--){
    const r=valid[i];if(r===goal)continue;
    if(selected.length>=KONTEKST_XABAR_MAX)break;
    if(size+r.x.matn.length>KONTEKST_JAMI_MAX)continue;
    selected.push(r);size+=r.x.matn.length;
  }
  selected.sort((a,b)=>a.index-b.index);
  return {xabarlar:selected.map(r=>r.x),tashlangan:raw.length-selected.length,qisqartirilgan:selected.some(r=>r.cut)};
}
