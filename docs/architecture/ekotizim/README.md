# EKOTIZIM — ko'p tomonli qurilish ekotizimi arxitekturasi (ADR to'plami)

Holat: **QABUL QILINGAN KONTRAKT v1** · 2026-10-24 · egasi: arxitektura agenti (Claude).
Egasi so'zi: «pudratchi, subpudratchi, har taraflama variantlariga tayyor tizim… buxgalteriya, kadrlar,
mexaniklar — hamma hammani qamrab olishi kerak, oddiy ustagacha nafi tegishi kerak»; logistika —
«Yandex Taxi / Uber kabi ekotizim».

Bu to'plam `docs/governance/CONSTITUTION.md` ga bo'ysunadi va uni kengaytiradi, buzmaydi.
7 builder agent (tomon-buyurtmachi, -loyihachi, -nazorat, -yetkazuvchi, -logistika, -pudrat, -ichki)
**faqat shu kontraktlar bo'yicha** DB/ruxsat/marshrut loyihalaydi.

| # | Hujjat | Mavzu |
|---|---|---|
| E0 | [E0_AUDIT_20261024.md](E0_AUDIT_20261024.md) | Hozirgi arxitektura auditi (dalil) |
| E1 | [E1_TOMON_MODELI.md](E1_TOMON_MODELI.md) | Universal tomon: tashkilot, shaxs, rollar, bir odam — ko'p kompaniya |
| E2 | [E2_TENANCY_RUXSAT.md](E2_TENANCY_RUXSAT.md) | Tenant, kompaniyalararo obyekt, ruxsat, taklif/kod, RLS + test shabloni |
| E3 | [E3_DOMEN_CHEGARALARI.md](E3_DOMEN_CHEGARALARI.md) | Domenlar, umumiy ID lar, hand-off jadval/RPC lar, outbox, audit |
| E4 | [E4_KLIENT_YUZALARI.md](E4_KLIENT_YUZALARI.md) | Ofis web, mobil PWA (usta/haydovchi/inspektor), marshrut, i18n |
| E5 | [E5_MASSHTAB_OPS.md](E5_MASSHTAB_OPS.md) | Tezlik byudjeti, sahifalash, kesh, fon ishlar, kuzatuv |
| E6 | [E6_YOL_XARITASI.md](E6_YOL_XARITASI.md) | Bosqichlar, jadval egaligi, migratsiya oraliqlari, builder qoidalari |
| E7 | [E7_SHAXS_KATALOG_PRIMITIVLAR.md](E7_SHAXS_KATALOG_PRIMITIVLAR.md) | **Egasi tamoyili:** shaxs-birinchi, katalog/kontakt, umumiy primitivlar (topshiriq, tender, buyurtma, murojaat, taqdim), o'zgarmas smeta snapshot |

## Asosiy tamoyil (egasi, «Telegram arxitekturasidek»)
Odam rol tanlamasdan kiradi → yo'nalishlarini ish davomida qo'shadi → tashkilot yaratadi yoki taklif bilan qo'shiladi →
kerakli odam/tashkilotni topadi (katalog), kontakt qiladi → topshiriq beradi/oladi, tender e'lon qiladi/yutadi,
mahsulot/xizmat buyurtmasini bajaradi. Hammasi **5 ta umumiy primitiv** ustida (E7 §3); PTO/F2 ishi to'xtamaydi.

## Eng muhim 15 qoida (qisqa)

- **A. Shaxs-birinchi:** akkaunt rolsiz; yo'nalish ≠ ruxsat. Modul o'z «zayavka/vazifa/order» jadvalini yasamaydi —
  P1 topshiriq, P2 tender, P3 buyurtma, P4 murojaat/izoh, P5 taqdim + 1:1 tafsilot jadvali (E7).
- **B. O'zgarmas smeta snapshot:** muzlagan smeta revizyasi R2 da gzip JSON (xesh kalit), klient bitta so'rov + kesh;
  o'zgaruvchan qatlam alohida kichik RPC (E7 §4).

1. **Tenant = `t2_kompaniya`.** Har biznes qatorida `kompaniya_id NOT NULL` (egasi tenant). Shaxs (usta,
   haydovchi, mustaqil inspektor) — `turi='shaxsiy'` kompaniya (shaxsiy ish joyi). Yangi «party» jadvali YO'Q.
2. **Rol — munosabatda, kompaniyada emas.** Bir kompaniya bir loyihada pudratchi, boshqasida subpudratchi.
   Tomon roli: `t2_tomon_aloqa.taklif_rol/qabul_rol` + `t2_shartnoma_tomon.rol` + `t2_loyiha_qatnashchi.rol`,
   hammasi bitta `t2_yonalish` katalogidan (E1).
3. **Kompaniyalararo ko'rinish faqat** `t2_tomon_aloqa` (handshake) + `t2_tomon_grant` + `t2_tomon_ruxsat_bor(...)`.
   Ma'lumot nusxalanmaydi; faqat o'zgarmas `t2_tomon_taqdim` snapshot (xesh bilan).
4. **Ichki ruxsat:** `t2_permission_catalog_v2` + `t2_role_permissions_v2` + `t2_azolik_ruxsat_qoshimcha`;
   obyekt bo'yicha toraytirish — `t2_obyekt_foydalanuvchi_ruxsat`. Yangi capability = katalogga qator (E2 §3).
5. **Postgres RLS: yoqilgan + policy YO'Q + anon/authenticated ga GRANT yo'q.** Hamma kirish — Cloudflare shlyuzi
   (service_role) → nomli `SECURITY DEFINER` RPC, ichida actor/tenant/ruxsat tekshiruvi. Brauzer to'g'ridan Supabase'ga
   bormaydi (E2 §5 shablon).
6. **Har yozuv:** `p_actor_id`, `p_kompaniya_id`, `p_operation_id uuid` (idempotent), o'zgaruvchan qatorda
   `versiya` + `p_kutilgan_versiya`. Hard delete yo'q — `holat`.
7. **Bitta hodisa shinasi:** `t2_outbox` (domen buyrug'i bilan bitta tranzaksiyada) → bildirishnoma/integratsiya
   iste'molchilari. `t2_tomon_hodisa` — kompaniyalararo o'zgarmas jurnal, `t2_audit_log` — audit (E3 §6).
8. **O'zgarmas — R2, o'zgaruvchan — Supabase.** Fayl/foto/PDF/chizma → R2 + `t2_document_registry`; GPS nuqtalari
   Postgres'da faqat ixcham va muddatli (E5).
9. **Smeta asl qatorlari CONST**, o'zgarish — alohida qatlam; F2 = nakopitelniy; summalar USTAMALI+ustamasiz, NDS siz.
10. **Hand-off = nomli RPC + outbox hodisasi**, boshqa domen jadvaliga to'g'ridan INSERT yo'q (E3 §4).
11. **Mobil yuzalar `/m/<rol>`** (PWA, offline navbat `operation_id` bilan), ofis — `/admin/<domen>` (E4).
12. **Prod migratsiya — faqat arxitektura ko'rigidan va koordinator (parent) orqali.** Builderlar migratsiyani
    `supabase/migrations/` ga taklif sifatida yozadi + `.rollback.sql` + `supabase/tests/*_contract.sql` (E6).
