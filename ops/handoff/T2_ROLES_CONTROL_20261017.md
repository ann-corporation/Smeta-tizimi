# T2-ROLES-CONTROL-20261017

## Egasi talabi

Platforma `superadmin` vakolati kompaniyadagi `pto` vazifasidan alohida. `boss`/kompaniya `admin`i faqat o‘z kompaniyasini to‘liq boshqaradi. Egasi individual checkbox orqali lavozimdan kelgan huquqni ham o‘chirishni tasdiqladi.

## Amalga oshirildi

- `t2_men_v1` actual membership, platform role, selected-company access, effective permissions va explicit denialsni alohida qaytaradi. Soxta membership yaratilmaydi.
- Har tenant API so‘rovida vakolat DBdan yangilanadi; eski HMAC cookie ichidagi rolga yolg‘iz ishonilmaydi. Middleware va mavjud endpoint ownership tekshiruvlari birga ishlaydi.
- `company-authorization/`, `KompaniyaKontekst`, `AdminShell`, `RuxsatGuard`, `F2TarixNative`: menyu/badge/direct URL/approval permission snapshotdan foydalanadi.
- `Kompaniya → Rollar va ruxsatlar`: 25 ta huquq, lavozim bazasi va individual yoqish/o‘chirish, atomik saqlash, versiya konflikti va idempotent operation. `MemberPermissionEditor` parallel o‘zgarishda operatorning saqlanmagan tanlovini jim yo‘qotmaydi.
- `boss`, kompaniya `admin`i va platforma `superadmin`i checkbox orqali asosiy boshqaruvsiz qoldirilmaydi. Management huquqini xodimga checkbox bilan berish o‘rniga tegishli boshqaruv roli tayinlanadi. Kompaniya `admin`i platforma superadmini emas.
- 20 mavjud native RPCga permission gate qo‘shildi; hisob, approved F2 snapshot, entity ownership va version/business validation qayta yozilmadi. Regression original/updated RPC body farqini faqat guard bilan cheklaydi.
- A’zolik buyruqlari bir kompaniyadagi boshqaruv o‘zgarishlarini seriallaydi; oxirgi direktor/superadmin himoyasi, audit/idempotency, bekor a’zolikni stable ID bilan qayta faollashtirish mavjud. Tenant boshqaruvchisi platforma superadminini tayinlay/pasaytira olmaydi.
- Global/multi-company yoki Google identity parolini tenant rahbari o‘zgartira olmaydi; yakka kompaniya xodimi uchun amaldagi boshqaruv yo‘li saqlandi. Parol/ikkinchi zaif verifier command-logga yozilmaydi; UI generatori `crypto.getRandomValues` ishlatadi.

## DB

Faqat ushbu uch migration qo‘llandi (`tuoyrzadkgoltpqkdiyx`):

1. `20261017094210_t2_role_authority_precedence_v1.sql`
2. `20261017100629_t2_individual_permission_constructor_v2.sql`
3. `20261017103657_t2_membership_authority_ceiling_v3.sql`

Har birining `.acceptance.sql` va `.rollback.sql` yonida. Acceptance synthetic yozuvlari ichki rollback bilan yo‘qoladi; real foydalanuvchi ruxsati yoki biznes hujjati test uchun o‘zgartirilmadi. Migration service_role-only ACL; mavjud RLS saqlangan. Pending boshqa migrationlar qo‘llanmagan. Individual deny borida v2 rollback fail-closed; kompaniya admini faol bo‘lsa v3 rollback eski admin modeliga ko‘r-ko‘rona qaytmaydi.

## Tekshiruv (source kandidat)

- Vitest: 42 file / 387 test PASS.
- App TS + Functions TS + build PASS.
- `npm run lint`: exit 0; mavjud warninglar bor.
- `npm run tekshir`: PASS.
- Uch DB acceptance PASS. v3 acceptance alohida qayta ishga tushirildi, PASS.
- 25 permission / 20 native binding / RLS enabled / setter anon execute yo‘q / fixture qoldig‘i yo‘q.

## Chegaralar

- Vakolat bu workspace/action darajasida; barcha composite read-model maydonlariga universal field-level redaction deb da’vo qilinmaydi.
- Individual read-deny mavjudida umumiy AI agregatsiya fail-closed; write-deny bo‘lsa read-only Jarvis ishlashi mumkin, umumiy agent action cheklanadi. Domain-granular AI tool-scoping alohida keyingi ish.
- Oxirgi platforma superadmini sanog‘i real 4 ta hisobni o‘chirib sinovdan o‘tkazilmadi. Guard source mavjud; real hisoblar test uchun o‘zgartirilmaydi.
- Authenticated constructor write testi synthetic DB/component orqali isbotlangan; haqiqiy xodimni tasodifan cheklash yoki parolini almashtirish qilinmagan.
- Preview/main/deploy va Chrome smoke natijasi yakuniy release yozuvida alohida qayd qilinadi. Bu source tekshiruvlari o‘z-o‘zidan production yoki egasi qabuli degani emas.
