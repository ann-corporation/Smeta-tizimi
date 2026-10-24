# E5 — Masshtab va operatsiyalar

Holat: qabul qilingan v1 · 2026-10-24

## 1. Tezlik byudjetlari (o'lchanadi, testda qo'riqlanadi)

| Narsa | Byudjet (p95) |
|---|---|
| Ofis sahifa birinchi foydali ko'rinish (desktop, keshlangan shell) | ≤ 2 s |
| Mobil `/m/*` birinchi ekran (4G, o'rta Android) | ≤ 2.5 s; JS chunk ≤ 150 KB gzip |
| Ro'yxat/read-model RPC | ≤ 800 ms; javob ≤ 300 KB |
| Yozuv RPC | ≤ 500 ms |
| Smeta qoralamasini ochish (300k qatorli baza, katta smeta) | ≤ 10 s, progress bilan |
| Kompaniyalararo `t2_tomon_ruxsat_bor` chaqiruvi | ≤ 5 ms (indeks: `t2_tomon_grant(oluvchi_kompaniya_id, beruvchi_kompaniya_id, resurs) where holat='faol'`) |
| Outbox → bildirishnoma kechikishi | ≤ 2 daqiqa |

Mavjud qo'riqchi `frontend/src/api/sb-tezlik-byudjeti.test.ts` uslubida har domen o'z budjet testini qo'shadi.

## 2. Sahifalash va so'rov qoidalari
- Keyset sahifalash: `(id desc)` yoki `(yaratildi desc, id desc)`, `p_limit` ≤ 200 (default 50), `p_keyin_id` kursor.
  OFFSET katta jadvalda yo'q. Har ro'yxat RPC ida `limit` majburiy.
- Har yangi jadvalda kamida `(kompaniya_id, obyekt_id, id desc)` indeksi; FK ustunlarida indeks.
- Interaktiv o'qishda GAS/Drive/Sheets chaqirilmaydi (mavjud qoida).
- Agregat (dashboard) — read-model RPC/view; og'ir bo'lsa jadvalga keshlanadigan snapshot + outbox orqali yangilash.

## 3. O'zgarmas ma'lumot keshi
- R2 katalog (norma, resurs, narx manbasi snapshotlari) — versiyalangan kalit, `Cache-Control: immutable`,
  shlyuzda isolate keshi (`ota-kesh.ts`, `r2-malumotnoma.ts`). Ekotizim domenlari material nomini shu katalogdan oladi.
- `t2_yonalish`, `t2_tomon_resurs`, `t2_permission_catalog_v2` — kam o'zgaradi: klient 10 daqiqa kesh.
- Ruxsat (`t2_men_v1`) — shlyuzda ≤60 s (mavjud).

## 4. Postgres hajmi (441 MB, bepul reja chegarasi yaqin)
- Fayl/foto/PDF/chizma — **faqat R2**; Postgres'da `hujjat_id`.
- `t2_reys_nuqta` — ixcham ustunlar (`real` lat/lng emas, `numeric(9,6)`), reys tugagach 30 kundan keyin
  soddalashtirilgan trek (har 100 m bitta nuqta) `t2_reys.trek_r2_key` ga GeoJSON sifatida R2 ga, xom nuqtalar o'chiriladi
  (holatli tozalash ishi; hard delete faqat shu texnik jadvalda — egasi tasdig'i bilan, ⚠).
- `t2_outbox` — 90 kun; `t2_bildirishnoma` — o'qilgan 180 kun.
- Har builder migratsiya PR ida taxminiy o'sish (qator/oy, MB/oy) yozadi.
- ⚠ Pullik rejaga o'tish — egasi qarori (yangi moliyaviy majburiyat).

## 5. Fon ishlar
- Registry: mavjud `t2_job` (kod, holat, progress, last_success_at, last_error) — har fon ish shu yerda ro'yxatda.
- Ishga tushiruvchi: Cloudflare Cron Trigger → shlyuzdagi ichki endpoint (service sir bilan), qisqa partiyalar
  (≤25 s CPU). Uzoq ish — bosqichli, kursor bilan davom etadi. pg_cron ishlatilmaydi (bitta joyda boshqaruv).
- Ishlar: `outbox-ishlov` (1 daq), `reys-trek-siqish` (kunlik), `outbox-tozalash` (kunlik), `kod-muddati` (soatlik).
- Har ish idempotent, `t2_job` ga natija, xato → `t2_signal`.

## 6. Kuzatuv (observability)
- Shlyuz har so'rovda: `api, rpc, kompaniya_id, actor_id, operation_id, ms, natija_code` — strukturali log
  (Cloudflare Logs), shaxsiy ma'lumotsiz.
- RPC xatolari kod bilan (`PERMISSION_DENIED`, `RUXSAT_YOQ`, `DOIRA_YOQ`, `VERSIYA_ESKI`, `HOLAT`...) — UI tarjima qiladi.
- Control Center (`/admin/system-control`): `t2_job`, `t2_integration_health`, outbox orqada qolishi (`max(id) - kursor`),
  oxirgi 24 soatdagi RPC xato soni.
- Signal: biznes anomaliyalari (`t2_signal`) — masalan reys 2 soat harakatsiz, buyurtma muddati o'tdi.
