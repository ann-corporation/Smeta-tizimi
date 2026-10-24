# E4 — Klient yuzalari (web ofis, mobil PWA, kabinetlar)

Holat: qabul qilingan v1 · 2026-10-24

## 1. Uch xil yuza

| Yuza | Kim | Marshrut | Papka | Xususiyat |
|---|---|---|---|---|
| **Ofis web** | PTO, buxgalter, kadr, ta'minotchi, dispetcher, boss | `/admin/<domen>` | `frontend/src/admin/<domen>/` | to'liq jadval, filtr, eksport; desktop-first, 1280px+ |
| **Tomon kabineti** | tashqi tashkilot (buyurtmachi, loyihachi, texnadzor, yetkazuvchi, tashuvchi, subpudratchi) | `/admin/kabinet/<tomon_rol>` | `frontend/src/admin/kabinet/<tomon_rol>/` | o'z kompaniya kontekstida, grant qilingan obyektlar; mavjud `/admin/zakazchik` = `/admin/kabinet/buyurtmachi` taxallusi (redirect keyin) |
| **Mobil PWA** | usta, brigadir, haydovchi, inspektor, omborchi (qabul), mexanik (jurnal) | `/m/<rol>` | `frontend/src/mobil/<rol>/` + `frontend/src/mobil/umumiy/` | telefon-first (360px), katta tugmalar, 3–5 ekran, offline navbat, kamera/GPS |

Marshrut nomlari (band qilingan, to'qnashuv yo'q):
`/admin/xarid`, `/admin/yetkazuvchi`, `/admin/yuk` (dispetcher; mavjud `/admin/logistika` = ombor wrapper, tegilmaydi),
`/admin/kadrlar`, `/admin/tabel`, `/admin/texnika`, `/admin/moliya` (mavjud), `/admin/chizmalar`, `/admin/nazorat`,
`/admin/brigadalar`, `/admin/kabinet/{buyurtmachi,loyihachi,nazorat,yetkazuvchi,tashuvchi,subpudratchi}`,
`/m/usta`, `/m/haydovchi`, `/m/inspektor`, `/m/ombor`, `/m/mexanik`.

## 2. Issiq fayllarni bo'lish (parallel builderlar to'qnashmasligi uchun)

- Har builder marshrutlarini **o'z faylida** eksport qiladi: `frontend/src/admin/<domen>/marshrutlar.tsx`
  (`export const <Domen>Marshrutlari = [<Route .../>]`). `App.tsx` ga faqat **bitta qator** (import + yoyish) qo'shiladi.
- Menyu: `AdminShell.tsx` ga bitta qator — `<domen>/menyu.ts` dan import. Sayt xaritasi — `pageCatalog.ts` ga yozuv,
  `generated.ts` regeneratsiya (alohida kichik commit, `git fetch && merge` dan keyin).
- `/m/*` uchun alohida yengil shell `frontend/src/mobil/MobilShell.tsx` (F4, tomon-pudrat birinchi quradi; boshqalar
  o'z `/m/<rol>` sahifasini qo'shadi). Mobil bundle ofis sahifalarini import QILMAYDI (lazy chunk ≤150 KB gzip).
- i18n: har builder `frontend/src/i18n/lugat/qism/<domen>.json` (masalan `logistika.json`, `nazorat.json`).
  `ru.json/en.json` ga yozilmaydi. Kirill — avtomatik.
- API klient: `frontend/src/api/t2-<domen>.ts`; shlyuz: `frontend/functions/api/<domen>.ts` (+ `.test.ts`).

## 3. Dizayn tizimini qayta ishlatish
`frontend/src/umumiy/ui/*` (`Sahifa`, `Card`, `Badge`, `MoneyInput`, `SummaJuft`, `PTOUi`), kontekst
`umumiy/kontekst/KompaniyaKontekst` + `RuxsatGuard` (capability bo'yicha ko'rsatish), `HujjatKorinish`. Yangi komponent
kutubxonasi kiritilmaydi. Mobil uchun `mobil/umumiy/` da faqat 5 ta primitiv: `KattaTugma`, `QadamKarta`,
`FotoOlish`, `MiqdorKirit`, `HolatChip` — umumiy tokenlar bilan.

## 4. Mobil PWA qoidalari (usta/haydovchi/inspektor)
- **Oddiy o'zbek tili**, ikonka + qisqa so'z; bir ekranda bitta asosiy amal. Kirish: taklif havolasi → bir marta login →
  uzoq sessiya (cookie, 30 kun, qurilma bo'yicha bekor qilinadigan).
- **Offline:** service worker (`/m/` doirasi) — shell va oxirgi ma'lumot kesh; yozuvlar IndexedDB navbatida
  `{operation_id, rpc, payload, yaratildi}`; tarmoq qaytganda tartib bilan qayta yuboriladi (server idempotent →
  takror xavfsiz). `VERSIYA_ESKI` → foydalanuvchiga «yangilang» kartasi, avtomatik ustiga yozish yo'q.
- **Foto:** klientda siqish (≤1600px, JPEG ~0.7), R2 ga `hujjat-yukla` orqali; RPC ga faqat `hujjat_id`.
- **GPS (haydovchi):** faqat faol reys davomida, 15–30 s oralig'ida yig'ib, 60 s da bir partiya (`t2_reys_nuqta_yoz_v1`,
  ≤200 nuqta). Fon kuzatuvi — PWA cheklovi bor; v1 da ekran ochiq paytda + «yetib keldim» tugmasi (E5).
- Push bildirishnoma (Web Push) — F4 dan keyin; v1 — ilova ichida + Telegram (outbox iste'molchisi).

## 5. Kontekst
Har sahifa faol kompaniyani `KompaniyaKontekst` dan oladi; kabinetlarda qarshi tomon `aloqa_id` URL da
(`?aloqa=`). Kompaniya almashtirilganda barcha so'rov keshlari tozalanadi (Konstitutsiya release gate).
