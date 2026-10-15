# T2-CATALOG-INTEGRATION-GATES-20261015

OWNER Codex, machine noutbuk-catalog-integration. Repo ann-corporation/Smeta-tizimi.
Base origin/main 4a76f572f6d0c6bb75e3764b80903be7a977825e.
Branch codex/catalog-integration-gates-20261015.

OBJECTIVE: mavjud source data runtimega yo'qotishsiz/shartlari saqlanib o'tishini tekshiradigan executable reconciliation va publication gate. Egasi yuqori sifatli Studio talab qildi; Claude runtime/API/price builder bilan parallel ishlamoqda.
OWNED PATHS: ops/catalog-integration/, shu handoff va own mailbox.
DO NOT TOUCH: Claude Studio/API/coefficient builder, narx dvigateli, production/DB/R2 va dirty worktrees.
INVARIANTS: source immutable; nashr/dop tengligi taxmin qilinmaydi; kod crosswalk normativ equivalence emas; qo'shimcha foiz multiplierga aylantirilmaydi; zero sentinel taxminan tuzatilmaydi.
TESTS/ACCEPTANCE: node --test ops/catalog-integration/*.test.mjs; real old+new source reconciliation; hash checks; bounded report; gate unsafe release fail-closed; governance/diff. Source report != deployed runtime.
FORBIDDEN: main/prod write, destructive cleanup, invented coefficients/approval.
OUTPUT: tool+tests+machine report lokal; narrow branch pushed; Claude uchun Obsidian ulash kontrakti.
