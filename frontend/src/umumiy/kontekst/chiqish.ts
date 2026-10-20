/**
 * chiqish.ts — YAGONA tizimdan chiqish. Sessiya cookie serverda o'chiriladi (`/api/chiqish` — HttpOnly cookie ni
 * JavaScript o'chira olmaydi), keyin kompaniya konteksti va kesh tozalanadi. Har qanday qobiq shu funksiyani ishlatsin —
 * aks holda keyingi foydalanuvchi oldingi kompaniya kontekstini ko'radi.
 */
const KONTEKST_KALITLAR = ['t2_kompaniya_kontekst', 't2_active_kompaniya', 't2_global_rejim', 't2_kompaniya_id'];

export async function tizimdanChiq() {
  try { await fetch('/api/chiqish', { method: 'POST', credentials: 'same-origin' }); } catch { /* tarmoq bo'lmasa ham kontekst tozalanadi */ }
  try {
    document.cookie = 'sess=; Max-Age=0; path=/';
    for (const k of KONTEKST_KALITLAR) localStorage.removeItem(k);
  } catch { /* private mode */ }
  window.location.href = '/';
}
