/**
 * F2 / FAKT MCP vositalari katalogi (egasi 2026-11-18): Jarvis smeta MCP o'qish + yozish toollarini JORIY foydalanuvchi huquqi bilan bajaradi.
 * Yagona manba — src/lib/jarvis/f2-vositalar.ts (server ham shuni ishlatadi); bu yerda faqat Jarvis katalogi (`barchaVositalar`) uchun ko'rinish.
 * Alohida fayl: vositalar-reestr.ts dagi barchaVositalar() shu ro'yxatni qo'shadi (bitta import).
 * Yozuvlar DOIM karta: server dry_run preview + «Tasdiqlash»; pulga ta'sir qiluvchilari (narx, F2 qoralama) — ikkinchi «Tasdiqlayman».
 */
import { F2_VOSITALAR, OQISH_NOMLARI, YOZISH_NOMLARI } from '../jarvis/f2-vositalar';
import type { YordamchiVosita } from './vositalar-reestr';

const MISOL: Record<string, readonly string[]> = {
  f2_royxat: ['obyektdagi F2 hujjatlar ro\'yxatini ko\'rsat'], f2: ['F2 aktini ko\'rsat (qatorlari va jami)'], fakt_jurnal: ['fakt tarixini ko\'rsat'],
  obyekt_holat: ['obyekt holati: smeta, fakt, F2 QQS bilan, ustamali, ustamasiz'], qator_qidir: ['smetada beton qatorini top'], nakopitelniy: ['nakopitelniy jamini ko\'rsat'],
  ostatka: ['ostatka: qaysi qatorlarda qoldiq bor?'], fakt_yoz: ['beton qatoriga 5 m3 fakt yoz'], f2_qoralama_tahrir: ['F2 qoralamasida bu qator hajmini 12 qil'],
  zamena_qosh: ['bu qatorni boshqa material bilan zamena qil'], bajarilmadi: ['bu qatorlarni «bajarilmadi» deb belgila'], narx_tuzat: ['bu qator narxini 120000 qil (QQS siz)'],
};
const PUL_TASIRLI = new Set(['narx_tuzat', 'f2_qoralama_tahrir']);

export const F2_MCP_KATALOG: readonly YordamchiVosita[] = F2_VOSITALAR
  .filter((t) => (OQISH_NOMLARI as readonly string[]).includes(t.nom) || (YOZISH_NOMLARI as readonly string[]).includes(t.nom))
  .map((t): YordamchiVosita => {
    const yozish = (YOZISH_NOMLARI as readonly string[]).includes(t.nom);
    return { id: `${yozish ? 'yozuv' : 'oqish'}.mcp_${t.nom}`, tur: yozish ? 'yozuv' : 'oqish', nom: t.tavsif.split(/(?<=\.)\s/)[0], misol: MISOL[t.nom] ?? [],
      tasdiq: yozish ? (PUL_TASIRLI.has(t.nom) ? 'kartaPul' : 'karta') : 'yoq',
      manba: yozish ? `/api/f2-buyruq vosita ${t.nom} -> server dry_run (t2_jarvis_dry_run_v1) preview -> f2_tasdiq (token yechiladi; operation_id)` : `/api/f2-buyruq vosita ${t.nom} (smeta MCP bilan bir xil o'qish; ruxsat serverda)` };
  });
