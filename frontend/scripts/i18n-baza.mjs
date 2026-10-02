// Til qo'riqchisi bazasini yangilaydi: har fayldagi t() siz matnlar sonini FAQAT kamaytiradi (src/i18n/baza.json).
import { execSync } from 'node:child_process';
execSync('npx vitest run src/i18n/qorovul.test.ts', { stdio: 'inherit', env: { ...process.env, I18N_BAZA: '1' } });
