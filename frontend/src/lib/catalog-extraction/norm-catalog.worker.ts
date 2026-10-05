import { NormCatalog } from './norm-catalog';
import { buildNormDraftLine } from './norm-draft';
let catalog = new NormCatalog();
let loaded = false;
let generation = 0;
self.onmessage = async (event: MessageEvent) => {
  const { id, command, files, query, page, workId } = event.data;
  try {
    if (command === 'load') {
      const run = ++generation; loaded = false; catalog = new NormCatalog();
      const expected = ['basis', 'basisres', 'material', 'bprice'];
      if (!Array.isArray(files) || files.length !== 4 || new Set(files.map((f: File) => f.name)).size !== 4) throw new Error('FOUR_FILES_REQUIRED');
      for (const name of expected) {
        const file = (files as File[]).find(f => f.name === name + '.jsonl');
        if (!file || file.size > 300 * 1024 * 1024) throw new Error('FILE_INVALID');
        const reader = file.stream().pipeThrough(new TextDecoderStream('utf-8', { fatal: true })).getReader();
        let carry = '', count = 0;
        try {
          while (true) {
            if (run !== generation) return;
            const chunk = await reader.read();
            if (chunk.done) break;
            carry += chunk.value;
            const lines = carry.split('\n'); carry = lines.pop()!;
            if (carry.length > 2_000_000) throw new Error('LINE_TOO_LARGE');
            for (const line of lines) if (line.trim()) { catalog.add(name, JSON.parse(line)); count++; }
            self.postMessage({ id, progress: { table: name, count } });
          }
          if (carry.trim()) catalog.add(name, JSON.parse(carry));
        } finally { reader.releaseLock(); }
      }
      loaded = true; self.postMessage({ id, result: { counts: catalog.counts } });
    } else {
      if (!loaded) throw new Error('CATALOG_NOT_READY');
      self.postMessage({ id, result: command === 'search' ? catalog.search(query, page) : command === 'detail' ? catalog.detail(workId, page) : command === 'draft' ? buildNormDraftLine(catalog, event.data.request) : (() => { throw new Error('COMMAND_INVALID'); })() });
    }
  } catch { if (command === 'load') loaded = false; self.postMessage({ id, error: 'Manba o‘qilmadi yoki bog‘lanish noaniq. Fayllarni tekshirib qayta oching.' }); }
};
