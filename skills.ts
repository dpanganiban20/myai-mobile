// src/services/skills.ts — Skills + MYAI.md support for mobile

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

// ── Built-in skills ────────────────────────────────────────

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  prompt: string;
  source: 'builtin' | 'custom';
}

export const BUILTIN_SKILLS: Record<string, Skill> = {
  python: {
    name: 'python', source: 'builtin',
    description: 'Python coding standards',
    triggers: ['python', '.py', 'django', 'flask', 'fastapi'],
    prompt: `Python standards: type hints on all functions, Google-style docstrings, PEP 8 (snake_case for functions, PascalCase for classes), f-strings, pathlib.Path, specific exception handling, pytest for tests.`,
  },
  typescript: {
    name: 'typescript', source: 'builtin',
    description: 'TypeScript standards',
    triggers: ['typescript', '.ts', '.tsx', 'react', 'next'],
    prompt: `TypeScript standards: strict mode, no 'any', interface for objects, type for unions, const over let, async/await, optional chaining ?., nullish coalescing ??, named exports, Zod for validation.`,
  },
  react: {
    name: 'react', source: 'builtin',
    description: 'React best practices',
    triggers: ['react', 'component', 'hook', 'jsx'],
    prompt: `React standards: functional components only, Rules of Hooks, useEffect cleanup, React Query for server state, stable keys in lists, React.lazy for code splitting, compound components for complex UI.`,
  },
  nextjs: {
    name: 'nextjs', source: 'builtin',
    description: 'Next.js App Router standards',
    triggers: ['next', 'nextjs', 'app router', 'server component'],
    prompt: `Next.js App Router: default to Server Components, 'use client' only for interactivity, Server Actions for mutations, next/image for all images, next/link for navigation, parallel data fetching with Promise.all.`,
  },
  security: {
    name: 'security', source: 'builtin',
    description: 'Security best practices',
    triggers: ['auth', 'security', 'password', 'token'],
    prompt: `Security: never hardcode secrets, use env vars, bcrypt/argon2 for passwords, parameterized queries (no SQL injection), validate all input, HTTPS only, rate limiting on auth endpoints.`,
  },
  testing: {
    name: 'testing', source: 'builtin',
    description: 'Test writing standards',
    triggers: ['test', 'spec', 'jest', 'pytest', 'vitest'],
    prompt: `Testing: AAA pattern (Arrange-Act-Assert), one concept per test, mock externals, test edge cases (null, empty, max), 80%+ coverage on business logic, stable test names.`,
  },
  git: {
    name: 'git', source: 'builtin',
    description: 'Git commit standards',
    triggers: ['commit', 'git', 'pr', 'pull request'],
    prompt: `Git: Conventional Commits (feat/fix/docs/refactor/test/chore), max 72 chars first line, atomic commits, branch naming: type/ticket-description, reference issues in PRs.`,
  },
  tailwind: {
    name: 'tailwind', source: 'builtin',
    description: 'Tailwind CSS standards',
    triggers: ['tailwind', 'className', 'tw-'],
    prompt: `Tailwind: mobile-first responsive, order classes layout→spacing→color→effects, cn() for conditional classes, full class names (not dynamic strings), focus-visible for keyboard nav.`,
  },
  api: {
    name: 'api', source: 'builtin',
    description: 'REST API design',
    triggers: ['api', 'endpoint', 'rest', 'route'],
    prompt: `REST API: nouns for resources, correct HTTP methods, proper status codes (200/201/400/401/404/422/500), version with /v1/, pagination with page+limit, consistent JSON response shape.`,
  },
  docker: {
    name: 'docker', source: 'builtin',
    description: 'Docker standards',
    triggers: ['docker', 'dockerfile', 'container'],
    prompt: `Docker: multi-stage builds, pin exact versions (not :latest), non-root user, minimal .dockerignore, health checks, never store secrets in images.`,
  },
};

// ── Auto-detect skills from project ───────────────────────

export function detectSkills(
  query: string,
  projectSkills: string[],
  myaiMdSkills: string[]
): Skill[] {
  const active = new Set<string>([...projectSkills, ...myaiMdSkills]);
  const q = query.toLowerCase();

  // Keyword matching
  for (const [name, skill] of Object.entries(BUILTIN_SKILLS)) {
    if (active.has(name)) continue;
    for (const trigger of skill.triggers) {
      if (q.includes(trigger)) { active.add(name); break; }
    }
  }

  // Always include security + git
  active.add('security');
  active.add('git');

  return Array.from(active)
    .map(name => BUILTIN_SKILLS[name])
    .filter(Boolean)
    .slice(0, 6);
}

export function buildSkillsContext(skills: Skill[]): string {
  if (!skills.length) return '';
  const rules = skills.map(s => `### ${s.name}\n${s.prompt}`).join('\n\n');
  return `--- Active Skills (follow in ALL responses) ---\n${rules}`;
}

// ── MYAI.md ────────────────────────────────────────────────

export interface MyAIMd {
  raw: string;
  project: string;
  stack: string;
  rules: string[];
  avoid: string[];
  skills: string[];
  notes: string;
  commands: Record<string, string>;
}

export function parseMyAIMd(content: string): MyAIMd {
  const getSection = (name: string): string => {
    const m = content.match(new RegExp(`##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'));
    return m ? m[1].trim() : '';
  };

  const parseBullets = (section: string): string[] =>
    section.split('\n')
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);

  const parseCommands = (section: string): Record<string, string> => {
    const cmds: Record<string, string> = {};
    for (const line of section.split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/);
      if (m) cmds[m[1]] = m[2];
    }
    return cmds;
  };

  return {
    raw:      content,
    project:  getSection('Project'),
    stack:    getSection('Stack'),
    rules:    parseBullets(getSection('Rules')),
    avoid:    parseBullets(getSection('Avoid')),
    skills:   parseBullets(getSection('Skills')),
    notes:    getSection('Notes'),
    commands: parseCommands(getSection('Commands')),
  };
}

export function myaiMdToPrompt(md: MyAIMd): string {
  const parts: string[] = ['--- MYAI.md Project Context ---'];
  if (md.project) parts.push(`Project: ${md.project}`);
  if (md.stack)   parts.push(`Stack: ${md.stack}`);
  if (md.rules.length)  parts.push(`Rules:\n${md.rules.map(r => `• ${r}`).join('\n')}`);
  if (md.avoid.length)  parts.push(`Avoid:\n${md.avoid.map(a => `• ${a}`).join('\n')}`);
  if (md.notes)   parts.push(`Notes: ${md.notes}`);
  parts.push('IMPORTANT: Follow ALL rules and avoid items above in every response.');
  return parts.join('\n\n');
}

// ── Custom skills storage ──────────────────────────────────

export async function loadCustomSkills(): Promise<Skill[]> {
  try {
    const data = await AsyncStorage.getItem('myai_custom_skills');
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function saveCustomSkill(skill: Skill): Promise<void> {
  const skills = await loadCustomSkills();
  const updated = [...skills.filter(s => s.name !== skill.name), skill];
  await AsyncStorage.setItem('myai_custom_skills', JSON.stringify(updated));
}

export async function deleteCustomSkill(name: string): Promise<void> {
  const skills = await loadCustomSkills();
  await AsyncStorage.setItem('myai_custom_skills', JSON.stringify(skills.filter(s => s.name !== name)));
}

export async function getAllSkills(): Promise<Skill[]> {
  const custom = await loadCustomSkills();
  const customMap = Object.fromEntries(custom.map(s => [s.name, s]));
  return [...Object.values(BUILTIN_SKILLS), ...custom.filter(s => !BUILTIN_SKILLS[s.name])];
}
