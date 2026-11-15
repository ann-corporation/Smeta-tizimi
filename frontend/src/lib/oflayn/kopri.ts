/**
 * Oflayn ko'prik (native): Tauri qobig'idagi jonli saytga faqat tor `oflayn_*` buyruqlari beriladi
 * (src-tauri/capabilities/remote.json). Oddiy brauzerda bu ko'prik YO'Q — u yerda pul ma'lumoti diskka yozilmaydi.
 *
 * Aktyor/kompaniya doirasi sahifadan EMAS, Rust'da sessiya cookie + server tasdig'idan olinadi; bu yerda faqat
 * natijani (holatni) o'qiymiz.
 */
export const SAYT_ORIGIN = 'https://smeta-tizimi.pages.dev';

export type OflaynHolat = {
  tayyor: boolean;
  onlayn: boolean;
  foydalanuvchi_id: number | null;
  kompaniyalar: number[];
  tekshirilgan_ms: number | null;
  muddat_ms: number | null;
  sabab: string | null;
};
export type KeshYozuv = { vaqt_ms: number; qiymat: string };
export type NavbatYozuv = { id: string; vaqt_ms: number; qiymat: string };

export type Kopri = {
  holat(): Promise<OflaynHolat>;
  yoz(kalit: string, qiymat: string): Promise<void>;
  oqi(kalit: string): Promise<KeshYozuv | null>;
  /** `kalit` berilsa — bitta yozuv; berilmasa — hammasi (kesh + navbat + kalit): chiqishda. */
  tozala(kalit?: string): Promise<void>;
  navbatQosh(id: string, qiymat: string): Promise<void>;
  navbatRoyxat(): Promise<NavbatYozuv[]>;
  navbatOchir(id: string): Promise<void>;
  qobiqTayyor(versiya: string): Promise<void>;
};

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type TauriWindow = { __TAURI_INTERNALS__?: { invoke?: Invoke } };

/** Ko'prik faqat Tauri qobig'ida VA jonli sayt origin'ida bor (mahalliy `tauri.localhost` rejimi boshqa yo'ldan ketadi). */
export function koprigaUlan(w: Window = window, origin: string = SAYT_ORIGIN): Kopri | null {
  const invoke = (w as unknown as TauriWindow).__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function' || w.location.origin !== origin) return null;
  const call = <T>(cmd: string, args?: Record<string, unknown>) => invoke(cmd, args) as Promise<T>;
  return {
    holat: () => call<OflaynHolat>('oflayn_holat'),
    yoz: (kalit, qiymat) => call<void>('oflayn_kesh_yoz', { kalit, qiymat }),
    oqi: (kalit) => call<KeshYozuv | null>('oflayn_kesh_oqi', { kalit }),
    tozala: (kalit) => call<void>('oflayn_kesh_tozala', kalit ? { kalit } : {}),
    navbatQosh: (id, qiymat) => call<void>('oflayn_navbat_qosh', { id, qiymat }),
    navbatRoyxat: () => call<NavbatYozuv[]>('oflayn_navbat_royxat'),
    navbatOchir: (id) => call<void>('oflayn_navbat_ochir', { id }),
    qobiqTayyor: (versiya) => call<void>('oflayn_qobiq_tayyor', { versiya }),
  };
}
