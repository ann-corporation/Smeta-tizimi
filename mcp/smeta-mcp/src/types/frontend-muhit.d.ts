/**
 * Frontend fayllari Vite muhitida yoziladi; MCP typecheck uchun minimal ta'riflar (runtime'da bu modullar stubs.mjs da
 * almashtiriladi yoki ishlatilmaydi).
 */
interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], opts?: { eager?: boolean; import?: string }): Record<string, T>;
  readonly env: Record<string, string | undefined>;
}

declare module 'xlsx-js-style' {
  const x: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export = x;
}
