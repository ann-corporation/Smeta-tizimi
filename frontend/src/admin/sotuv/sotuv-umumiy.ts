/**
 * Uy sotish ekranlari uchun umumiy (komponent bo'lmagan) bo'laklar: ruxsatlar, nomlar (t()), maydon uslublari, xato matni.
 * Komponentlar (Pul, Ixcham, Maydon, Sana) — umumiy.tsx.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sotuvXato, type BirlikHolat, type Bosqich, type TolovTuri, type TolovUsul } from '../../api/t2-sotuv';
import type { IxchamBirlik } from '../../lib/sotuv/shaxmatka-korinish';
import type { Manba } from '../../lib/sotuv/bitim-korinish';

export const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent disabled:opacity-60';
export const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

export type SotuvRuxsat = { oqish: boolean; yozish: boolean; narx: boolean; tolov: boolean };

/** Foydalanuvchi imkoniyatlari (menyu/tugma ko'rinishi; yakuniy tekshiruv — server RPC ichida). */
export function useSotuvRuxsat(): SotuvRuxsat & { kompaniyaId: number | null } {
  const k = useKompaniya();
  const p = k.joriy?.permissions ?? [];
  const bor = (c: string) => !!k.superadmin || p.includes(c);
  return { kompaniyaId: k.joriy?.id ?? null, oqish: bor('sales.read'), yozish: bor('sales.write'), narx: bor('sales.price'), tolov: bor('sales.payment') };
}

/** Sotuv so'rovlari keshini yangilash (yozuvdan keyin). */
export function useSotuvYangila() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['sotuv'] }), [qc]);
}

/** Server xato kodi → tarjima qilingan matn. */
export function xatoMatn(r: { code?: string; error?: string; xabar?: string } | null | undefined): string {
  return t(sotuvXato(r));
}

export const HOLAT_NOMI: Record<BirlikHolat, () => string> = {
  bosh: () => t('Bo‘sh'), bron: () => t('Bron'), sotilgan: () => t('Sotilgan'), zaxira: () => t('Zaxira'), sotuvda_emas: () => t('Sotuvda emas'),
};
export const BOSQICH_NOMI: Record<Bosqich, () => string> = {
  lid: () => t('Lid'), aloqa: () => t('Aloqa'), korsatildi: () => t('Ko‘rsatildi'), bron: () => t('Bron'), shartnoma: () => t('Shartnoma'),
  tolov: () => t('To‘lov'), topshirildi: () => t('Topshirildi'), bekor: () => t('Bekor'),
};
export const MANBA_NOMI: Record<Manba, () => string> = {
  telegram: () => t('Telegram'), instagram: () => t('Instagram'), olx: () => t('OLX'), uybor: () => t('Uybor'), sayt: () => t('Sayt'),
  tavsiya: () => t('Tavsiya'), qongiroq: () => t('Qo‘ng‘iroq'), ofis: () => t('Ofis'), agent: () => t('Agent'), boshqa: () => t('Boshqa'),
};
export const manbaNomi = (m: string | null | undefined) => (m && m in MANBA_NOMI ? MANBA_NOMI[m as Manba]() : m ?? '—');
export const TOLOV_TURI_NOMI: Record<TolovTuri, () => string> = {
  toliq: () => t('To‘liq'), muddatli: () => t('Muddatli'), ipoteka: () => t('Ipoteka'), eskrou: () => t('Eskrou'),
};
export const USUL_NOMI: Record<TolovUsul, () => string> = {
  naqd: () => t('Naqd'), karta: () => t('Karta'), bank: () => t('Bank'), eskrou: () => t('Eskrou'), payme: () => t('Payme'),
  click: () => t('Click'), uzum: () => t('Uzum'), boshqa: () => t('Boshqa'),
};
export const IXCHAM_NOMI: Record<IxchamBirlik, () => string> = { '': () => '', ming: () => t('ming'), mln: () => t('mln'), mlrd: () => t('mlrd') };

/** Son kiritish maydoni qiymatini o'qish: bo'sh → null. */
export function sonOl(s: string): number | null {
  const x = s.replace(/\s/g, '').replace(',', '.');
  if (x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
