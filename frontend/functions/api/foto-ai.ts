/**
 * foto-ai.ts — FOTO-DALIL AI burchagi: rasmga qisqa izoh yozadi va qaysi ishni ko'rsatayotganini TAKLIF qiladi.
 * Faqat TAKLIF: manbani foydalanuvchi tasdiqlaydi (t2_foto_dalil_yangila_v1 orqali). Model chaqiruvi HISOBLI (aiHisobli):
 * oylik limit, kompaniya hamyoni, sarf jurnali. Limit yo'q = AI yo'q. Rasm bazaga yozilmaydi.
 *
 *   POST /api/foto-ai { kompaniya_id, base64, mimeType, nomzodlar?: [{ tur, id, nom }] (<= 40) }
 *   -> { ok, izoh, taklif: { manba_turi, manba_id, nom, ishonch } | null }
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { aiPublicError, parseJsonText } from '../_shared/ai';
import { AiByudjetXatosi, aiHisobli } from '../_shared/ai-hisobli';
import { sessiyaKompaniya } from '../_shared/ai-kompaniya';

type Env = Record<string, string | undefined> & { SESSIYA_KALIT: string };

const MAX_BYTES = 3 * 1024 * 1024;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_NOMZOD = 40;
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['izoh', 'tanlov', 'ishonch'],
  properties: {
    izoh: { type: 'string', description: 'Rasmda nima ko‘rinayotgani: 1 qisqa gap, o‘zbek tilida' },
    tanlov: { type: 'integer', description: 'Nomzodlar ro‘yxatidagi mos raqam (0 dan boshlab); mos kelmasa -1' },
    ishonch: { type: 'number', description: '0..1' },
  },
};

type Nomzod = { tur: string; id: number; nom: string };

export function nomzodlarniTozala(v: unknown): Nomzod[] {
  if (!Array.isArray(v)) return [];
  const out: Nomzod[] = [];
  for (const e of v.slice(0, MAX_NOMZOD) as Array<Record<string, unknown>>) {
    const id = Number(e?.id); const tur = String(e?.tur ?? '');
    if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-z][a-z0-9_]{1,30}$/.test(tur)) continue;
    out.push({ tur, id, nom: String(e?.nom ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) });
  }
  return out;
}

/** Model javobini xavfsiz taklifga aylantiradi: faqat nomzodlar ro'yxatidagi variant, ishonch 0..1. */
export function taklifQur(natija: unknown, nomzodlar: readonly Nomzod[]): { izoh: string; taklif: { manba_turi: string; manba_id: number; nom: string; ishonch: number } | null } {
  const o = (natija && typeof natija === 'object' ? natija : {}) as Record<string, unknown>;
  const izoh = String(o.izoh ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const i = Number(o.tanlov); const ish = Math.min(1, Math.max(0, Number(o.ishonch) || 0));
  const n = Number.isInteger(i) && i >= 0 ? nomzodlar[i] : undefined;
  return { izoh, taklif: n ? { manba_turi: n.tur, manba_id: n.id, nom: n.nom, ishonch: Math.round(ish * 100) / 100 } : null };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const session = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!session) return Response.json({ ok: false, xabar: 'Kirish talab qilinadi' }, { status: 401 });
    let body: { kompaniya_id?: unknown; base64?: unknown; mimeType?: unknown; nomzodlar?: unknown };
    try { body = await ctx.request.json(); } catch { return Response.json({ ok: false, xabar: 'Noto‘g‘ri JSON' }, { status: 400 }); }
    const komp = sessiyaKompaniya(session, body.kompaniya_id);
    if (!komp.ok) return Response.json({ ok: false, xabar: komp.xabar }, { status: komp.status });
    const mimeType = String(body.mimeType || '').toLowerCase();
    const data = String(body.base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!MIME.has(mimeType) || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) return Response.json({ ok: false, xabar: 'Rasm formati noto‘g‘ri' }, { status: 400 });
    if (Math.floor((data.length * 3) / 4) > MAX_BYTES) return Response.json({ ok: false, xabar: 'Rasm 3 MB dan oshmasligi kerak' }, { status: 400 });
    const nomzodlar = nomzodlarniTozala(body.nomzodlar);

    const royxat = nomzodlar.length ? nomzodlar.map((n, i) => `${i}: ${n.nom}`).join('\n') : '(ro‘yxat yo‘q)';
    const r = await aiHisobli(ctx.env as never, komp.actor, komp.id, 'company_access', 'foto_tavsif', {
      system: 'Siz qurilish maydonidagi foto uchun yordamchisiz. Faqat rasmda aniq ko‘ringan narsani yozing, taxmin qilmang. Javob faqat JSON schema bo‘yicha.',
      text: ['Rasmga 1 qisqa gap izoh yozing (o‘zbek tilida, lotin).', 'Quyidagi ish nomlaridan rasm aniq mos keladiganini tanlang; aniq mos kelmasa tanlov = -1.', 'Ish nomlari:', royxat].join('\n'),
      attachment: { mimeType, data },
      jsonSchema: { name: 'foto_tavsif', schema: SCHEMA },
      temperature: 0, maxOutputTokens: 400, tier: 'fast',
    });
    const q = taklifQur(parseJsonText(r.text), nomzodlar);
    return Response.json({ ok: true, ...q, model: r.model });
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return Response.json({ ok: false, xabar: e.xabar, code: e.kod }, { status: 402 });
    const p = aiPublicError(e);
    return Response.json({ ok: false, xabar: p.message, code: p.code }, { status: p.code === 'request_invalid' ? 400 : 502 });
  }
};
