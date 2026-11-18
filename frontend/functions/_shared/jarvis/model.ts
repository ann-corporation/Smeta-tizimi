import { aiHisobli, ByudjetXatosi } from '../agent-hisob';
import { AiByudjetXatosi } from '../ai-hisobli';
import { workersAiHisobli, type CfHisobEnv } from '../ai-bepul-hisob';
import type { AgentRpcEnv } from '../agent-rpc';
import type { AiEnv, AiRequest } from '../ai';

type WorkersAnswer = { response?: string; usage?: { input_tokens?: number; output_tokens?: number } };
type WorkersBinding = { run(model: string, input: {
  messages: Array<{ role: 'system' | 'user'; content: string }>; temperature?: number; max_tokens?: number;
}): Promise<WorkersAnswer> };
export type JarvisModelEnv = AiEnv & AgentRpcEnv & CfHisobEnv & { AI?: WorkersBinding; AI_MODEL?: string };

export async function callJarvisModel(env: JarvisModelEnv, actor: number, company: number, profile: string, request: AiRequest) {
  const external = [env.OPENROUTER_API_KEY, env.GEMINI_API_KEY, env.GROQ_API_KEY, env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY]
    .some(key => !!key?.trim());
  const binding = env.AI;
  if (external || !binding) return aiHisobli(env, actor, company, profile, 'kasb_savol', request);

  const model = env.AI_MODEL?.trim() || '@cf/meta/llama-3.1-8b-instruct-fast';
  try {
    const raw = await workersAiHisobli(env, actor, company, () => binding.run(model, {
      messages: [{ role: 'system', content: request.system ?? '' }, { role: 'user', content: request.text }],
      temperature: request.temperature, max_tokens: request.maxOutputTokens,
    }));
    if (typeof raw?.response !== 'string' || !raw.response.trim()) throw new Error('Workers AI returned an empty answer');
    return { text: raw.response, provider: 'cloudflare-workers-ai', model, usage: {
      inputTokens: raw.usage?.input_tokens, outputTokens: raw.usage?.output_tokens,
    } };
  } catch (error) {
    if (error instanceof AiByudjetXatosi) throw new ByudjetXatosi(error.kod, error.xabar);
    throw error;
  }
}
