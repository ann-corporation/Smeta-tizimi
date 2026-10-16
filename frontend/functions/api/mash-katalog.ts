/**
 * mash-katalog.ts — official machine-hour price list (Перечень усреднённых прогнозируемых цен маш.-часа, без НДС; owner's
 * PDF of 01.01.2026). GET ?f=current | ?rev=<16 hex> → {manba, rows:[{n, nom, narx, sahifa}]}.
 */
import { malumotnomaGet } from '../_shared/r2-malumotnoma';

export const onRequestGet = malumotnomaGet('mash-katalog', 'MASH_CATALOG');
