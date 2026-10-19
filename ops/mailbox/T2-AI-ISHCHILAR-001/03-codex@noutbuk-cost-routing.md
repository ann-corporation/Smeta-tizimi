---
agent: codex
machine: noutbuk-jarvis-continuation
date: 2026-10-19
branch: codex/smeta-ai-cost-routing-20261019
base_main: 90a36f53fdf578ea2c65cff694fb9a14bcece530
status: TESTED
---

Egasi CSV sarfidan keyin planner kuchini pasaytirmasdan utility yo'lini ajratishni topshirdi. `ops/handoff/T2_AI_ISHCHILAR_001.md` 2026-10-19 bo'limi implementation/gate/rollback/acceptance manbasi.

Remote branchdagi so'nggi `feat(ai): preserve expert planning and route safe price chores cheaply` commiti source SHA. Oldingi Jarvis readonly continuation ham branchda, main'da hali yo'q. Dirty G:/GAS, C:/t2dev/wt, F2 token-mon o'zgarmadi.

PRIMARY: owner/company tanlagan model; suhbat, normativ, koeffitsient, hujjat, semantic/dimensional price decisions. LOCAL: yagona aynan mos reference. UTILITY: search phrases / exact same-price references, default explicit cheap FlashLite; unsafe yoki noaniq subset primaryga, bir helper attempt. Truncated Studio generation endi usage bilan meteringga qaytadi; primary JSON repairda arzon modelga tushmaydi.

Tests full2189PASS17skip; TS app+Functions/build/lint/tekshir/governance/diff PASS (baseline warnings documented). UI va schema o'zgarmadi. Pullik model eval, secret read/rotation, DB migration yoki actual business mutation qilinmadi. Public `/api/v1/models` metadata read-only tekshirildi: helper mavjud, reasoning mandatory=false.

Integrator: Preview'da aynan tanlangan planner saqlanganini tekshiring; bir xil saved source bilan expert-only (`SMETA_AI_UTILITY_ENABLED=0`) va routing natijalarini narx/manba/birlik/summa bo'yicha taqqoslang. Uch variant: exact reference→local, synonyms/empty catalogue→utility/primary, grade/unit/formula→primary. Model noto'g'ri yuqori confidence desa ham gate yumshatilmasin. Real sifat/sarf parity dalili bo'lmaguncha main/prod READY emas. CSV `second mind` kalitining boshqa ilovalardagi ishlatilishi va barcha HTTP retry/fallback cost reconciliation hali ochiq.
