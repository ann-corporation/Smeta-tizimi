/** Worker muhiti (wrangler.toml binding'lari + `wrangler secret put` sirlari). Qiymatlar hech qachon log/javobga chiqmaydi. */
export interface RateLimit { limit(o: { key: string }): Promise<{ success: boolean }> }

export interface Env {
  /** Hyperdrive → Supabase Postgres (to'g'ridan-to'g'ri ulanish satri Hyperdrive sozlamasida, repoda emas). */
  HYPERDRIVE: { connectionString: string };
  /** workers-oauth-provider: mijozlar, grantlar, tokenlar (xeshlangan) va login holati. */
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  /** MCP chaqiruvlari: foydalanuvchi bo'yicha. */
  MCP_RATE: RateLimit;
  /** Login urinishlari: IP + login bo'yicha. */
  LOGIN_RATE: RateLimit;
  /** Sir: Supabase loyiha URL (https://<ref>.supabase.co). */
  SUPABASE_URL: string;
  /** Sir: Supabase service_role kaliti — faqat server tomonida (t2_parol_tekshir_v1, t2_men_v1). */
  SUPABASE_KEY: string;
  /** Var: Worker'ning barqaror ommaviy URL i (OAuth resource identifikatori = <URL>/mcp). */
  MCP_PUBLIC_URL: string;
  /** R2 bucket (smeta-tizimi-canonical): kunlik snapshot sovutish. Binding yo'q bo'lsa cron sovutishni o'tkazib yuboradi. */
  SNAPSHOT_R2?: R2BucketLike;
  /** Ixtiyoriy var: sovutish uchun snapshot yoshi (kun, standart 2) va partiya (standart 200). */
  SNAPSHOT_SOVUT_KUN?: string;
  SNAPSHOT_SOVUT_LIMIT?: string;
  SNAPSHOT_SOVUT_SONGGI?: string;
  /** Ixtiyoriy sirlar: «Google bilan kirish» (OAuth 2.0 code + PKCE). Ikkalasi ham bo'lsagina tugma ko'rinadi. Faqat nomlar — qiymat repoda yo'q. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Ixtiyoriy var: veb-ilova manzili (ChatGPT search/fetch natijalaridagi `url` uchun; standart https://smeta-tizimi.pages.dev). */
  SAYT_URL?: string;
  /** Ixtiyoriy var: tranzaksiya vaqt chegarasi (ms). */
  SMETA_MCP_TIMEOUT_MS?: string;
}

/** OAuthProvider'ning ichki yordamchilari (faqat ishlatiladigan qismi). */
export interface OAuthHelpers {
  parseAuthRequest(request: Request): Promise<AuthRequest>;
  lookupClient(clientId: string): Promise<{ clientId: string; clientName?: string; redirectUris: string[] } | null>;
  completeAuthorization(o: { request: AuthRequest; userId: string; metadata: unknown; scope: string[]; props: unknown }): Promise<{ redirectTo: string }>;
}
export type AuthRequest = { responseType: string; clientId: string; redirectUri: string; scope: string[]; state: string; codeChallenge?: string; codeChallengeMethod?: string; resource?: string | string[] };

/** OAuth tokeniga shifrlangan holda yoziladigan «props» — faqat identifikator; vakolat har chaqiruvda bazadan. */
export type Props = { foydalanuvchi_id: number; login: string; /** chiqarilgan vaqt (ms) — t2_foydalanuvchi.sessiya_bekor_dan bilan solishtiriladi */ iat: number };

/** R2 bucket binding'ining ishlatiladigan qismi. */
export interface R2BucketLike {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, o?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
