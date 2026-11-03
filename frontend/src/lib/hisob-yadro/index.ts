/**
 * HISOB YADROSI — tizimdagi YAGONA pul hisobi (ustama kaskadi, yaxlitlash, QQS, yaxlit svod, ko'rinishlar).
 * Toza TS: DOM/tarmoq yo'q (Tauri oflayn ham shuni ishlatadi). Bir joyda tuzatish — hamma joyda tuzatish.
 *
 * Kaskad formulalari FAQAT `podval.ts` dagi baholovchida; boshqa fayl `tr_mat`/`skl_mat`/`prochie` arifmetikasini
 * qayta yozmaydi (`hisob-yadro.guard.test.ts` tekshiradi).
 */
export * from './yaxlit';
export * from './nds';
export * from './kategoriya';
export * from './podval';
export * from './kaskad';
export * from './yaxlit-svod';
export * from './korinish';
export * from './f2-podval';
