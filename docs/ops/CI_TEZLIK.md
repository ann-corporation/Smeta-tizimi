# CI tezligi (2026-11-15)

Hech bir tekshiruv olib tashlanmadi; faqat parallellashtirildi va dublikat yurishlar yo'qotildi. Contents: read saqlangan.

## O'lchov (oldin, run 43732388198 va boshqalar)
- frontend job bitta ketma-ket: npm ci 7s, tsc app 55s, tsc functions 6s, tekshir 8s, unit testlar (--no-file-parallelism) ~1113s (18.5 daq), perf + build ustiga ~18-25 daq jami.
- Har PR uchun CI ikki marta (push + pull_request) yurardi.

## Hozir
| Job | Kutilgan vaqt |
|---|---|
| static (tsc, oxlint, site-map, tekshir) | 1.5-2.5 daq (tsbuildinfo keshi bilan) |
| unit x4 shard | 5-6 daq har biri (parallel) |
| build | 2-4 daq |
| perf (ma'lumot uchun) | alohida, kritik yo'lda emas |
| mcp, mcp-remote | 1-2 daq |
| ci-gate | ~10 s |

Umumiy devor vaqti ~6-7 daq (avval 18-25). Runnerlar soni 4+4 ga ko'paydi, lekin dublikat run yo'qolgani uchun jami daqiqalar kam o'sadi.

## O'zgarishlar
- push faqat main va v* tag; PR lar pull_request orqali. Eslatma: PR'siz ish branchda CI yurmaydi (avval ADR-7 bo'yicha yurardi); PR ochilishi bilan yuradi.
- concurrency: ${{ github.workflow }}-PR raqami|ref, main dan boshqasida cancel-in-progress.
- e2e: faqat frontend/** yoki o'z workflow'i o'zgarganda.
- mobile.yml va desktop-windows.yml avvaldan paths filtrli (frontend/src-tauri, frontend/src/desktop); o'zgartirilmadi. android-native workflow main'da yo'q - qo'shilganda xuddi shunday paths va concurrency qo'yilsin.
- Kesh: setup-node npm kesh, node_modules/.tmp (tsbuildinfo), node_modules/.vite (vitest). Oxlint keshi yo'q (1 daq dan kam).

## Egasi/L0 uchun
main hozir himoyalanmagan (branch protection 404). Himoya yoqilganda majburiy tekshiruv sifatida faqat `ci-gate` ni (yoki frontend nomli eski job o'rniga static, unit (1..4), build) belgilang. Eski `frontend` job nomi yo'q bo'ldi.
