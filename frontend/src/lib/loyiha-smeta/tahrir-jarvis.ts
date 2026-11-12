/**
 * tahrir-jarvis.ts — Jarvis (Ctrl+K) o'qish vositasi `loyiha_tahrir`: «loyihada nima o'zgardi», «smeta qaysi joyda eskirgan». Faqat o'qiydi.
 * Pul: tahrir-farq.ts (hisob-yadro): avval QQS bilan, so'ng QQS siz; noma'lum narx «—». Asl smeta o'zgarmaydi; «eskirgan» — belgi, qaror — yozuv.
 */
import type { EskirganBolim, TahrirFarqDB, TahrirJami, TahrirQator } from './tahrir-farq';

export type TahrirMalumot = { eskiNom: string; yangiNom: string; smetaEskirgan: boolean; db: TahrirFarqDB; qatorlar: readonly TahrirQator[]; bolimlar: readonly EskirganBolim[]; jami: TahrirJami };

const sum = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));
const HOLAT: Record<string, string> = { ozgargan: 'o‘zgargan', olingan: 'olib tashlangan', yangi: 'yangi', olingan_varaq: 'varaq olib tashlangan', yangi_varaq: 'yangi varaq' };

export function tahrirMatni(m: TahrirMalumot | null | undefined, arg: string | null, limit = 10): string {
  if (!m) return 'Chizma tahrirlari farqi yo‘q: kamida ikkita tahrir yuklang (sahifa: /admin/loyiha-smeta, «Tahrirlar farqi»).';
  const bosh = `Tahrirlar: «${m.eskiNom}» → «${m.yangiNom}»${m.smetaEskirgan ? '' : ' (smeta asosi tahrir belgilanmagan)'}.`;
  const j = m.jami;
  if (arg && /eskir|stale|smeta/i.test(arg)) {
    if (!m.smetaEskirgan) return `${bosh} Smeta qaysi tahrirga asoslangani belgilanmagan — avval «Smeta asosi» ni belgilang.`;
    if (m.bolimlar.length === 0) return `${bosh} Smeta bo‘limlaridan eskirgani yo‘q (o‘zgargan elementlar smeta qatoriga bog‘lanmagan: ${j.bogsizSoni} ta).`;
    const q = m.bolimlar.slice(0, limit).map((b) => `- ${(b.bolimNom ?? '#' + b.bolimId).slice(0, 80)} · ${b.soni} element (${b.varaqlar.join(', ')}) · ${sum(b.pulQQSbilan)} so‘m QQS bilan · qarori bor: ${b.hal}`);
    return [bosh, `Eskirgan smeta bo‘limlari: ${m.bolimlar.length}. Qarori kerak elementlar: ${j.qarorKutadi}.`, ...q, m.bolimlar.length > limit ? `… yana ${m.bolimlar.length - limit} ta.` : ''].filter(Boolean).join('\n');
  }
  const v = m.db.varaqlar.filter((x) => x.holat !== 'ayni');
  const katta = [...m.qatorlar].sort((a, b) => Math.abs(b.pulQQSbilan ?? 0) - Math.abs(a.pulQQSbilan ?? 0) || Math.abs(b.item.foiz ?? 0) - Math.abs(a.item.foiz ?? 0)).slice(0, limit)
    .map((x) => `- ${x.item.varaq} ${x.item.nom} (${HOLAT[x.item.holat]}): ${sum(x.item.eski_miqdor)} → ${sum(x.item.yangi_miqdor)} ${x.item.yangi_birlik ?? x.item.eski_birlik ?? ''}${x.item.foiz != null ? ` (${x.item.foiz > 0 ? '+' : ''}${x.item.foiz} %)` : ''}; ${sum(x.pulQQSbilan)} so‘m QQS bilan${x.qaror ? `; qaror: ${x.qaror}` : ''}`);
  return [bosh, `Varaqlar: o‘zgargan ${j.varaqOzgargan}, olib tashlangan ${j.varaqOlingan}, yangi ${j.varaqYangi} (jami farqli ${v.length}).`,
    `Elementlar: ${j.elementSoni}; pul ta’siri ${sum(j.pulQQSbilan)} so‘m QQS bilan (${sum(j.pulQQSsiz)} QQS siz); narxsiz ${j.narxsizSoni}, smetaga bog‘lanmagan ${j.bogsizSoni}; qarori kerak ${j.qarorKutadi}.`, ...katta].join('\n');
}
