# Независимая приёмка PTO — Codex / Claude

Только синтетические данные. Runtime, Supabase и реальные сметы не изменяются.

Из frontend:

```powershell
npx vitest run --config testlar/pto-joint-acceptance-20261025/config.ts
```

Это отдельные acceptance probes `*.audit.ts/tsx`, они намеренно не входят в обычный Vitest discovery. На baseline8b1eb894 измерено2PASS control и3FAIL OPEN findings (5 сценариев). Красный результат не скрывается и не является утверждением, что runtime исправлен. После исправления L0 все5 должны статьPASS; затем положительные regression cases принимает соответствующий владелец runtime тестов. Обычный существующий pereraschet.test.ts:16PASS.

- JQA-01: при нулевом net F2 объёме и ненулевой certified сумме строка исчезает. Необходимо оставить её видимой для проверки/корректировки.
- JQA-02: explicitNULL суммы превращается в0 и создаёт фиктивную разницу цены. Это contract-hardening case; live распространённость не установлена, view companion counter может защищать обычные строки.
- JQA-03 (P1, Fakt): компонентный repro подтвердил RPC expected120→new100 после «100% qilish» без отдельного correction preview. Здесь RPC замокан, production не изменяется.

Read-only production incidence check: по объекту153 среди2538 approved F2 row groups JQA-01-формы не обнаружены (0). Это не отменяет воспроизводимый дефект для допустимого correction shape и не доказывает его присутствие у владельца.

Не менять runtime из этого QA lane. Claude L0 назначает существующего implementer и записывает точный SHA исправления в mailbox.
