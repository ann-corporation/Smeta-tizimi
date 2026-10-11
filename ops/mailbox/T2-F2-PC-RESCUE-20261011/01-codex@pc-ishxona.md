# F2: сохранение двухчасовой рабочей сессии

Agent: Codex. Machine: pc-ishxona. Date: 2026-10-11.
Status: DONE (защита работы; не завершение финансового импорта).
Repo: SQLI-DUMPER-CRACK-Link-1/Smeta-tizimi.
Base: bf1057a98f5add4a6dbb7f67920da935a7ac4616.
Branch: codex/f2-rescue-pc-20261011.

Исходная Chrome вкладка 1191544053 не обновлялась, не закрывалась,
не меняла файл/объект/период/лист. Старая кнопка была блокирована
846 неразрешёнными отрицательными строками. Обход проверок не выполнялся.

Защита: через read-only CDP прочитаны действующие React hooks и исходный
File. Сохранены отдельные JSON и XLSX на диске. Затем создана локальная
IndexedDB запись по ТОЧНОЙ схеме production f2-ishchi-qoralama.ts:
t2-f2-working-drafts / drafts / 17:127. Существующая запись проверена
перед add (её не было). Транзакция завершилась, запись повторно прочитана:
полное состояние равно, SHA256 Blob равен исходному File. Живые React
решения исходной вкладки не менялись. Это локальная резервная запись,
не вызов финансового writer и не изменение исходного файла.

В новой вкладке обычная кнопка «Продолжить сохранённую работу» восстановила
все акты/исходные значения, ij, rzBog, объект, период и индекс листа точно.
Обычная кнопка «Сохранить черновик Ф2» создала серверный черновик #8,
source document #284. Затем в ЕЩЁ ОДНОЙ вкладке через номер 8 выполнено
«Продолжить серверный черновик», без выбора файла и без local resume.

Проверено после server roundtrip:
- Компания17 NEW TIMES BUILDINGS; объект127 Amfiteatr va sahna.
- Амфитеатр kiritilgan.xlsx; ф2 Амфитеатр (fakt) (2); период2025-10.
- 1060 связей, включая959 ручных: каждый UID и весь binding равен старому.
- 846 отрицательных строк сохранены; исключённых0.
- Весь акт с исходными qty/price/amount и все rzBog равны старой вкладке.
- Изменился только порядок элементов Map при server read, не решения.
- UI: #8 восстановлен; canonical act button остаётся disabled.

Акт не создан/не утверждён; Nakopitelniy не менялся этой операцией.
846 строк всё ещё требуют предметного финансового разбора. Нулевой net
quantity и hajm<>0 constraint не обходились. Никакие нормы/цены не объединялись.

Открытые вкладки: оригинальная1191544053; локально восстановленная1191544153;
сервером восстановленная1191544156 (оставлена для продолжения).
Можно продолжать в последней. Оригинал оставлен открытым как дополнительная
защита; после доказанного восстановления его reload допустим, но НЕ выполнен.

Локальные артефакты (не включать пользовательские финансовые данные в git):
C:/Temp/F2-rescue-20261011/{live-react-state.json,source.xlsx,
indexeddb-receipt.json,reopened-state.json,reconciliation.json,
working-draft-portable.json,server-reopened-state.json,server-reconciliation.json,
server-saved.png}.
Исходный XLSX460677 bytes, SHA256:
d72d8a8a9c45e16933cf1913f9798ba053181eb5f46239be0432e69ae2855aee.
Server reparse/source values equality доказано; отдельный SHA256 скачанного
R2 Blob не получен: позднее browser connection прервалось. Screenshot
server save сохранён; screenshot после server restore timeout, DOM/React
restore receipt сохранены до прерывания. Это не отменяет полученный roundtrip.

Координация: boot/remote task locks и release handoff прочитаны, код чужих
задач не менялся. Локальный Obsidian vault на этой PC не найден в проверенных
Documents/Desktop/OneDrive/Мой диск/D:/G:. Remote ann-corporation/anvar-brain
прочитан в отдельной копии: f78a0e41 (2026-09-27), HANDOFF.md устарел,
KOORDINATSIYA.md отсутствует. Не принимать эту копию за актуальные locks.
Current truth: origin/main bf1057a9 + ops/ACTIVE_TASKS.json + live UI.

Код/миграции/deploy не менялись. Handoff-only task branch; main не push.
