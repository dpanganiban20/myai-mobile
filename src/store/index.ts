// src/store/index.ts — Zustand global state

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  hasCode?: boolean;
  imageUri?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  repo?: string;       // owner/repo
  jiraProject?: string;
  skills: string[];
  notes: string;
  createdAt: number;
  messageCount: number;
}

export interface Correction {
  id: string;
  text: string;
  category: string;
  createdAt: number;
}

// ── Chat store ─────────────────────────────────────────────

const SESSIONS_KEY = 'myai_sessions_v2';

function dedupeMessages(msgs: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return msgs.map(msg => {
    if (seen.has(msg.id)) {
      const id = `${msg.id}-${Math.random().toString(36).slice(2, 8)}`;
      seen.add(id);
      return { ...msg, id };
    }
    seen.add(msg.id);
    return msg;
  });
}

interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentProjectId: string | null;
  sessions: ChatSession[];
  currentSessionId: string;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  appendToLast: (text: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
  setProject: (id: string | null) => void;
  loadSessions: () => Promise<void>;
  newSession: () => void;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  persistSession: (sessionId: string, messages: ChatMessage[], title?: string) => Promise<void>;
}

const makeSessionId = () => Date.now().toString();

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentProjectId: null,
  sessions: [],
  currentSessionId: makeSessionId(),

  addMessage: (msg) => set((s) => {
    const ts = Date.now();
    return {
      messages: [...s.messages, {
        ...msg,
        id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: ts,
      }],
    };
  }),

  appendToLast: (text) => set((s) => {
    const msgs = [...s.messages];
    if (msgs.length && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: msgs[msgs.length - 1].content + text,
      };
    }
    return { messages: msgs };
  }),

  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
  setProject: (id) => set({ currentProjectId: id }),

  loadSessions: async () => {
    try {
      const data = await AsyncStorage.getItem(SESSIONS_KEY);
      const sessions: ChatSession[] = data ? JSON.parse(data) : [];
      if (sessions.length > 0) {
        const latest = sessions[0];
        const msgData = await AsyncStorage.getItem(`myai_sess_${latest.id}`);
        const raw: ChatMessage[] = msgData ? JSON.parse(msgData) : [];
        set({ sessions, currentSessionId: latest.id, messages: dedupeMessages(raw) });
      } else {
        set({ sessions: [] });
      }
    } catch {
      set({ sessions: [] });
    }
  },

  persistSession: async (sessionId, messages, title) => {
    if (messages.length === 0) return;
    await AsyncStorage.setItem(`myai_sess_${sessionId}`, JSON.stringify(messages.slice(-100)));
    const { sessions } = get();
    const existing = sessions.find(s => s.id === sessionId);

    // Auto-generate title from the first user message if none provided
    const resolvedTitle = title ?? (() => {
      const first = messages.find(m => m.role === 'user');
      if (!first || typeof first.content !== 'string') return null;
      const t = first.content.trim().replace(/\s+/g, ' ');
      return t.length > 40 ? t.slice(0, 40) + '…' : t;
    })();

    let updated: ChatSession[];
    if (existing) {
      updated = sessions.map(s =>
        s.id === sessionId ? { ...s, updatedAt: Date.now(), ...(title && { title }) } : s
      );
    } else {
      if (!resolvedTitle) return;
      updated = [{ id: sessionId, title: resolvedTitle, createdAt: Date.now(), updatedAt: Date.now() }, ...sessions];
    }
    updated.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sessions: updated });
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
  },

  newSession: () => {
    const { messages, currentSessionId } = get();
    if (messages.length > 0) {
      get().persistSession(currentSessionId, messages);
    }
    set({ messages: [], currentSessionId: makeSessionId() });
  },

  switchSession: async (id) => {
    const { messages, currentSessionId } = get();
    if (id === currentSessionId) return;
    if (messages.length > 0) {
      await get().persistSession(currentSessionId, messages);
    }
    try {
      const data = await AsyncStorage.getItem(`myai_sess_${id}`);
      const raw: ChatMessage[] = data ? JSON.parse(data) : [];
      set({ messages: dedupeMessages(raw), currentSessionId: id });
    } catch {
      set({ messages: [], currentSessionId: id });
    }
  },

  deleteSession: async (id) => {
    const { sessions, currentSessionId } = get();
    const updated = sessions.filter(s => s.id !== id);
    await AsyncStorage.removeItem(`myai_sess_${id}`);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    if (id === currentSessionId) {
      if (updated.length > 0) {
        const data = await AsyncStorage.getItem(`myai_sess_${updated[0].id}`);
        set({ sessions: updated, messages: data ? JSON.parse(data) : [], currentSessionId: updated[0].id });
      } else {
        set({ sessions: updated, messages: [], currentSessionId: makeSessionId() });
      }
    } else {
      set({ sessions: updated });
    }
  },
}));

// ── Projects store ─────────────────────────────────────────

interface ProjectStore {
  projects: Project[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (projects: Project[]) => Promise<void>;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'messageCount'>) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loaded: false,

  load: async () => {
    try {
      const data = await AsyncStorage.getItem('myai_projects');
      set({ projects: data ? JSON.parse(data) : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  save: async (projects) => {
    await AsyncStorage.setItem('myai_projects', JSON.stringify(projects));
    set({ projects });
  },

  addProject: async (p) => {
    const project: Project = {
      ...p,
      id: Date.now().toString(),
      createdAt: Date.now(),
      messageCount: 0,
    };
    const updated = [...get().projects, project];
    await get().save(updated);
  },

  updateProject: async (id, updates) => {
    const updated = get().projects.map(p => p.id === id ? { ...p, ...updates } : p);
    await get().save(updated);
  },

  deleteProject: async (id) => {
    const updated = get().projects.filter(p => p.id !== id);
    await get().save(updated);
  },
}));

// ── Memory store (per-project conversation history) ────────

interface MemoryStore {
  getHistory: (projectId: string) => Promise<ChatMessage[]>;
  saveHistory: (projectId: string, messages: ChatMessage[]) => Promise<void>;
  clearHistory: (projectId: string) => Promise<void>;
  getAllProjects: () => Promise<string[]>;
}

export const useMemoryStore = create<MemoryStore>(() => ({
  getHistory: async (projectId) => {
    try {
      const data = await AsyncStorage.getItem(`myai_history_${projectId}`);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },
  saveHistory: async (projectId, messages) => {
    // Keep last 100 messages per project
    const trimmed = messages.slice(-100);
    await AsyncStorage.setItem(`myai_history_${projectId}`, JSON.stringify(trimmed));
  },
  clearHistory: async (projectId) => {
    await AsyncStorage.removeItem(`myai_history_${projectId}`);
  },
  getAllProjects: async () => {
    const keys = await AsyncStorage.getAllKeys();
    return keys
      .filter(k => k.startsWith('myai_history_'))
      .map(k => k.replace('myai_history_', ''));
  },
}));

// ── Corrections store ──────────────────────────────────────

interface CorrectionsStore {
  corrections: Correction[];
  load: () => Promise<void>;
  add: (text: string, category: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  toPromptContext: () => string;
}

export const useCorrectionsStore = create<CorrectionsStore>((set, get) => ({
  corrections: [],

  load: async () => {
    try {
      const data = await AsyncStorage.getItem('myai_corrections');
      set({ corrections: data ? JSON.parse(data) : [] });
    } catch { /* ignore */ }
  },

  add: async (text, category) => {
    const c: Correction = { id: Date.now().toString(), text, category, createdAt: Date.now() };
    const updated = [...get().corrections, c];
    set({ corrections: updated });
    await AsyncStorage.setItem('myai_corrections', JSON.stringify(updated));
  },

  remove: async (id) => {
    const updated = get().corrections.filter(c => c.id !== id);
    set({ corrections: updated });
    await AsyncStorage.setItem('myai_corrections', JSON.stringify(updated));
  },

  clear: async () => {
    set({ corrections: [] });
    await AsyncStorage.removeItem('myai_corrections');
  },

  toPromptContext: () => {
    const { corrections } = get();
    if (!corrections.length) return '';
    const rules = corrections.map(c => `• ${c.text}`).join('\n');
    return `--- Your Permanent Rules (ALWAYS follow) ---\n${rules}`;
  },
}));

// ── Token tracker ──────────────────────────────────────────

interface TokenStore {
  sessionTokens: number;
  totalTokens: number;
  sessionCalls: number;
  addUsage: (tokens: number) => Promise<void>;
  reset: () => Promise<void>;
  load: () => Promise<void>;
}

export const useTokenStore = create<TokenStore>((set, get) => ({
  sessionTokens: 0,
  totalTokens: 0,
  sessionCalls: 0,

  load: async () => {
    try {
      const data = await AsyncStorage.getItem('myai_tokens');
      if (data) {
        const { totalTokens } = JSON.parse(data);
        set({ totalTokens });
      }
    } catch { /* ignore */ }
  },

  addUsage: async (tokens) => {
    const { sessionTokens, totalTokens, sessionCalls } = get();
    const newTotal = totalTokens + tokens;
    set({
      sessionTokens: sessionTokens + tokens,
      totalTokens: newTotal,
      sessionCalls: sessionCalls + 1,
    });
    await AsyncStorage.setItem('myai_tokens', JSON.stringify({ totalTokens: newTotal }));
  },

  reset: async () => {
    set({ sessionTokens: 0, totalTokens: 0, sessionCalls: 0 });
    await AsyncStorage.removeItem('myai_tokens');
  },
}));
