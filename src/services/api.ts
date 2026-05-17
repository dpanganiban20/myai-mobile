// src/services/api.ts — Groq API + GitHub + Jira service layer

import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GITHUB_BASE = 'https://api.github.com';
const MODELS = {
  fast:      'llama-3.1-8b-instant',
  balanced:  'llama-3.3-70b-versatile',
  reasoning: 'llama-3.3-70b-versatile',
  vision:    'meta-llama/llama-4-scout-17b-16e-instruct',
};

// ── Key management ─────────────────────────────────────────

export async function saveKey(name: string, value: string) {
  await SecureStore.setItemAsync(name, value);
}

export async function getKey(name: string): Promise<string | null> {
  return SecureStore.getItemAsync(name);
}

export async function deleteKey(name: string) {
  await SecureStore.deleteItemAsync(name);
}

// ── Model router ───────────────────────────────────────────

function detectModel(query: string, hasImage = false): string {
  if (hasImage) return MODELS.vision;
  const q = query.toLowerCase();
  if (/architect|design|tradeoff|compare|complex/.test(q)) return MODELS.reasoning;
  if (/quick|simple|what is|define/.test(q)) return MODELS.fast;
  return MODELS.balanced;
}

// ── Groq Chat ──────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export async function groqChat(
  messages: Message[],
  query = '',
  hasImage = false,
  onChunk?: (text: string) => void
): Promise<string> {
  const apiKey = await getKey('groq_api_key');
  if (!apiKey) throw new Error('No Groq API key. Add it in Settings.');

  const model = detectModel(query, hasImage);

  const resp = await axios.post(
    `${GROQ_BASE}/chat/completions`,
    { model, messages, max_tokens: 2048 },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const text = resp.data.choices[0].message.content;
  if (onChunk) onChunk(text);
  return text;
}

// ── System prompt builder ──────────────────────────────────

export function buildSystemPrompt(projectContext?: string, skills?: string[]): string {
  let prompt = `You are myai — a helpful AI assistant running on mobile.
Answer any question clearly and concisely. Mobile screens are small, so keep responses focused.
Only use Markdown code blocks when the response actually contains code or commands.
For general questions, explanations, or conversation, reply in plain text without code blocks.`;

  if (projectContext) {
    prompt += `\n\n--- Project Context ---\n${projectContext}`;
  }

  if (skills && skills.length > 0) {
    prompt += `\n\n--- Active Skills ---\nFollow these standards: ${skills.join(', ')}`;
  }

  return prompt;
}

// ── GitHub ─────────────────────────────────────────────────

async function githubHeaders() {
  const token = await getKey('github_token');
  if (!token) throw new Error('No GitHub token. Add it in Settings.');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function githubGet(path: string, params?: any) {
  const headers = await githubHeaders();
  const resp = await axios.get(`${GITHUB_BASE}${path}`, { headers, params });
  return resp.data;
}

export async function githubPost(path: string, data: any) {
  const headers = await githubHeaders();
  const resp = await axios.post(`${GITHUB_BASE}${path}`, data, { headers });
  return resp.data;
}

export const github = {
  me:           () => githubGet('/user'),
  repos:        () => githubGet('/user/repos', { sort: 'updated', per_page: 30 }),
  issues:       (owner: string, repo: string) => githubGet(`/repos/${owner}/${repo}/issues`, { per_page: 20 }),
  prs:          (owner: string, repo: string) => githubGet(`/repos/${owner}/${repo}/pulls`, { per_page: 20 }),
  createIssue:  (owner: string, repo: string, title: string, body: string) =>
                  githubPost(`/repos/${owner}/${repo}/issues`, { title, body }),
  repoInfo:     (owner: string, repo: string) => githubGet(`/repos/${owner}/${repo}`),
};

// ── Jira ───────────────────────────────────────────────────

async function jiraHeaders() {
  const email = await getKey('jira_email');
  const token = await getKey('jira_token');
  const url   = await getKey('jira_url');
  if (!email || !token || !url) throw new Error('Jira not configured. Add it in Settings.');
  const auth = btoa(`${email}:${token}`);
  return { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', _url: url };
}

export const jira = {
  myIssues: async () => {
    const { _url, ...headers } = await jiraHeaders();
    const resp = await axios.post(
      `${_url}/rest/api/3/issue/search`,
      { jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC', maxResults: 20 },
      { headers }
    );
    return resp.data;
  },
  getIssue: async (key: string) => {
    const { _url, ...headers } = await jiraHeaders();
    const resp = await axios.get(`${_url}/rest/api/3/issue/${key}`, { headers });
    return resp.data;
  },
  addComment: async (key: string, body: string) => {
    const { _url, ...headers } = await jiraHeaders();
    await axios.post(`${_url}/rest/api/3/issue/${key}/comment`, {
      body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] }
    }, { headers });
  },
};

// ── Updated system prompt with skills + MYAI.md ───────────

export async function buildRichSystemPrompt(
  query: string,
  projectSkills: string[],
  corrections: string[]
): Promise<string> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const { detectSkills, buildSkillsContext, parseMyAIMd, myaiMdToPrompt } = await import('./skills');

  let system = `You are myai — a helpful AI assistant running on mobile.
Answer any question clearly and concisely. Mobile screens are small, so keep responses focused.
Only use Markdown code blocks when the response actually contains code or commands.
For general questions, explanations, or conversation, reply in plain text without code blocks.`;

  // MYAI.md
  const mdContent = await AsyncStorage.getItem('myai_md_content');
  if (mdContent) {
    const md = parseMyAIMd(mdContent);
    system += '\n\n' + myaiMdToPrompt(md);
    projectSkills = [...projectSkills, ...md.skills];
  }

  // Active skills
  const activeSkillsStr = await AsyncStorage.getItem('myai_active_skills');
  const activeSkills = activeSkillsStr ? JSON.parse(activeSkillsStr) : ['security', 'git'];
  const detectedSkills = detectSkills(query, [...projectSkills, ...activeSkills], []);
  const skillsCtx = buildSkillsContext(detectedSkills);
  if (skillsCtx) system += '\n\n' + skillsCtx;

  // Corrections
  if (corrections.length > 0) {
    system += '\n\n--- Your Permanent Rules (ALWAYS follow) ---\n' +
              corrections.map(c => `• ${c}`).join('\n');
  }

  return system;
}
