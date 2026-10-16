/**
 * «По проекту» resurslar (egasi 2026-10-16: "smetada «БЕТОН (КЛАСС ПО ПРОЕКТУ)» turishi — eng yomoni"). Normada sinf/marka
 * ochiq qoldirilgan resurs smetaga loyihadagi aniq material bilan yoziladi ("БЕТОН B20"); material ko'rsatilmaguncha u
 * narxlanmaydi va LRV da belgilanadi. Material ishga biriktiriladi (Occurrence.material, bir nechta bo'lsa ";" bilan).
 */
import { characteristics, normName } from './resource-match';

const LOYIHA_BOYICHA = /ПО\s+ПРОЕКТ|КЛАСС\s+ПО|МАРК[АИ]\s+ПО/;
/** «БЕТОН (КЛАСС ПО ПРОЕКТУ)», «АРМАТУРА ... КЛАСС И ДИАМЕТР ПО ПРОЕКТУ», «РАЗМЕР И МАРКА ПО ПРОЕКТУ». */
export const loyihaBoyicha = (resursNom: string | null | undefined) => LOYIHA_BOYICHA.test(normName(resursNom));

/**
 * The part of the work's material that belongs to this resource: "Раствор цементный М100; кирпич глиняный" → for
 * «КИРПИЧ ... ПО ПРОЕКТУ» the brick part. Same product word = same resource. A comma splits only before a word ("B7,5").
 */
export function talabMateriali(material: string | null | undefined, resursNom: string | null | undefined): string | null {
  if (!material?.trim() || !loyihaBoyicha(resursNom)) return null;
  const parts = material.split(/;|,(?=\s*[A-Za-zА-Яа-яЁё])/).map(s => s.trim()).filter(Boolean);
  const bosh = characteristics(resursNom).words[0]?.slice(0, 4);
  return parts.find(p => characteristics(p).words.some(w => w.slice(0, 4) === bosh)) ?? null;
}

/** The name an estimate shows: the project material in capitals instead of «… ПО ПРОЕКТУ». */
export function resursNomi(resursNom: string | null | undefined, material: string | null | undefined): string {
  const t = talabMateriali(material, resursNom);
  return t ? t.toUpperCase() : resursNom ?? '';
}
