/** Tizim imzosidagi «kim yaratdi» — sessiyadan (useSessiya) yoziladi. Alohida fayl: asosiy bundlega fflate kirmasin. */
let joriy: string | null = null;

export function tizimImzoFoydalanuvchi(nom: string | null | undefined): void {
  joriy = nom?.trim() || null;
}

export function tizimImzoJoriyFoydalanuvchi(): string | null {
  return joriy;
}
