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

interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentProjectId: string | null;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  appendToLast: (text: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
  setProject: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  currentProjectId: null,

  addMessage: (msg) => set((s) => ({
    messages: [...s.messages, {
      ...msg,
      id: Date.now().toString(),
      timestamp: Date.now(),
    }],
  })),

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
