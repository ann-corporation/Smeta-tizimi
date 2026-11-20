import { NAV_SAHIFALAR } from '../../../src/lib/nav/navReestr';
import { SAHIFALAR } from '../../../src/lib/reestr/sahifa';
import { sahifaKorinadi } from '../../../src/lib/nav/navFiltr';
import { navigationPages, navigationTarget, navigationUrl, type JarvisOpen } from '../../../src/lib/jarvis/navigation';
import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { f2RegisterAnswer, f2RegisterIntent } from './f2-register';

export function navigationVisible(men: RpcNatija | null, company: number, key: string): boolean {
  const contexts = men?.data.context_kompaniyalar;
  if (!men?.ok || !Array.isArray(contexts)) return false;
  const matches = contexts.filter(row => row?.kompaniya_id === company);
  const registered = SAHIFALAR.find(row => row.kalit === key);
  const page = NAV_SAHIFALAR.find(row => row.yol === registered?.yol);
  if (matches.length !== 1 || !page || !Array.isArray(matches[0].permissions)) return false;
  const context = matches[0];
  const denied = Array.isArray(context.explicit_denials) ? context.explicit_denials : [];
  const off: string[] = Array.isArray(context.modullar_off) ? context.modullar_off : [];
  return sahifaKorinadi(page.guruh, page.yol, {
    superadmin: men.data.platform_role === 'superadmin', rol: String(context.effective_role ?? ''),
    permissions: context.permissions.filter((permission: string) => !denied.includes(permission)),
    modullar: off.map(kod => ({ kod, holat: 'off', nom: kod, izoh: null, manba: 'server', versiya: 0 })),
  });
}
export async function navigationAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, men: RpcNatija | null, key?: string) {
  const text = scope.text!;
  const f2 = f2RegisterIntent(scope.question + ' holati');
  if (f2?.number && (!key || key === 'f2-tarix')) {
    if (!navigationVisible(men, scope.company, 'f2-tarix')) return { rad: true, javob: text('F2 ni ko‘rish uchun ruxsat kerak.', 'Для просмотра КС-2 нужен доступ.') };
    const answer = await f2RegisterAnswer(rpc, scope, f2);
    const evidence = 'dalil' in answer ? answer.dalil as { id: number; akt_ids: number[] } : null;
    const target = evidence?.akt_ids.length === 1 && navigationVisible(men, scope.company, 'f2-tarix')
      ? navigationTarget('f2-tarix', { obyekt: evidence.id, akt: evidence.akt_ids[0] }) : null;
    return { ...answer, ...(target ? { ochish: target, sahifalar: [{ yol: navigationUrl(target), nom: text('F2 ni ochish', 'Открыть КС-2') }] } : {}) };
  }
  const keys = key ? [key] : navigationPages(scope.question);
  const pages = keys.filter(item => navigationVisible(men, scope.company, item)).slice(0, 3);
  if (!pages.length) return { rad: true, javob: text('Mos sahifa topilmadi yoki uni ochishga ruxsat yo‘q.', 'Подходящая страница не найдена или доступ запрещён.') };
  const targets: JarvisOpen[] = [];
  let objectId: number | null = null;
  if (pages.some(item => SAHIFALAR.find(page => page.kalit === item)?.scope === 'OBJECT_SCOPED') && jarvisHasPermission(men, scope.company, 'smeta.read')) {
    const selected = await resolveJarvisObject(rpc, scope);
    if (selected.tur === 'bor') objectId = selected.obyekt.id;
  }
  for (const item of pages) {
    const page = SAHIFALAR.find(row => row.kalit === item)!;
    const target = navigationTarget(item, page.scope === 'OBJECT_SCOPED' && objectId ? { obyekt: objectId } : {});
    if (target) targets.push(target);
  }
  const sahifalar = targets.map(target => ({ yol: navigationUrl(target), nom: SAHIFALAR.find(row => row.kalit === target.kalit)!.nom }));
  return { javob: sahifalar.map(page => `[${page.nom}](${page.yol})`).join('\n'), sahifalar,
    ...(targets.length === 1 ? { ochish: targets[0] } : {}), ochish_variantlar: targets };
}

/** Browser IDs are hints. Only an actor/company/object-verified F2 can enter the model context. */
export async function verifiedPageContext(rpc: JarvisReadRpc, scope: JarvisObjectScope, men: RpcNatija | null, act: unknown, page: unknown) {
  if (!Number.isSafeInteger(act) || Number(act) <= 0 || !['/admin/f2-tarix', '/admin/f2-tayyorlash'].includes(String(page)) ||
      !jarvisHasPermission(men, scope.company, 'f2.read')) return null;
  const selected = await resolveJarvisObject(rpc, scope);
  if (selected.tur !== 'bor') return null;
  const result = await rpc('t2_akt_reestr_obyekt_v1', { p_actor_id: scope.actor, p_obyekt_id: selected.obyekt.id, p_tur: 'f2' });
  const rows = result.ok && Array.isArray(result.data.qatorlar) ? result.data.qatorlar : [];
  const matches = rows.filter(row => row?.id === act && row.tur === 'f2' && row.obyekt_id === selected.obyekt.id && row.kompaniya_id === scope.company);
  return matches.length === 1 ? { obyekt_id: selected.obyekt.id, akt_id: Number(act), raqam: matches[0].raqam, oy: matches[0].oy } : null;
}
