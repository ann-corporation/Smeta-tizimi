/**
 * F2 / FAKT MCP vositalari Jarvis uchun (egasi 2026-11-18): smeta MCP serverining o'qish (f2, f2_royxat, fakt_jurnal, obyekt_holat, qator_qidir,
 * nakopitelniy, ostatka) va yozish (fakt_yoz, f2_qoralama_tahrir, zamena_qosh, bajarilmadi, narx_tuzat) vositalari — JORIY foydalanuvchi huquqi bilan.
 * Bajaruvchi — `/api/f2-buyruq` (server): ruxsat, aktor, token yechish va dry_run preview o'sha yerda; bu yerda faqat yupqa qobiq.
 *
 * Yozuv qoidasi: vosita HECH QACHON darhol yozmaydi. U server dry_run (ROLLBACK) preview ini oladi va taklif kartasini qaytaradi
 * («Tasdiqlash» bosilgach `f2_tasdiq` aynan shu token bilan yozadi). Pulga ta'sir qiluvchi (narx, F2) — ikkinchi «Tasdiqlayman».
 * Buyruq shakli (LLM niyat qatlami ham, foydalanuvchi ham): `mcp <vosita> {"obyekt_id": 5, ...}`; obyekt_id berilmasa joriy obyekt olinadi.
 * Parallel ta'rif yo'q: nom, tavsif, parametrlar — src/lib/jarvis/f2-vositalar.ts reyestridan.
 */
import { F2_VOSITALAR, OQISH_NOMLARI, YOZISH_NOMLARI, type Vosita as F2Vosita } from '../../jarvis/f2-vositalar';
import { t } from '../../../i18n/til';
import type { F2Javob, F2Preview, F2Uchlik } from '../../jarvis/f2-javob';
import { pulMatn } from './yordam';
import type { Vosita, VositaJavob, VositaKont } from './tur';

const javob = (matn: string, xato = false): VositaJavob => ({ tur: 'javob', matn, xato: xato || undefined });
const pul = (n: number | null | undefined) => (n == null ? '—' : pulMatn(n));
const ishorali = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${pulMatn(n)}`);
const son = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(n * 1e6) / 1e6).replace('.', ','));

/** Server xato kodi → tushunarli o'zbekcha (ichki matn ko'rsatilmaydi). */
export function f2XatoMatni(j: F2Javob): string {
  const m: Record<string, string> = {
    F2_OY_QATOR_TAKROR: t('Bu qator shu oy uchun boshqa F-2 ga kiritilgan. Mavjud F-2 ni ochib tahrirlang.'),
    PERMISSION_DENIED: 'Bu amalga sizda ruxsat yo\'q.', MODULE_DISABLED: 'Bu modul kompaniyangizda o\'chirilgan.', TOPILMADI: 'Obyekt yoki hujjat topilmadi.', DRY_RUN_YOQ: 'Yozuv hozircha yoqilmagan (server tekshiruvi tayyor emas).',
    TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to\'ldiring.', TOKEN_MUDDATI_OTGAN: 'Tasdiq muddati o\'tdi — qayta so\'rang.', TOKEN_YAROQSIZ: 'Tasdiq yaroqsiz — qayta so\'rang.',
    MALUMOT_OZGARGAN: 'Ko\'rsatilgandan keyin ma\'lumot o\'zgargan — qayta so\'rang (yozilmadi).', QATOR_FAOL_EMAS: 'Qator joriy (faol) smeta versiyasida emas.', QATOR_TOPILMADI: 'Qator bu obyektda yo\'q.',
    AKT_QORALAMA_EMAS: 'Faqat qoralama F2 tahrirlanadi (tasdiqlangan/yuborilgan F2 muzlagan).', ARGUMENT_TAQIQLANGAN: 'Aktor va kompaniya yuborilmaydi — ular sessiyadan olinadi.',
    OBYEKT_KERAK: 'Obyektni tanlang.', QIDIRUV_BOSH: 'Qidiruv uchun nom, kod yoki tur bering.', SABAB_KERAK: 'Sababni yozing (kamida 3 belgi).', FAQAT_RESURS: 'Faqat resurs (rs/mat/ob) narxi tuzatiladi.',
  };
  const code = String(j.code ?? j.xabar ?? '');
  return m[code] ?? (j.xabar ? String(j.xabar) : `Amal bajarilmadi (${String(j.code ?? 'xato')}).`);
}

const uchlikQator = (n: string, u: F2Uchlik | null | undefined) => (u ? `- ${n}: ${pul(u.qqs_bilan)} (QQS bilan) · ${pul(u.ustamali)} (ustamali) · ${pul(u.ustamasiz)} (ustamasiz)` : `- ${n}: —`);

/** Server preview → kartadagi matn: qator oldin→keyin; jami QQS bilan → ustamali → ustamasiz (oldin → keyin, farq). */
export function previewMatni(j: F2Javob): string {
  const p = j.preview as F2Preview | undefined;
  const q: string[] = [];
  if (j.tavsif) q.push(`**${j.tavsif}**`);
  /* Transport vositalari: summa paketi yo'q (qator tagiga t·km qo'shiladi) — tayyor matnli preview. */
  if (typeof j.korinish === 'string') return [...q, j.korinish, ...(j.ogohlantirish ?? []).map((o) => `⚠ ${o}`)].join('\n');
  for (const r of (p?.qatorlar ?? []).slice(0, 12)) {
    const nom = `${r.kod ?? `#${r.qator_id}`} ${(r.nom ?? '').slice(0, 50)}`.trim();
    q.push(r.olib_tashlandi ? `- ${nom}: olib tashlanadi` : `- ${nom}: ${r.ozgarish.map((o) => `${o.maydon} ${son(o.oldin)} → ${son(o.keyin)}`).join('; ') || 'o\'zgarmaydi'}${r.yangi ? ' (yangi)' : ''}`);
  }
  if ((p?.qatorlar.length ?? 0) > 12) q.push(`… yana ${p!.qatorlar.length - 12} qator`);
  const t = p?.jami;
  if (t && (t.oldin || t.keyin)) {
    q.push('**Jami (server hisobi):**', uchlikQator('Oldin', t.oldin), uchlikQator('Keyin', t.keyin));
    if (t.farq) q.push(`- Farq: ${ishorali(t.farq.qqs_bilan)} (QQS bilan) · ${ishorali(t.farq.ustamali)} (ustamali) · ${ishorali(t.farq.ustamasiz)} (ustamasiz)`);
    if (t.keyin?.narxsiz_soni) q.push(`⚠ ${t.keyin.narxsiz_soni} narxsiz qator — summasi bo'sh (0 emas).`);
  } else q.push('Jami: server summa paketini bermadi (noma\'lum, 0 emas).');
  for (const o of j.ogohlantirish ?? []) q.push(`⚠ ${o}`);
  if (j.birlik_soni) q.push(`Token: tasdiqlanganda yoziladi (${j.birlik_soni} birlik hisobi).`);
  return q.join('\n');
}

/** Oddiy o'qish natijasi → ixcham markdown (xom JSON emas). */
export function oqishMatni(nom: string, j: F2Javob): string {
  const ob = (j.obyekt as { nom?: string } | undefined)?.nom;
  const bosh = ob ? `**${ob}**\n` : '';
  const royxat = (a: unknown): Array<Record<string, unknown>> => (Array.isArray(a) ? a as Array<Record<string, unknown>> : []);
  switch (nom) {
    case 'obyekt_holat':
      return `${bosh}${['smeta', 'fakt', 'f2', 'f2_qoralama'].map((k) => uchlikQator({ smeta: 'Smeta', fakt: 'Fakt', f2: 'F2 (tasdiqlangan)', f2_qoralama: 'F2 qoralama' }[k]!, j[k] as F2Uchlik | null)).join('\n')}`;
    case 'f2_royxat':
      return `${bosh}${royxat(j.aktlar).slice(0, 15).map((a) => `- F2 № ${a.raqam ?? a.id} · ${String(a.oy ?? '').slice(0, 7)} · ${a.holat}${a.lifecycle_status ? `/${a.lifecycle_status}` : ''} (id ${a.id})`).join('\n') || 'Hujjat yo\'q.'}`;
    case 'f2':
      return `${bosh}Akt № ${(j.akt as { raqam?: string; id?: number } | undefined)?.raqam ?? (j.akt as { id?: number } | undefined)?.id}\n${uchlikQator('Jami', j.summa as F2Uchlik | null)}\n${royxat(j.qatorlar).slice(0, 12).map((x) => `- ${x.kod ?? `#${x.qator_id}`} ${String(x.nom ?? '').slice(0, 40)}: ${son(Number(x.certified_quantity ?? x.hajm))} ${x.birlik ?? ''}`).join('\n')}`;
    case 'fakt_jurnal':
      return `${bosh}${royxat(j.qator_boyicha).slice(0, 15).map((x) => `- #${x.qator_id}: sof fakt ${son(Number(x.net_hajm))} (${x.yozuv} yozuv)`).join('\n') || 'Fakt yozuvi yo\'q.'}`;
    case 'qator_qidir':
      return `${bosh}${royxat(j.qatorlar).slice(0, 15).map((x) => `- #${x.id} ${x.kod ?? ''} ${String(x.nom ?? '').slice(0, 50)} (${x.birlik ?? '—'}, ${x.tur})`).join('\n') || 'Topilmadi.'}`;
    case 'ostatka':
      return `${bosh}${royxat(j.qatorlar).slice(0, 15).map((x) => `- #${x.qator_id} ${String(x.nom ?? '').slice(0, 40)}: qoldiq ${son(x.qoldiq_hajm as number | null)} ${x.birlik ?? ''}`).join('\n') || 'Qoldiq qator yo\'q.'}`;
    case 'transport_tekshir': {
      const x = (j.xulosa ?? {}) as Record<string, number>;
      return `${bosh}- foiz: ${x.foiz ?? '—'} · t·km: ${x.tkm ?? '—'} · narx ichida: ${x.narx_ichida ?? '—'} · t·km qatorlari: ${x.tkm_qator_soni ?? '—'}\n- **Xatolar: ${x.xato_soni ?? '—'}**${royxat(j.xatolar).slice(0, 8).map((e) => `\n  - ${e.kod} #${e.qator_id}: ${e.xabar}`).join('')}`;
    }
    default:
      return `${bosh}${JSON.stringify(j.jami ?? j).slice(0, 1500)}`;
  }
}

/** `mcp <nom> {json}` buyrug'idan JSON argumentlar (bo'sh — {}); noto'g'ri JSON — null. */
export function f2ArgAjrat(xom: string, nom: string): Record<string, unknown> | null {
  const m = new RegExp(`^\\s*mcp[\\s:]+${nom}\\b\\s*([\\s\\S]*)$`, 'i').exec(xom);
  const s = (m?.[1] ?? '').trim();
  if (!s) return {};
  try { const o = JSON.parse(s) as unknown; return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null; } catch { return null; }
}

const PUL_TASIRLI = new Set(['narx_tuzat', 'f2_qoralama_tahrir', 'transport_taqsimla']);
const OBYEKTSIZ = new Set(['f2', 'f2_qoralama_tahrir']);

function vositaYasa(t: F2Vosita): Vosita {
  const yozish = (YOZISH_NOMLARI as readonly string[]).includes(t.nom);
  return {
    id: `mcp_${t.nom}`, tur: yozish ? 'yozish' : 'oqish', pul: PUL_TASIRLI.has(t.nom), hujjat: t.nom.startsWith('f2') || undefined, ruxsat: t.ruxsat[0] ?? null,
    parametrlar: Object.fromEntries(Object.entries(t.kirish).map(([k, izoh]) => [k, { tur: 'matn' as const, izoh, majburiy: /majburiy/.test(izoh) || undefined }])),
    tavsif: `${t.tavsif} Buyruq: mcp ${t.nom} {JSON}.`,
    mos: (_t, xom) => new RegExp(`^\\s*mcp[\\s:]+${t.nom}\\b`, 'i').test(xom),
    ishla: async (c: VositaKont, _slot, xom) => {
      const api = c.api.f2Mcp;
      if (!api) return javob('F2/fakt vositalari bu yerda hali ulanmagan.', true);
      const args = f2ArgAjrat(xom, t.nom);
      if (!args) return javob(`Argument JSON bo'lishi kerak: mcp ${t.nom} {"obyekt_id": 5, ...}`, true);
      if (args.obyekt_id == null && !OBYEKTSIZ.has(t.nom) && c.obyekt) args.obyekt_id = c.obyekt.id;
      const j = await api(t.nom, args);
      if (!j.ok) return javob(f2XatoMatni(j), true);
      if (!yozish) return javob(oqishMatni(t.nom, j));
      if (j.holat === 'rad') return javob(`Server tekshiruvi rad etdi — yozilmadi.\n${previewMatni(j)}\n⚠ ${j.xabar ?? ''}`, true);
      const token = j.token;
      if (j.holat !== 'tasdiq_kerak' || !token) return javob('Server preview bermadi — yozilmadi.', true);
      return {
        tur: 'taklif', nom: j.tavsif ?? t.nom, izoh: previewMatni(j), pul: PUL_TASIRLI.has(t.nom), matn: `${j.tavsif ?? t.nom} — server tekshiruvi (dry_run) tayyor. Hali yozilmagan.`,
        bajar: async () => {
          const r = await api('f2_tasdiq', { token, tasdiqlayman: true });
          return [r.ok ? `✓ ${j.tavsif ?? t.nom}: yozildi${r.sarflandi ? ` (${r.sarflandi} token)` : ''}` : `✗ ${f2XatoMatni(r)}`];
        },
      };
    },
  };
}

/** Faqat o'qish va yozuvchi (preview) vositalar; `f2_tasdiq` — vosita emas, taklif kartasining «Tasdiqlash» tugmasi. */
export const F2_MCP_VOSITALARI: readonly Vosita[] = F2_VOSITALAR.filter((t) => (OQISH_NOMLARI as readonly string[]).includes(t.nom) || (YOZISH_NOMLARI as readonly string[]).includes(t.nom)).map(vositaYasa);
