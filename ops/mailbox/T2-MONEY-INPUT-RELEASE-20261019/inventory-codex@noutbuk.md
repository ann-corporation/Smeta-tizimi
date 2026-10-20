---
agent: codex
mashina: noutbuk
date: 2026-10-19
status: VERIFIED LOCAL - READ ONLY INVENTORY
---

# Реестр денежных полей — Codex / noutbuk / 2026-10-19

Статус: VERIFIED LOCAL, статический аудит. Корень: C:/Temp/GAS-money-input-release-v1. Прямое делегирование: только чтение исходников; запись только данного отчёта и собственного mailbox. Git/network/prod не использовались аудитом (обязательный governance-check сам читает локальные git refs). Исходники, locks и реестр задач аудитом не изменялись.

Родитель параллельно внедряет rollout: во время аудита input уже менялись на MoneyInput. Поэтому строки ниже сняты повторно одним AST-проходом; это моментальный снимок, не утверждение о завершении внедрения. Прежние type=number и уже заменённые MoneyInput включены одинаково.

Метод: rg + AST TypeScript по всем 577 нетестовым JS/TS/JSX/TSX файлам frontend/src; осмотр 470 JSX controls (input/MoneyInput/Kiritma/SonKiritish); ручная проверка динамических схем, единиц и сохранения. Тестовые fixtures исключены; test02 включён как UI. Browser/runtime/owner smoke не выполнялись. SHA256 перечня прочитанных исходников: 5e1323aa79154109d6ee7af4017132a9663c7502312b3e50567c5a84de89b1d1 (снимок чтения, не git SHA).

Все пути ниже относительно корня аудита. value/defaultValue/qiymat показаны как в JSX.

## Денежные controls

- `frontend/src/admin/ai-markaz/AiAgentlarBolimi.tsx:86` — `{yKir}` (input). USD за 1M токенов; сохранить дробные цены.
- `frontend/src/admin/ai-markaz/AiAgentlarBolimi.tsx:87` — `{yChiq}` (input). USD за 1M токенов; сохранить дробные цены.
- `frontend/src/admin/ai-markaz/AiXarajatBolimi.tsx:69` — `{plLimit}` (MoneyInput). Месячный USD лимит.
- `frontend/src/admin/ai-markaz/AiXarajatBolimi.tsx:95` — `{kLimit}` (MoneyInput). Месячный USD лимит.
- `frontend/src/admin/qismlar/F2Kafolat.tsx:307` — `{qiymat}` (input). Коррекция итога F2, сохранение по Enter/кнопке.
- `frontend/src/admin/qismlar/F2OyTahrir.tsx:265` — `{hujJami}` (input). Денежный поиск по итогу документа, Enter.
- `frontend/src/admin/qismlar/F2OyTahrir.tsx:451` — `{q.narx}` (MoneyInput). 
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:429` — `{soz.token_som}` (MoneyInput). Денежная цена за единицу.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:432` — `{soz.usd_kurs}` (MoneyInput). Денежный курс UZS/USD, не процент.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:456` — `{n.asos_som}` (MoneyInput). Денежная сумма/цена.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:458` — `{n.birlik_som}` (MoneyInput). Денежная цена за единицу.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:459` — `{n.min_som}` (MoneyInput). Денежная сумма/цена.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:460` — `{n.max_som ?? ''}` (MoneyInput). Денежная сумма/цена.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:477` — `{misolUsd}` (MoneyInput). Денежная сумма/цена.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:491` — `{tf.narx_som}` (MoneyInput). Денежная сумма/цена.
- `frontend/src/admin/sahifalar/Buxgalteriya.tsx:285` — `{yangi.summa}` (MoneyInput). 
- `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:223` — `{k.narx[r.id] ?? ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:227` — `{k.summa[r.id] ?? ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Fakturalar.tsx:869` — `{t.narxi || ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Fakturalar.tsx:874` — `{t.aksizSummasi || ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Fakturalar.tsx:884` — `{t.jamiNdsSiz || ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/IshAbcModal.tsx:193` — `{r.narx}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Narxlar.tsx:359` — `{narxKiritma}` (Kiritma). 
- `frontend/src/admin/sahifalar/NarxlarNative.tsx:355` — `{narxKiritma}` (MoneyInput). 
- `frontend/src/admin/sahifalar/NarxManbalari.tsx:140` — `{q.narx ?? ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/NormSmetaWorkbench.tsx:134` — `{prices[r.id] ?? ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/OfertaNative.tsx:565` — `{qatorNarx[g.sourceIds[0]] ?? ''}` (SonKiritish). 
- `frontend/src/admin/sahifalar/OfertaNative.tsx:567` — `{guruhNarx[g.kalit] ?? ''}` (SonKiritish). 
- `frontend/src/admin/sahifalar/OfertaNative.tsx:600` — `{qatorNarx[q.sourceId] ?? ''}` (SonKiritish). 
- `frontend/src/admin/sahifalar/PodvalKonstruktor.tsx:202` — `{q.summa ?? ''}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Shartnoma.tsx:415` — `{yangiQosh.smeta}` (Kiritma). 
- `frontend/src/admin/sahifalar/Shartnoma.tsx:436` — `{shakl.summa}` (Kiritma). 
- `frontend/src/admin/sahifalar/Shartnoma.tsx:437` — `{shakl.nds}` (Kiritma). НДС здесь сумма: складывается с summa, не процент.
- `frontend/src/admin/sahifalar/Shartnoma.tsx:445` — `{shakl.jami}` (Kiritma). 
- `frontend/src/admin/sahifalar/Shartnoma.tsx:500` — `{yangiTolov.summa}` (Kiritma). 
- `frontend/src/admin/sahifalar/ShartnomaLiniya.tsx:131` — `{s[k]}` (input). k = summa_bez_nds, nds, jami_nds_bilan; здесь nds — сумма НДС.
- `frontend/src/admin/sahifalar/ShaxsiySmeta.tsx:242` — `{chelStavka}` (MoneyInput). 
- `frontend/src/admin/sahifalar/Sozlamalar.tsx:310` — `{qiymat}` (input). ЧЕЛ-Ч, so‘m/soat; it.qiymat в другом разделе — коэффициент.
- `frontend/src/admin/sahifalar/StudioBosqichlar.tsx:462` — `{qolda.narx}` (MoneyInput). 
- `frontend/src/components/smeta-studio-pro/EstimateEditingWorkspace.tsx:143` — `{price}` (MoneyInput). 
- `frontend/src/test02/TestAosr.tsx:420` — `{pForma.summa ?? ''}` (MoneyInput). 
- `frontend/src/test02/TestBirja.tsx:303` — `{yangiTaklif.narx}` (MoneyInput). 
- `frontend/src/test02/TestNarxlar.tsx:185` — `{yangiNarx}` (MoneyInput). 

## Смешанные редакторы: обязательна семантическая развилка

- `frontend/src/admin/sahifalar/OfertaNative.tsx:76` — `{v}` (input). SonKiritish: цены/суммы и hajm используют один редактор; добавить семантический флаг на callers.
- `frontend/src/erp/ErpQoshModal.tsx:88` — `{qiymatlar[f.key] ?? ''}` (input). Денежные ключи stavka/yetkazilganSumma/qarzimiz; остальные числовые — не автоматически деньги.
- `frontend/src/test02/TestErp.tsx:179` — `{fNarx}` (MoneyInput). kadrlar: зарплата (деньги); texnika: yoqilgiMejori (норма топлива, НЕ деньги). Нужен grouping по modul.
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:166` — `{value}` (input). data[field.key] ?? "": byudjet и summaBezNds — деньги; nds — %, requestedQty — количество.
- `frontend/src/umumiy/ui/QatorTahrirModal.tsx:115` — `{qiymatlar[maydon]}` (input). только maydon === narx — деньги; hajm — количество; прочее текст.
- `frontend/src/umumiy/ui/Sahifa.tsx:360` — `{qiymat}` (input). Kiritma: явный признак денег на caller; tur=number также используется для объёмов.

## Динамические определения и точки подключения

- `frontend/src/umumiy/ui/forms/SharedForms.tsx:30` — { key: 'byudjet', label: "Byudjet (Mo'ljal)", type: 'number' }, — byudjet/summaBezNds: ДЕНЬГИ; nds: ПРОЦЕНТ; requestedQty: КОЛИЧЕСТВО.
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:40` — { key: 'summaBezNds', label: 'Summa (QQS siz)', type: 'number' }, — byudjet/summaBezNds: ДЕНЬГИ; nds: ПРОЦЕНТ; requestedQty: КОЛИЧЕСТВО.
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:41` — { key: 'nds', label: 'QQS (%)', type: 'number', defaultValue: '12' }, — byudjet/summaBezNds: ДЕНЬГИ; nds: ПРОЦЕНТ; requestedQty: КОЛИЧЕСТВО.
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:85` — { key: 'requestedQty', label: 'Miqdor', type: 'number', required: true }, — byudjet/summaBezNds: ДЕНЬГИ; nds: ПРОЦЕНТ; requestedQty: КОЛИЧЕСТВО.
- `frontend/src/erp/sahifalar/ErpKadrlar.tsx:324` — { key: 'stavka', label: 'Kunlik stavka (so\'m)', type: 'number', placeholder: '250000' }, — ДЕНЬГИ: дневная ставка UZS; value у wrapper = qiymatlar[f.key] ?? пусто.
- `frontend/src/erp/sahifalar/ErpTaminot.tsx:478` — { key: 'yetkazilganSumma', label: 'Yetkazilgan summa (so\'m)', type: 'number' }, — ДЕНЬГИ: доставка/долг UZS; value у wrapper = qiymatlar[f.key] ?? пусто.
- `frontend/src/erp/sahifalar/ErpTaminot.tsx:479` — { key: 'qarzimiz', label: 'Qarzimiz (so\'m)', type: 'number' }, — ДЕНЬГИ: доставка/долг UZS; value у wrapper = qiymatlar[f.key] ?? пусто.

- SharedForms: добавить money metadata/allowlist по entity+key, не по type=number. TestLoyiha и TestShartnoma пользуются этим wrapper; отдельного денежного input в самих страницах нет.
- Sahifa.Kiritma: добавить явный признак денег; callers Narxlar и Shartnoma включают его, Sklad.obyomi оставляет обычным. Qidiruv — поиск, не денежный ввод.
- QatorTahrirModal: ветка только narx; текстовый raw должен дойти до sbT2QatorTahrir без групповых пробелов. Hajm не менять.
- OfertaNative.SonKiritish: денежные callers qatorNarx/guruhNarx; qatorHajm не денежный. Сохранить отложенный commit onBlur/Enter; текущий qolla читает state v, а не DOM. Не переносить commit на каждый ввод.
- ERP: metadata ErpField или точный allowlist трёх ключей; Number(e.target.value) в общей ветке не должен получать пробелы. Нормы топлива/литры/motochas остаются количеством.
- TestErp: найден реально смешанный fNarx — зарплата в kadrlar, норма топлива в texnika (payload yoqilgiMejori). Безусловный MoneyInput здесь ошибочен по требованию владельца; нужен grouping={modul === 'kadrlar'} либо разные controls.

## Сохранение, native forms и обработчики

- MoneyInput отдаёт onValueChange(raw); обычный event.target.value/currentTarget.value содержит отображение с пробелами. Сохранять raw в state и передавать старой логике. Не подделывать React event.
- Найденные денежные form onSubmit: SharedForms (onSubmit(data)), EstimateEditingWorkspace SET_PRICE (price state), StudioBosqichlar qoldaSaqla (qolda state). Здесь нет new FormData(form) / form.elements для суммы. Сохранять preventDefault, Enter и raw state.
- Поиск FormData по frontend/src: F2ImportV3, SmetaYuklaNative, api/t2-hujjat*, lib/catalog-release/client — multipart загрузки файлов, не сериализация денежных HTML controls. Текущего денежного native FormData consumer не найдено. Будущий name+FormData у MoneyInput получит DISPLAY; нужен hidden raw input с единственным name либо нормализация до сериализации.
- OfertaNative SonKiritish — onBlur=qolla, Enter=qolla, state v. Отдельный onBlur koefniOzgartir у koef.qiymatlar[kod] — коэффициент, НЕ деньги. StudioBosqichlar podvalFoiz — процент, НЕ деньги. TestFakt onBlur parseFloat(q.fakt_hajm), Enter вызывает blur — количество, НЕ деньги. Эти onBlur нельзя глобально мигрировать.
- F2OyTahrir price defaultValue=q.narx: прежний onChange Number(e.target.value)||0; заменить только источник raw, сохранить существующий commit/dirty lifecycle. F2Kafolat Enter/кнопка читает state qiymat; F2OyTahrir hujJami Enter уже удаляет пробелы.
- Shartnoma NDS — ДЕНЬГИ (jami=summa+nds). SharedForms nds — ПРОЦЕНТ QQS (%). ShartnomaLiniya nds — денежная сумма в тройке summa_bez_nds/nds/jami_nds_bilan, отдельные коэффициенты НДС в накрутке — процент.
- Number(raw)||0, value||пусто и удаление недесятичных символов — уже существующие ограничения в callers. Formatting-only не доказывает исправление NULL/0 или точности JS number. Не добавлять новых округлений; оставить исходную precision, отрицательные коррекции и пустой raw. TestErp удаляет всё кроме цифр — это отдельное существующее ограничение.
- Цены USD за токены, UZS/token, UZS/ч и курс UZS/USD — денежные цены/курсы, дробную часть сохранять. Token count/лимит token и проценты не становятся деньгами по слову limit/stavka.

## Проверенные исключения

- `frontend/src/admin/ai-markaz/AiXarajatBolimi.tsx:50` — `{ust}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/ai-markaz/AiXarajatBolimi.tsx:59` — `{uK}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/ai-markaz/AiXarajatBolimi.tsx:70` — `{ogoh}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/catalog-release/CatalogReleasePanel.tsx:57` — `{meta.yil ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/qismlar/F2OyTahrir.tsx:443` — `{q.hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/AdditionalReplacementNative.tsx:160` — `{hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/AgentKompaniyaSozlama.tsx:72` — `{limit}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:430` — `{soz.foyda_foiz}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:431` — `{soz.royxat_bonus_token}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:445` — `{misolKatak}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:457` — `{n.birlik}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:461` — `{n.foyda_foiz ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:476` — `{ustama}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/BoshqaruvPanel.tsx:490` — `{tf.oylik_token}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2AddReplModal.tsx:154` — `{hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2ImportV3.tsx:463` — `{serverId}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2Tayyorlash.tsx:370` — `{tanlov[b.kalit] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:219` — `{k.hajm[r.id] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:254` — `{k.hajm[i.id] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:325` — `{ndsFoiz}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/FaktJurnal.tsx:176` — `{k.qiymat}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/Fakturalar.tsx:864` — `{t.miqdori || ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/Fakturalar.tsx:879` — `{t.ndsStavkasi || ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/FaylBoglash.tsx:327` — `{String((q('svodCols') as Record<string, number>)?.[u.kalit] ?? '')}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/IshAbcModal.tsx:177` — `{ish.hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/IshAbcModal.tsx:188` — `{r.norma}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/IshAbcModal.tsx:190` — `{r.hajm ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/IshAbcModal.tsx:210` — `{fakt}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/NakopitelniyVedomost.tsx:464` — `{ndsFoiz}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/NakrutkaNative.tsx:280` — `{hajmDraft[q.qator_id] ?? (q.hajm_override == null ? '' : String(q.hajm_override))}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/NarxManbalari.tsx:101` — `{forma.yil ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/NarxManbalari.tsx:126` — `{((qolda ?? oqish?.ustunlar)?.boshQator ?? 0) + 1}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/NormSmetaWorkbench.tsx:121` — `{quantity}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/OfertaNative.tsx:429` — `{foiz}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/OfertaNative.tsx:447` — `{v.foiz}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/OfertaNative.tsx:465` — `{String(koef.qiymatlar[kod] ?? '')}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/OfertaNative.tsx:594` — `{qatorHajm[q.sourceId] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/PodvalKonstruktor.tsx:199` — `{q.foiz ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/ShaxsiySmeta.tsx:280` — `{i.hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/SmetaAiChat.tsx:411` — `{i.hajmIfoda ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/SmetaStudio.tsx:309` — `{hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/SmetaYuklaNative.tsx:1702` — `{c[k] + 1}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/SmetaYuklaNative.tsx:1718` — `{c[k] + 1}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/SmetaYuklaNative.tsx:1812` — `{c[k] + 1}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/Sozlamalar.tsx:231` — `{it.qiymat}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/StudioBosqichlar.tsx:600` — `{qiymat[k] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/StudioBosqichlar.tsx:617` — `{q.foiz == null ? '' : String(q.foiz)}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/sahifalar/StudioKoeffitsientlar.tsx:125` — `{yangi.qiymat}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/admin/zakazchik/TomonlarAloqa.tsx:62` — `{inn}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/components/smeta-studio-pro/EstimateEditingWorkspace.tsx:120` — `{quantity}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/components/smeta-studio-pro/EstimateEditingWorkspace.tsx:129` — `{scale}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/components/smeta-studio-pro/EstimateEditingWorkspace.tsx:172` — `{conversion}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/components/smeta-studio-pro/EstimateEditingWorkspace.tsx:173` — `{conversionEvidence}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/kirish/KirishSahifa.tsx:309` — `{regKod}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestAosr.tsx:416` — `{pForma.hajm ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestBirja.tsx:188` — `{yangiRfq.hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestF2.tsx:511` — `{kiritilgan[r.id] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestFakt.tsx:189` — `{kiritishlar[q.qator_id] || ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestFakt.tsx:268` — `{q.fakt_hajm}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestSklad.tsx:229` — `{formHajmi}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestXarita.tsx:1078` — `{maydonlar[m.kalit] || ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/test02/TestZayavka.tsx:301` — `{formMiqdor}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/umumiy/daraxt/SmetaTree.tsx:396` — `{currentFakt}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/umumiy/daraxt/SmetaTree.tsx:478` — `{currentOyVal}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/umumiy/daraxt/SmetaTree.tsx:570` — `{faktValue}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/umumiy/hujjat/HujjatTomonlari.tsx:49` — `{qiymat[m.k] ?? ''}`. Количество / % / коэффициент / счётчик / ID; не включать без явной денежной семантики.
- `frontend/src/umumiy/ui/AiHarakatKarta.tsx:54` — `{String(qiymat[m.kalit] ?? '')}`. HARAKAT_MAYDONLARI: количество/процент, денежного действия сейчас нет.
- `frontend/src/umumiy/ui/AiHarakatKarta.tsx:68` — ``. HARAKAT_MAYDONLARI: количество/процент, денежного действия сейчас нет.

Дополнительно: TestXarita создаёт только имя/адрес/реквизиты (YARATSA_BOLADI); byudjet/summa там отображаются, но не редактируются. Ierarxiya joriy(r,m) — текстовые d1/d2/d3. Sozlamalar form[m.key] — настройки путей/правил; shakl[m.kalit] — ключевые слова классификации. Коды INN/MFO/расчётный счёт/OTP/номер договора, год каталога и номера строк XLSX не группировать. AiHarakatKarta по HARAKAT_MAYDONLARI сейчас содержит только количества/проценты; не считать generic son денежным. F2Tayyorlash aiText — свободный AI prompt, а не сумма.

CatalogReleasePanel/NarxIndeksPaneli: числовой редактор года и загрузки, ручного monetary control не найдено; ручная цена каталога есть в NarxManbalari. ContractScopePanel: выбор строк и ссылка на основание, денежного редактора нет. TestTolov: поиск и отображение, денежного input нет.

## Проверка governance

node ops/governance-check.cjs: PASS governance artifacts (4 required files, 81 tasks); WARN CURRENT_STATE main_sha stale (recorded fb2955522b75d9ab84441cb2c70cecec5640e589; local origin/main 90a36f53fdf578ea2c65cff694fb9a14bcece530). Индексы/locks не исправлялись. Статус отчёта не означает TESTED rollout / BRANCH PUSHED / PROD VERIFIED.

## Контрольная дочитка во время параллельного rollout

- `frontend/src/umumiy/ui/Sahifa.tsx:360` — if (tur === 'money') return <MoneyInput value={qiymat} onValueChange={ozgardi} disabled={ozgarmas} placeholder={placeholder} className={`input h-9 px-3 text-sm w-full text-right tabular-nums ${ozgarmas ? 'opacity-60 cursor-not-allowed' : ''}`} />;
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:31` — { key: 'byudjet', label: "Byudjet (Mo'ljal)", type: 'money' },
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:41` — { key: 'summaBezNds', label: 'Summa (QQS siz)', type: 'money' },
- `frontend/src/umumiy/ui/forms/SharedForms.tsx:145` — {field.type === 'money' ? <MoneyInput value={value} onValueChange={v => handleChange(field.key, v)} placeholder={field.placeholder ? t(field.placeholder) : undefined} required={field.required} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" /> : field.type === 'textarea' ? (
- `frontend/src/test02/TestErp.tsx:179` — <MoneyInput

Это новые строки после основного снимка: parent уже подключил общие wrappers. Основной реестр сохраняет доказательства исходной семантики и не является списком оставшихся исправлений. Неизменность чужих исходников в работающем дереве не утверждается: аудит их только читал, parent менял параллельно.
