/**
 * ChatGPT moslik qatlami. ChatGPT deep research / «company knowledge» ikkita o'qish toolini talab qiladi: `search` va `fetch`
 * (https://developers.openai.com/api/docs/mcp). To'liq tool to'plami (developer mode) o'zgarishsiz qoladi.
 *
 *  - search({query}) → {results:[{id,title,url}]}  — foydalanuvchi kompaniyalaridagi obyektlar (mavjud `obyektlar` tooli orqali:
 *    tenant doirasi va vakolat tekshiruvi `masofaviyChaqir` da, yangi SQL yo'q).
 *  - fetch({id})     → {id,title,text,url,metadata}  — obyekt holati (mavjud `obyekt_holat` tooli, summalar NDS siz).
 * Natija `structuredContent` + JSON matn (ikkala shakl ham yuboriladi). `url` bo'sh bo'lmasligi shart (aks holda ChatGPT iqtibos
 * keltirmaydi).
 */
import { obyektHolat, obyektlar } from '../../smeta-mcp/src/tools/obyekt';
import type { Muhit } from '../../smeta-mcp/src/muhit';
import { masofaviyChaqir } from './siyosat';
import type { Vakolat } from './vakolat';

export const SAYT_STANDART = 'https://smeta-tizimi.pages.dev';
export const OB_ID = /^obyekt:(\d{1,12})$/;
export const obyektUrl = (sayt: string | undefined, id: number) => `${(sayt || SAYT_STANDART).trim().replace(/\/+$/, '')}/?obyekt=${id}`;

/** ChatGPT tool metadatasi: OAuth talab qilinadi (server baribir har chaqiruvda tokenni tekshiradi). */
export const SECURITY_META = { securitySchemes: [{ type: 'oauth2', scopes: ['smeta'] }] };

export type QidirNatija = { results: Array<{ id: string; title: string; url: string }> };
export type FetchNatija = { id: string; title: string; text: string; url: string; metadata?: Record<string, string> };
type Javob = { content: Array<{ type: 'text'; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> };

const xato = (text: string): Javob => ({ content: [{ type: 'text', text }], isError: true });
const ok = (x: QidirNatija | FetchNatija): Javob => ({ content: [{ type: 'text', text: JSON.stringify(x) }], structuredContent: x as unknown as Record<string, unknown> });

const tahlil = <T>(text: string): T | null => { try { return JSON.parse(text) as T; } catch { return null; } };

export async function qidir(query: string, mu: Muhit, v: Vakolat, sayt?: string): Promise<Javob> {
  const q = query.trim().slice(0, 100);
  type Ob = { obyektlar?: Array<{ id: number; nom?: string; kompaniya?: string }> };
  let j = await masofaviyChaqir(obyektlar, mu, v, { qidir: q, limit: 20 });
  if (j.isError) return xato(j.content[0]?.text ?? 'Qidiruv xatosi');
  let r = tahlil<Ob>(j.content[0]?.text ?? '')?.obyektlar ?? [];
  // Tabiiy tildagi savol obyekt nomiga mos kelmasa — foydalanuvchining o'z obyektlari ro'yxati (doira baribir uning kompaniyalari).
  if (!r.length) {
    j = await masofaviyChaqir(obyektlar, mu, v, { limit: 10 });
    if (j.isError) return xato(j.content[0]?.text ?? 'Qidiruv xatosi');
    r = tahlil<Ob>(j.content[0]?.text ?? '')?.obyektlar ?? [];
  }
  return ok({ results: r.map((o) => ({ id: `obyekt:${o.id}`, title: `${o.nom ?? 'Obyekt'}${o.kompaniya ? ` (${o.kompaniya})` : ''}`, url: obyektUrl(sayt, o.id) })) });
}

export async function olish(id: string, mu: Muhit, v: Vakolat, sayt?: string): Promise<Javob> {
  const m = OB_ID.exec(id.trim());
  if (!m) return xato('id noto\'g\'ri: «obyekt:<son>» ko\'rinishida bo\'lishi kerak (search natijasidagi id).');
  const n = Number(m[1]);
  const j = await masofaviyChaqir(obyektHolat, mu, v, { obyekt_id: n });
  if (j.isError) return xato(j.content[0]?.text ?? 'Olish xatosi');
  const text = j.content[0]?.text ?? '';
  const nom = tahlil<{ obyekt?: { nom?: string } }>(text)?.obyekt?.nom;
  return ok({ id: `obyekt:${n}`, title: nom ? String(nom) : `Obyekt #${n}`, text, url: obyektUrl(sayt, n), metadata: { tur: 'obyekt_holat', izoh: 'summalar NDS siz; ustamasiz va ustamali' } });
}
