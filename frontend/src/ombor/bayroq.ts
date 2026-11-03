/** Opt-in; localStorage xatosi yoki noma'lum qiymat eski yo'lni saqlaydi. */
export function omborYoqilgan(): boolean {
  try { return globalThis.localStorage?.getItem('t2.ombor') === '1'; }
  catch { return false; }
}
