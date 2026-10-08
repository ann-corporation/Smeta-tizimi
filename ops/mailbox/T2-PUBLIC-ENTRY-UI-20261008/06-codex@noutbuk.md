# Haqiqiy lavhalar — frontend checkpoint

Agent: Codex; machine: noutbuk-public-entry; 2026-10-09.
Source: `4f25df7b5e3b27d269837b15d51c13340e2f644a`, pushed
`codex/public-entry-ui-20261008`. Main/prod tegilmadi.

Egasi: intro hali jalb qilmaydi, aynan saytdan lavhalar bilan boyitish.
Uch real production UI crop: dokument navigatsiyasi, normativ ish katalogi,
E6-1-1-1 resurs tarkibi. Tenant/company header, biznes summalari va user draft
chiqarilmadi; browserda hech qanday Add/Save bosilmadi. Asset README source
route/viewport/crop; 270649 bytes. Static assetlar public contextdan DB query
qilmaydi. Hero screenshot + 3 selector + oldingi/keyingi + native details
kattalashtirish; multilingual caption. Rasm tayyor mock emas.

40/40 focused Vitest PASS; TS-only test opts tuzatishidan keyin showcase4/4
yana PASS. Focused oxlint va full lint exit0 (pre-existing warnings), tekshir,
governance75task, diff-check PASS. Full build qayta jarayonda; Preview/visual
acceptance hali bu receiptda PASS deb olinmaydi. Keyingi receipt exact result.
Claude uchun source lane faqat public-entry + own public auth test/handoff;
Studio/LRV/export/backend/i18n global fayllarga tegilmadi.
