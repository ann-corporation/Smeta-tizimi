/**
 * TS equivalents of the database key functions used for catalogue ↔ smeta price matching.
 *   t2_resurs_nom_kalit(v)    = regexp_replace(replace(upper(coalesce(v,'')),'Ё','Е'),'[^0-9A-ZА-Я]','','g')
 *   t2_resurs_birlik_kalit(v) = regexp_replace(replace(replace(upper(coalesce(v,'')),'³','3'),'²','2'),'[[:space:][:punct:]]','','g')
 * The shard builder checks these against the stored DB keys for every catalogue row and ships
 * an explicit override for any row where they differ, so matching never depends on a guess.
 */
export function nomKalit(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^0-9A-ZА-Я]/g, '');
}

// POSIX [:punct:] in the C/UTF-8 locale = ASCII punctuation; plus Unicode punctuation for safety is NOT
// applied (it would diverge from Postgres). Space class = Unicode whitespace.
const ASCII_PUNCT = /[!-/:-@[-`{-~]/g;
export function birlikKalit(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/³/g, '3').replace(/²/g, '2').replace(/\s/g, '').replace(ASCII_PUNCT, '');
}
