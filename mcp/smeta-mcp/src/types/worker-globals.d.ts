/** Cloudflare Worker global turlari (frontend/functions/_shared/disk-yoz.ts R2Bucket ni global tur sifatida ishlatadi). MCP da R2 — 	ools/hujjat.ts 2Bucket (REST). */
type R2Bucket = { put(k: string, v: any, o?: any): Promise<any>; get(k: string): Promise<any>; head(k: string): Promise<any>; delete(k: string): Promise<any> };
