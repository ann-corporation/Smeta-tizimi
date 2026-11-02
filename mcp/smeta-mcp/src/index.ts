#!/usr/bin/env node
/**
 * smeta-mcp — stdio MCP server. Ulanish satri FAQAT SMETA_DB_URL muhit o'zgaruvchisidan (hech qachon chop etilmaydi).
 *   node dist/index.js           — MCP server (Claude Code / Codex ishga tushiradi)
 *   node dist/index.js --smoke   — faqat o'qish tekshiruvi: obyektlar ro'yxati va obyekt holati (standart 153)
 * stdout — faqat MCP protokoli; diagnostika stderr ga (maxfiy qiymatsiz).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sozlamaOqi } from './config';
import { yashir } from './maxfiy';
import { Muhit } from './muhit';
import { serverYasa, TOOLLAR, VERSIYA } from './server';
import { toolChaqir } from './tool';

async function smoke(mu: Muhit, obyektId: number): Promise<number> {
  if (!mu.sozlama.dbUrl) { process.stderr.write('SMETA_DB_URL yo\'q — smoke o\'tkazib yuborildi.\n'); return 0; }
  const ol = (n: string) => TOOLLAR.find((t) => t.nom === n)!;
  const a = await toolChaqir(ol('obyektlar'), mu, { limit: 20 });
  process.stdout.write(`obyektlar: ${a.isError ? 'XATO ' : ''}${a.content[0].text.slice(0, 1500)}\n\n`);
  const b = await toolChaqir(ol('obyekt_holat'), mu, { obyekt_id: obyektId, daraja: 1 });
  process.stdout.write(`obyekt_holat(${obyektId}): ${b.isError ? 'XATO ' : ''}${b.content[0].text.slice(0, 4000)}\n`);
  await mu.yop();
  return a.isError || b.isError ? 1 : 0;
}

async function main() {
  const mu = new Muhit(sozlamaOqi());
  const i = process.argv.indexOf('--smoke');
  if (i >= 0) {
    const id = Number(process.argv[i + 1]) || 153;
    process.exit(await smoke(mu, id));
  }
  const server = serverYasa(mu);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`smeta-mcp ${VERSIYA}: ${TOOLLAR.length} tool; baza: ${mu.sozlama.dbUrl ? 'sozlangan' : 'SMETA_DB_URL YO\'Q'}; aktor: ${mu.aktorId ?? 'yo\'q'}\n`);
  const yop = async () => { await mu.yop().catch(() => undefined); process.exit(0); };
  process.on('SIGINT', yop);
  process.on('SIGTERM', yop);
}

main().catch((e) => {
  process.stderr.write(`smeta-mcp xato: ${yashir(e instanceof Error ? e.message : String(e))}\n`);
  process.exit(1);
});
