/**
 * Jarvis KONTEKST keshi (tezlik): har xabarda qayta-qayta so'raladigan «kim / lavozim / sozlama» RPC'lari
 * (t2_agent_kasb_v1, t2_men_v1, t2_agent_shaxsiy_v1) bir necha soniya-daqiqa ichida o'zgarmaydi. (Uslub har xabarda yangilanadi — keshlanmaydi.)
 *
 * Qoidalar (xavfsizlik):
 *  - kalit = actor + kompaniya (aktor SESSIYADAN; foydalanuvchi matnidan hech qachon olinmaydi) — boshqa foydalanuvchiga hech qachon tushmaydi;
 *  - FAQAT muvaffaqiyatli (ok) javob keshlanadi; xato/ruxsat-rad keshlanmaydi;
 *  - TTL qisqa (30 s): rol bekor qilinsa ham eskirgan ma'lumot ko'pi bilan 30 s ishlatiladi. Bu keshdan FAQAT prompt/mavzu qo'riqchisi
 *    foydalanadi — pul/ma'lumot ruxsati har so'rovda bazada (t2_agent_fakt_v1 va boshqalar) alohida tekshiriladi, shuning uchun kesh ruxsatni kengaytirmaydi;
 *  - bir vaqtdagi bir xil so'rovlar BITTA RPC ga birlashadi (in-flight dedupe);
 *  - foydalanuvchi o'z sozlamasini o'zgartirsa (uslub, til/ishonch) — shu aktor keshi darhol tozalanadi.
 * Cloudflare izolyati (isolate) xotirasida yashaydi; izolyat almashsa kesh bo'sh boshlanadi (to'g'riligi o'zgarmaydi).
 */
import { rpcData, type AgentRpcEnv, type RpcNatija, type Yuk } from './agent-rpc';

export const KONTEKST_TTL_MS = 30_000;
const MAX_YOZUV = 500;

type Yozuv = { t: number; r: RpcNatija };
const kesh = new Map<string, Yozuv>();
const uchib = new Map<string, Promise<RpcNatija>>();
export const kontekstStat = { rpc: 0, kesh: 0 };

/** Testlar va qo'lda tozalash uchun. */
export function kontekstKeshTozala(): void { kesh.clear(); uchib.clear(); kontekstStat.rpc = 0; kontekstStat.kesh = 0; }

/** Shu aktorning hamma yozuvlarini o'chiradi (aktor o'z sozlamasini o'zgartirganda). */
export function kontekstAktorTozala(actor: number): void {
  const pre = `${actor}|`;
  for (const k of kesh.keys()) if (k.startsWith(pre)) kesh.delete(k);
}

/** `nom` RPC'sini (aktor+kompaniya kaliti bilan) keshdan yoki bazadan oladi. `ttl=0` — keshsiz. */
export async function keshliRpc(env: AgentRpcEnv, actor: number, kid: number | null, nom: string, yuk: Yuk, ttl = KONTEKST_TTL_MS, hozir = Date.now()): Promise<RpcNatija> {
  if (ttl <= 0) { kontekstStat.rpc += 1; return rpcData(env, nom, yuk); }
  const kalit = `${actor}|${kid ?? 'g'}|${nom}`;
  const bor = kesh.get(kalit);
  if (bor && hozir - bor.t < ttl) { kontekstStat.kesh += 1; return bor.r; }
  const ucha = uchib.get(kalit);
  if (ucha) { kontekstStat.kesh += 1; return ucha; }
  kontekstStat.rpc += 1;
  const p = rpcData(env, nom, yuk).then((r) => {
    if (r.ok) {
      if (kesh.size >= MAX_YOZUV) { const eski = kesh.keys().next().value; if (eski !== undefined) kesh.delete(eski); }
      kesh.set(kalit, { t: Date.now(), r });
    }
    return r;
  }).finally(() => { uchib.delete(kalit); });
  uchib.set(kalit, p);
  return p;
}

/** Aktor + kompaniya konteksti: lavozim (kasb), kim (men), shaxsiy sozlama, uslub — BITTA parallel to'lqinda (keshdan yoki bazadan). */
export async function kontekstOl(env: AgentRpcEnv, actor: number, kid: number): Promise<{ kasb: RpcNatija; men: RpcNatija | null; shaxsiy: RpcNatija; uslub: RpcNatija | null }> {
  const [kasb, shaxsiy, uslub, men] = await Promise.all([
    keshliRpc(env, actor, kid, 't2_agent_kasb_v1', { p_actor_id: actor, p_kompaniya_id: kid }),
    keshliRpc(env, actor, null, 't2_agent_shaxsiy_v1', { p_actor_id: actor }),
    /* O'rganilgan uslub har xabarda yangilanadi (o'qi-o'zgartir-yoz): KESHLANMAYDI, aks holda tez ketma-ket xabarlarda yangilanish yo'qoladi.
       Migratsiya qo'llanmagan bo'lsa yoki xato bo'lsa — jim o'tkazib yuboriladi. Parallel to'lqinda, qo'shimcha kutish yo'q. */
    keshliRpc(env, actor, null, 't2_agent_uslub_v1', { p_actor_id: actor }, 0).catch(() => null),
    keshliRpc(env, actor, null, 't2_men_v1', { p_actor_id: actor }).catch(() => null),
  ]);
  return { kasb, men, shaxsiy, uslub };
}
