/**
 * Ijrochisi (amal-ijro.ts IJROCHILAR) bor amal kalitlari — SOF ro'yxat (API klientlarini import qilmaydi): Jarvis vosita reestri (functions ham import qiladi)
 * ijrochi bor-yo'qligini sinxron biladi. amal-vosita.test.ts IJROCHILAR kalitlari bilan tengligini tekshiradi (ikkita ro'yxat farq qilib qolmaydi).
 */
export const AMAL_IJRO_KALITLAR: ReadonlySet<string> = new Set(['fakt.kiritish', 'tomon.taqdim', 'tomon.qaror', 'tomon.murojaat', 'lab.sorov', 'bux.davr', 'zayavka.yaratish', 'moliya.tolov', 'arxiv.obyekt', 'hr.tabel', 'tomon.aloqa', 'f2.tasdiqlash', 'buyurtma.qabul', 'chizma.chiqar', 'moliya.xarajat']);
