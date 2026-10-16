/**
 * koef-katalog.ts — normative work-condition coefficients (ШНК 4.02 technical parts; owner 2026-10-15: "koeffitsientlar
 * qo'llanadigan vaziyatlar uchun bo'lishi va taklif qilishi kerak"). GET ?f=current | ?rev=<16 hex> → {koef, jadval}.
 */
import { malumotnomaGet, malumotnomaKey } from '../_shared/r2-malumotnoma';

export const koefKatalogKey = (rev: string | null, f: string | null) => malumotnomaKey('koef-katalog', rev, f);
export const onRequestGet = malumotnomaGet('koef-katalog', 'KOEF_CATALOG');
