# T2 AI TIZIM V2 (2026-10-08)

Reja va qaror tarixi: Obsidian `AI_TIZIM_V2_REJA.md`. Poydevor: `T2_AGENT_PLATFORM_V1.md`.

## Qurilgan (kod + test)
- **Tizim bilimi** (`functions/_shared/agent-bilim.ts`): atama/mantiq lug'ati (F2, fakt, qator turlari, resurs kategoriyalari, NULL≠0, nakopitelniy/F3, M-29, nakrutka, narx qoidalari, АОСР, ierarxiya, ishonch qonunlari, tomonlar, studiya, ombor) + `SAHIFA_KATALOGI` dan sahifa ma'nosi. Savol/sahifaga qarab ball bo'yicha tanlanadi (≤3.2 KB), promptga «TIZIM BILIMI» bo'limi sifatida; raqamlar faqat FAKTLARdan.
- **Sahifa ochish**: AI `otish` yo'li faqat katalogdagi yo'l bo'lsa qabul qilinadi (`yolTekshir`); navigatsiya savolida tokensiz `sahifaQidirish` natijasi qo'shiladi. Mijozda «Ochish: …» tugmasi.
- **Tizim yordamchisi** (`tizim_yordam`): kompaniya/lavozimi yo'q foydalanuvchi uchun TOKENSIZ javob (lug'at + sahifa katalogi), kompaniya ma'lumotiga tegmaydi.
- **Uslub o'rganish** (`agent-uslub.ts`, `t2_agent_uslub`): faqat savol SHAKLI (til, uzunlik, batafsil/qisqa/jadval so'rash, rasmiylik; EMA); savol matni saqlanmaydi; foydalanuvchi ko'radi, o'z ko'rsatmasini yozadi (≤600, ma'lumot sifatida o'ralgan — qoidani o'zgartira olmaydi), o'chiradi/tozalaydi.
- **Shaxsiy model tanlovi** (`t2_agent_foydalanuvchi_model`): har funksiya (profil) uchun. Hal qilish: foydalanuvchi → kompaniya → platforma → server standarti (`t2_agent_muhit_v1` ham `model_manba` qaytaradi). Faqat superadmin tasdiqlagan katalogdan (FK), tizim agentlari uchun yo'q.
- **Joyida model tanlash** (`ModelChip` → `ModelTanlagich`): AI chat sarlavhasida va Smeta AI panelida; tavsiya, «mos emas» ogohlantirishi, narx. Server/migratsiya tayyor bo'lmasa chip jim yashirinadi.
- **`ai:ochish` hodisasi**: istalgan komponent `window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol } }))` bilan AI ni tayyor savol bilan ochadi.

## Migratsiya `20261106350000_t2_agent_uslub_model_v1` (+rollback, `supabase/tests/t2_agent_uslub_model_contract.sql`, 22/22 rollback-sinov o'tgan)
Prod'ga faqat egasi roziligi bilan. Qo'llanmaguncha: uslub/shaxsiy model jim o'chiq, qolgani (bilim, sahifa ochish, tizim yordamchisi) ishlaydi.

## Navbat
Harakat katalogini kengaytirish; fikr (👍/👎) → uslub; bilim bazasi DBda (superadmin tasdiqlagan, internetdan o'rganilgan me'yorlar/qonunlar) va kompaniya agentlariga uzatish; boshqaruvchi agent davriyligi; kompaniya siyosati (model narx chegarasi).
