import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const STEPS = ['diagnose', 'engineer', 'review', 'verify', 'preview', 'observe'];
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function pathsValid(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.every(p => typeof p === 'string' &&
    p.length > 0 && !p.includes('\\') && !p.startsWith('/') && !p.includes(':') &&
    p.split('/').every(x => x && x !== '.' && x !== '..'));
}
function matches(path, owned) { return owned.some(p => path === p || path.startsWith(p + '/')); }

async function bounded(call, timeoutMs, parent) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(parent ? [parent] : [])]);
  let onAbort;
  const timeout = setTimeout(() => controller.abort(new DOMException('Adapter timed out', 'TimeoutError')), timeoutMs);
  const aborted = new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
  try { signal.throwIfAborted(); return await Promise.race([call(signal), aborted]); }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); }
}

/** A policy decision, NOT proof that agent-supplied evidence is authentic. */
export function releaseGate(job) {
  const { engineer: patch, review, verify } = job.results;
  requireValue(patch && SHA.test(patch.headSha), 'PATCH_SHA_REQUIRED');
  requireValue(pathsValid(patch.changedPaths) && patch.changedPaths.every(p => matches(p, job.ownedPaths)), 'OUTSIDE_OWNED_PATHS');
  requireValue(typeof patch.actor === 'string' && patch.actor.length > 0, 'ENGINEER_REQUIRED');
  requireValue(review?.passed === true && review.actor && review.actor !== patch.actor, 'INDEPENDENT_REVIEW_REQUIRED');
  requireValue(review.headSha === patch.headSha && verify?.headSha === patch.headSha, 'STALE_EVIDENCE');
  requireValue(verify.passed === true && verify.baseSha === job.baseSha && verify.artifactId && verify.rollbackArtifactId, 'VERIFIED_ARTIFACT_REQUIRED');
  requireValue(job.environment === 'preview', 'PRODUCTION_NOT_ENABLED');
  return { headSha: patch.headSha, artifactId: verify.artifactId, rollbackArtifactId: verify.rollbackArtifactId };
}

/** Files must live in a private operator directory outside the public repository. */
export class EvolutionQueue {
  constructor(directory) { this.directory = resolve(directory); }
  file(id) { requireValue(ID.test(id), 'INVALID_JOB_ID'); return join(this.directory, id + '.json'); }
  async read(id) { return JSON.parse(await readFile(this.file(id), 'utf8')); }
  async save(job) {
    const file = this.file(job.id), temp = file + '.' + randomUUID() + '.tmp';
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(job, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
  }
  async locked(id, callback) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = this.file(id) + '.lock';
    let handle;
    try { handle = await open(lock, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw new Error('JOB_LOCKED'); throw e; }
    try { return await callback(); } finally { await handle.close(); await rm(lock); }
  }
  async create({ id, goal, baseSha, ownedPaths, maxAttempts = 2, maxCalls = 12, deadline }) {
    requireValue(typeof goal === 'string' && goal.trim().length > 0 && goal.length <= 4000, 'GOAL_REQUIRED');
    requireValue(SHA.test(baseSha) && pathsValid(ownedPaths), 'INVALID_SCOPE');
    requireValue(Number.isInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 5, 'INVALID_ATTEMPTS');
    requireValue(Number.isInteger(maxCalls) && maxCalls > 0 && maxCalls <= 50, 'INVALID_CALL_BUDGET');
    requireValue(Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > Date.now(), 'INVALID_DEADLINE');
    return this.locked(id, async () => {
      try { await this.read(id); throw new Error('JOB_EXISTS'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const job = { schema: 1, id, goal, baseSha, ownedPaths, environment: 'preview', maxAttempts, maxCalls, deadline,
        state: 'queued', attempts: 0, calls: 0, results: {}, events: [] };
      await this.save(job); return job;
    });
  }
  async cancel(id) { return this.locked(id, async () => {
    const job = await this.read(id); requireValue(!job.previewAttempted && !job.results.preview, 'PREVIEW_ALREADY_CREATED');
    job.state = 'cancelled'; await this.save(job); return job;
  }); }

  /** Adapters are supplied by the trusted controller, NEVER loaded from a patch or job. */
  async run(id, adapters, { signal, timeoutMs = 60000 } = {}) {
    requireValue(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 1800000, 'INVALID_TIMEOUT');
    return this.locked(id, async () => {
      const job = await this.read(id);
      if (['completed', 'cancelled', 'rolled_back', 'rollback_failed'].includes(job.state)) return job;
      requireValue(!job.previewAttempted && job.state !== 'needs_reconciliation', 'RECONCILIATION_REQUIRED');
      requireValue(job.attempts < job.maxAttempts, 'ATTEMPTS_EXHAUSTED');
      job.attempts++; delete job.error; job.state = 'running'; await this.save(job);
      const invoke = async (name, payload) => {
        requireValue(job.calls < job.maxCalls, 'CALL_BUDGET_EXHAUSTED');
        requireValue(Date.now() < Date.parse(job.deadline), 'DEADLINE_EXCEEDED');
        signal?.throwIfAborted(); requireValue(typeof adapters[name] === 'function', 'ADAPTER_MISSING:' + name);
        job.calls++; job.events.push({ step: name, state: 'started', at: new Date().toISOString() }); await this.save(job);
        // Adapter MUST enforce signal in its executor; a timeout is not proof that remote work stopped.
        const result = await bounded(stop => adapters[name]({ job: structuredClone(job), operationId: `${job.id}:${name}`, payload, signal: stop }),
          Math.max(1, Math.min(timeoutMs, Date.parse(job.deadline) - Date.now())), signal);
        requireValue(result && typeof result === 'object', 'INVALID_RESULT:' + name);
        return result;
      };
      try {
        for (const step of STEPS) {
          if (job.results[step]) continue;
          const payload = ['preview', 'observe'].includes(step) ? releaseGate(job) : null;
          if(step === 'preview') { job.previewAttempted = true; await this.save(job); }
          const result = await invoke(step, payload);
          if (step === 'diagnose') requireValue(result.reproduced === true && result.evidenceId, 'REPRODUCTION_REQUIRED');
          if (step === 'preview') {
            const url = new URL(result.url);
            requireValue(url.protocol === 'https:' && !url.username && !url.password && result.headSha === payload.headSha, 'INVALID_PREVIEW');
          }
          job.results[step] = result;
          job.events.push({ step, state: 'completed', at: new Date().toISOString() }); await this.save(job);
          if (step === 'observe') requireValue(result.healthy === true && result.headSha === payload.headSha, 'PREVIEW_UNHEALTHY');
        }
        job.state = 'completed';
      } catch (e) {
        job.state = ['AbortError', 'TimeoutError'].includes(e.name) ? 'needs_reconciliation' : 'failed'; job.error = e.message;
        if (job.previewAttempted && !['AbortError', 'TimeoutError'].includes(e.name)) {
          // Separate emergency capacity; rollback remains available after normal budget/deadline exhaustion.
          job.state = 'rollback_required'; await this.save(job);
          try {
            requireValue(typeof adapters.rollback === 'function', 'ROLLBACK_ADAPTER_MISSING');
            const result = await bounded(stop => adapters.rollback({ job: structuredClone(job), operationId: `${job.id}:rollback`,
              payload: { artifactId: job.results.verify.rollbackArtifactId }, signal: stop }), timeoutMs);
            requireValue(result?.restored === true && result.artifactId === job.results.verify.rollbackArtifactId, 'ROLLBACK_UNCONFIRMED');
            job.state = 'rolled_back';
          } catch (rollbackError) { job.state = 'rollback_failed'; job.rollbackError = rollbackError.message; }
        }
      }
      await this.save(job); return job;
    });
  }
}
