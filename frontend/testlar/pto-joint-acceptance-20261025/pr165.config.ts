import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['testlar/pto-joint-acceptance-20261025/pr165-*.candidate.tsx', 'testlar/pto-joint-acceptance-20261025/pr165-*.diagnostic.candidate.ts'] } });
