/** Pure types of the price catalogue (no runtime/browser dependencies — safe for Pages Functions). */
/** Shape of the former t2_platforma_narx_manba_qator view row. */
export type KatalogQatori = {
  id: number; manba_id: number; kod: string | null; nom: string; birlik: string | null; narx: number | null; hudud: string | null;
  ishlab_chiqaruvchi: string | null; nds_holati: string | null; nds_izoh: string | null; yil: number | null; kvartal: number | null;
  narx_varianti: string | null; guruh: string | null; hudud_kalit: string | null; manba_nom: string; manba_tur: string;
};
