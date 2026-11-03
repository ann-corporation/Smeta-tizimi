import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['testlar/pto-joint-acceptance-20261025/version-price.candidate.ts'] } });
