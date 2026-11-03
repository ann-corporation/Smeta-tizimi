import { createStore, del, get, keys, set } from 'idb-keyval';
import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';
import type { Saqlash } from './saqlash';

/** Alohida IDB: mavjud GAS navbati yoki biznes omboriga tegmaydi. */
export function idbSaqlash(): Saqlash {
  const store = createStore('t2-ombor', 'v1');
  return {
    ol: k => get<Uint8Array>(k, store), yoz: (k, v) => set(k, v, store),
    ochir: k => del(k, store), kalitlar: async () => (await keys(store)).filter((k): k is string => typeof k === 'string'),
  };
}
/** AAD kalitga scope/objectni bog'laydi; ciphertextni boshqa tenant kalitiga ko'chirib bo'lmaydi. */
export async function shifrla(kalit: string, qiymat: unknown, secret: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = gzipSync(strToU8(JSON.stringify(qiymat)));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: strToU8(kalit) }, secret, bytes));
  const out = new Uint8Array(12 + encrypted.length); out.set(iv); out.set(encrypted, 12); return out;
}
export async function shifrOch(kalit: string, bytes: Uint8Array, secret: CryptoKey): Promise<unknown> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: strToU8(kalit) }, secret, bytes.slice(12));
  return JSON.parse(strFromU8(gunzipSync(new Uint8Array(plain))));
}
