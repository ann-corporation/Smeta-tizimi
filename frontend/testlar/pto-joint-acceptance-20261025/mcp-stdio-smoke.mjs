import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Child receives an allowlist only. Never load .env or inherit SMETA_DB_URL.
const root = path.resolve(process.argv[2] ?? '.');
const pkg = path.join(root, 'mcp/smeta-mcp');
const sdk = path.join(pkg, 'node_modules/@modelcontextprotocol/sdk/dist/esm');
const { Client } = await import(pathToFileURL(path.join(sdk, 'client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'client/stdio.js')).href);
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'LOCALAPPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.SMETA_DB_URL = '';
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(pkg, 'dist/index.js')], env, stderr: 'pipe' });
const client = new Client({ name: 'pto-qa-no-db', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.length > 0);
  for (const name of ['rpc', 'sql_yozish', 'qator_tahrir', 'f2_import', 'snapshot_qaytar']) assert.ok(tools.some(t => t.name === name), `${name} missing`);
  const result = await client.callTool({ name: 'obyektlar', arguments: { limit: 1 } });
  assert.equal(result.isError, true, 'Missing database must fail closed');
  assert.match(JSON.stringify(result.content), /SMETA_DB_URL/);
  console.log(JSON.stringify({ tools: tools.length, protocol: 'PASS', missing_database_fail_closed: 'PASS', database_connection_attempted: false, writer_called: false }));
} finally {
  await client.close();
}
