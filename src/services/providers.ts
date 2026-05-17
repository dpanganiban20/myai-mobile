// src/services/providers.ts — Multi-provider AI client for mobile
// Supports: Groq, Gemini, DeepSeek, Anthropic (Claude)

import * as SecureStore from 'expo-secure-store';

// ── Types ──────────────────────────────────────────────────

export type Provider = 'groq' | 'gemini' | 'deepseek' | 'anthropic' | 'auto';
export type ProviderModel = {
  id: string;
  name: string;
  provider: Provider;
  free: boolean;
  contextK: number;
  quality: number; // 1-5
  speed: number;   // 1-5
};

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// ── Available models ───────────────────────────────────────

export const MODELS: ProviderModel[] = [
  // Groq
  { id: 'llama-3.1-8b-instant',       name: 'Llama 3.1 8B',       provider: 'groq',      free: true,  contextK: 128,  quality: 3, speed: 5 },
  { id: 'llama-3.3-70b-versatile',    name: 'Llama 3.3 70B',      provider: 'groq',      free: true,  contextK: 128,  quality: 4, speed: 4 },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', provider: 'groq', free: true, contextK: 128, quality: 5, speed: 4 },
  // Gemini
  { id: 'gemini-2.0-flash',                 name: 'Gemini Flash',     provider: 'gemini',    free: true,  contextK: 128,  quality: 4, speed: 5 },
  { id: 'gemini-2.5-pro-preview-05-06',     name: 'Gemini 2.5 Pro',   provider: 'gemini',    free: true,  contextK: 1000, quality: 5, speed: 3 },
  // DeepSeek
  { id: 'deepseek-chat',        name: 'DeepSeek Chat',    provider: 'deepseek',  free: false, contextK: 64,   quality: 4, speed: 4 },
  { id: 'deepseek-reasoner',    name: 'DeepSeek R1',      provider: 'deepseek',  free: false, contextK: 64,   quality: 5, speed: 2 },
  // Anthropic
  { id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku',     provider: 'anthropic', free: false, contextK: 200,  quality: 3, speed: 5 },
  { id: 'claude-sonnet-4-6',          name: 'Claude Sonnet',    provider: 'anthropic', free: false, contextK: 200,  quality: 5, speed: 4 },
  { id: 'claude-opus-4-6',            name: 'Claude Opus',      provider: 'anthropic', free: false, contextK: 200,  quality: 5, speed: 2 },
];

// ── Key management ─────────────────────────────────────────

export const Keys = {
  async get(name: string): Promise<string | null> {
    return SecureStore.getItemAsync(name);
  },
  async set(name: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(name, value);
  },
  async delete(name: string): Promise<void> {
    await SecureStore.deleteItemAsync(name);
  },
  async getAll(): Promise<Record<string, string | null>> {
    const names = ['GROQ_API_KEY','GEMINI_API_KEY','DEEPSEEK_API_KEY','ANTHROPIC_API_KEY'];
    const results: Record<string, string | null> = {};
    await Promise.all(names.map(async n => { results[n] = await Keys.get(n); }));
    return results;
  },
};

// ── Provider detection ─────────────────────────────────────

export async function getAvailableProviders(): Promise<Provider[]> {
  const keys = await Keys.getAll();
  const available: Provider[] = [];
  if (keys['GROQ_API_KEY'])      available.push('groq');
  if (keys['GEMINI_API_KEY'])    available.push('gemini');
  if (keys['DEEPSEEK_API_KEY'])  available.push('deepseek');
  if (keys['ANTHROPIC_API_KEY']) available.push('anthropic');
  return available;
}

// ── Task-based model routing ───────────────────────────────

function detectTask(query: string, hasImage: boolean): string {
  if (hasImage) return 'vision';
  const q = query.toLowerCase();
  if (/architect|design|tradeoff|complex|reason/.test(q)) return 'reasoning';
  if (/quick|simple|what is|define/.test(q))              return 'fast';
  if (/test|spec|coverage/.test(q))                       return 'code';
  if (/review|feedback|improve/.test(q))                  return 'review';
  return 'balanced';
}

export async function autoRoute(query: string, hasImage: boolean): Promise<ProviderModel> {
  const available = await getAvailableProviders();
  const task = detectTask(query, hasImage);

  // Reasoning → DeepSeek R1 > Claude Opus > Gemini Pro > Groq 70B
  if (task === 'reasoning') {
    if (available.includes('deepseek'))  return MODELS.find(m => m.id === 'deepseek-reasoner')!;
    if (available.includes('anthropic')) return MODELS.find(m => m.id === 'claude-opus-4-6')!;
    if (available.includes('gemini'))    return MODELS.find(m => m.id === 'gemini-2.5-pro-preview-05-06')!;
  }
  // Vision → Gemini Flash > Claude Sonnet > Groq
  if (task === 'vision') {
    if (available.includes('gemini'))    return MODELS.find(m => m.id === 'gemini-2.0-flash')!;
    if (available.includes('anthropic')) return MODELS.find(m => m.id === 'claude-sonnet-4-6')!;
  }
  // Fast → Groq 8B > Gemini Flash > Haiku
  if (task === 'fast') {
    if (available.includes('groq'))      return MODELS.find(m => m.id === 'llama-3.1-8b-instant')!;
    if (available.includes('gemini'))    return MODELS.find(m => m.id === 'gemini-2.0-flash')!;
    if (available.includes('anthropic')) return MODELS.find(m => m.id === 'claude-haiku-4-5-20251001')!;
  }
  // Default balanced → Groq 70B > Gemini Flash > DeepSeek Chat > Sonnet
  if (available.includes('groq'))      return MODELS.find(m => m.id === 'llama-3.3-70b-versatile')!;
  if (available.includes('gemini'))    return MODELS.find(m => m.id === 'gemini-2.0-flash')!;
  if (available.includes('deepseek'))  return MODELS.find(m => m.id === 'deepseek-chat')!;
  if (available.includes('anthropic')) return MODELS.find(m => m.id === 'claude-sonnet-4-6')!;

  return MODELS[0]; // fallback
}

// ── Provider clients ───────────────────────────────────────

async function callGroq(
  messages: ChatMessage[], modelId: string, maxTokens: number,
  onChunk?: (t: string) => void
): Promise<string> {
  const key = await Keys.get('GROQ_API_KEY');
  if (!key) throw new Error('Groq API key not set');

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens }),
  });
  if (!resp.ok) throw new Error(`Groq error ${resp.status}`);
  const data = await resp.json();
  const text = data.choices[0].message.content;
  if (onChunk) onChunk(text);
  return text;
}

async function callGemini(
  messages: ChatMessage[], modelId: string, maxTokens: number
): Promise<string> {
  const key = await Keys.get('GEMINI_API_KEY');
  if (!key) throw new Error('Gemini API key not set');

  // Convert messages
  let systemText = '';
  const contents: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') { systemText += msg.content + '\n'; continue; }
    const role = msg.role === 'user' ? 'user' : 'model';
    const parts: any[] = [];
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else {
      for (const b of msg.content as ContentBlock[]) {
        if (b.type === 'text') parts.push({ text: b.text });
        else if (b.type === 'image_url' && b.image_url?.url.startsWith('data:')) {
          const [meta, data] = b.image_url.url.split(',');
          const mimeType = meta.split(':')[1].split(';')[0];
          parts.push({ inlineData: { mimeType, data } });
        }
      }
    }
    if (contents.length && contents[contents.length-1].role === role) {
      contents[contents.length-1].parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  const payload: any = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}`);
  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p.text || '').join('');
}

async function callDeepSeek(
  messages: ChatMessage[], modelId: string, maxTokens: number
): Promise<string> {
  const key = await Keys.get('DEEPSEEK_API_KEY');
  if (!key) throw new Error('DeepSeek API key not set');

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens }),
  });
  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function callAnthropic(
  messages: ChatMessage[], modelId: string, maxTokens: number
): Promise<string> {
  const key = await Keys.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Anthropic API key not set');

  // Convert to Anthropic format
  let system = '';
  const converted: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') { system += msg.content + '\n'; continue; }
    const content = typeof msg.content === 'string'
      ? msg.content
      : (msg.content as ContentBlock[]).map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'image_url' && b.image_url?.url.startsWith('data:')) {
            const [meta, data] = b.image_url.url.split(',');
            return { type: 'image', source: { type: 'base64', media_type: meta.split(':')[1].split(';')[0], data } };
          }
          return { type: 'text', text: '' };
        });
    if (converted.length && converted[converted.length-1].role === msg.role) {
      const prev = converted[converted.length-1];
      if (typeof prev.content === 'string' && typeof content === 'string') {
        prev.content += '\n' + content;
      }
    } else {
      converted.push({ role: msg.role, content });
    }
  }

  const body: any = { model: modelId, max_tokens: maxTokens, messages: converted };
  if (system) body.system = system.trim();

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Anthropic error ${resp.status}`);
  const data = await resp.json();
  return data.content[0].text;
}

// ── Unified chat function ──────────────────────────────────

export async function chat(
  messages: ChatMessage[],
  model: ProviderModel,
  maxTokens = 2048,
  onChunk?: (t: string) => void
): Promise<string> {
  switch (model.provider) {
    case 'groq':      return callGroq(messages, model.id, maxTokens, onChunk);
    case 'gemini':    return callGemini(messages, model.id, maxTokens);
    case 'deepseek':  return callDeepSeek(messages, model.id, maxTokens);
    case 'anthropic': return callAnthropic(messages, model.id, maxTokens);
    default: throw new Error(`Unknown provider: ${model.provider}`);
  }
}

// ── Key validation ─────────────────────────────────────────

export async function testKey(provider: Provider, key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const testMsgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const model = MODELS.find(m => m.provider === provider && m.speed >= 4) || MODELS[0];

    // Temporarily set key
    await Keys.set(`${provider.toUpperCase()}_API_KEY`, key);
    const result = await chat(testMsgs, model, 10);
    return { ok: true, message: `Connected ✓ — ${model.name} working` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
}
