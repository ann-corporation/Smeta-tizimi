/** MCP import grafi react / react-query'ga tegmasligi kerak (MCP CI'da ular o'rnatilmagan). Bundle metafayli bo'yicha tekshiriladi. */
import { build } from 'esbuild';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error build.mjs tipsiz (esbuild skripti; import build'ni ham ishga tushiradi)
import { stubPlagin } from '../build.mjs';

describe('MCP import grafi', () => {
  it('react / @tanstack/react-query bundle ichida yo\'q', async () => {
    const r = await build({ entryPoints: [path.resolve(__dirname, '../src/server.ts')], bundle: true, write: false, platform: 'node', format: 'esm', metafile: true, logLevel: 'silent',
      nodePaths: [path.resolve(__dirname, '../node_modules')], external: ['pg-native', 'xlsx-js-style', 'jspdf', 'jspdf-autotable', 'exceljs', 'react', 'react-dom', 'react/*', '@tanstack/*', 'react-router-dom', 'lucide-react'], plugins: [stubPlagin] });
    const kirgan = Object.values(r.metafile.outputs)[0].imports.map((i) => i.path).filter((x) => /^(react|react-dom|@tanstack|react-router)/.test(x));
    expect(kirgan).toEqual([]);
  }, 60000);
});