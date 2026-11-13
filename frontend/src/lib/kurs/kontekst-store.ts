/** Joriy kurs konteksti (rol, ruxsat): AdminShell dagi KursYordam o‘rnatadi, Jarvis repetitori o‘qiydi (PTO ga buxgalter darsi aytilmasin). */
import type { KursKontekst } from './yol';

let joriy: KursKontekst | null = null;

export const kursKontekstOrnat = (k: KursKontekst | null): void => { joriy = k; };
export const joriyKursKontekst = (): KursKontekst | null => joriy;
