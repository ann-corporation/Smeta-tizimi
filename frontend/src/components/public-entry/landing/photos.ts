/** Egasi tasdiqlagan obyekt suratlari (webp, EXIF siz). Tasdiqdan oldin bo'sh — bo'lim chizilmaydi. */
export type LandingPhoto = { id: string; src: string; srcSet: string; w: number; h: number; alt: string; wide?: boolean };
export const landingPhotos: readonly LandingPhoto[] = [];
