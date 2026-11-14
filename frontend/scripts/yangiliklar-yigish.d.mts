export type YangilikYozuv = { id: number; sana: string; sarlavha: string; bandlar: string[] };
export function yangilikFayllari(dir: string): string[];
export function yangiliklarniYig(dir: string): { izoh: string; yozuvlar: YangilikYozuv[] };
