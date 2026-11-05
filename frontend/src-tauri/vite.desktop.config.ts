import { defineConfig, mergeConfig } from 'vite';
import webConfig from '../vite.config';

export default defineConfig(async env => {
  const web = typeof webConfig === 'function' ? await webConfig(env) : await webConfig;
  return mergeConfig(web, {
    plugins: [{ name: 'desktop-native-entry', transformIndexHtml: {
      order: 'pre', handler(html: string) {
        if (!html.includes('/src/main.tsx')) throw new Error('DESKTOP_WEB_ENTRY_MISSING');
        return html.replace('/src/main.tsx', '/src/desktop/entry.ts');
      },
    } }],
  });
});
