// src/screens/AgentScreen.tsx — Agent mode + Skills + MYAI.md + Code Review

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, spacing, radius } from '../theme';
import {
  Card, SectionHeader, Badge, Button, Input,
  Divider, EmptyState, PulseDot, TagPill,
} from '../components/UI';
import { chat, MODELS, Keys } from '../services/providers';
import {
  BUILTIN_SKILLS, detectSkills, buildSkillsContext,
  loadCustomSkills, saveCustomSkill, deleteCustomSkill,
  getAllSkills, parseMyAIMd, myaiMdToPrompt, Skill,
} from '../services/skills';
import { buildSystemPrompt } from '../services/api';
import { useProjectStore } from '../store';

type AgentStep = {
  id: string;
  type: 'plan' | 'write' | 'run' | 'verify' | 'done';
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string;
};

// ── Tab switcher ───────────────────────────────────────────

type Tab = 'agent' | 'skills' | 'review';

// ── Agent tab ──────────────────────────────────────────────

function AgentTab() {
  const [goal, setGoal]         = useState('');
  const [running, setRunning]   = useState(false);
  const [steps, setSteps]       = useState<AgentStep[]>([]);
  const [log, setLog]           = useState<string[]>([]);

  const { projects } = useProjectStore();

  const EXAMPLE_GOALS = [
    'Write unit tests for a login function',
    'Create a REST API endpoint for user auth',
    'Refactor this code to use async/await',
    'Add error handling to all API calls',
    'Generate TypeScript types from this JSON',
  ];

  const getModel = async () => {
    const modelId = await AsyncStorage.getItem('myai_model') || 'llama-3.3-70b-versatile';
    return MODELS.find(m => m.id === modelId) || MODELS[1];
  };

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const runAgent = async () => {
    if (!goal.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning(true);
    setSteps([]);
    setLog([]);
    addLog(`🎯 Goal: ${goal}`);

    try {
      const model = await getModel();

      // Step 1: Plan
      addLog('📋 Planning steps...');
      const planMsg = await chat([
        { role: 'system', content: 'You are a coding agent. Break the goal into 3-5 concrete steps. Respond ONLY with a JSON array: [{"type":"write","description":"..."},{"type":"verify","description":"..."}]. Types: write, verify, done.' },
        { role: 'user', content: `Goal: ${goal}` },
      ], model, 500);

      let parsedSteps: any[] = [];
      try {
        const clean = planMsg.replace(/```json|```/g, '').trim();
        parsedSteps = JSON.parse(clean);
      } catch {
        parsedSteps = [
          { type: 'write', description: `Implement: ${goal}` },
          { type: 'verify', description: 'Verify the implementation is correct' },
          { type: 'done', description: 'Task complete' },
        ];
      }

      const agentSteps: AgentStep[] = parsedSteps.map((s: any, i: number) => ({
        id: `step-${i}`,
        type: s.type || 'write',
        description: s.description || '',
        status: 'pending',
      }));

      setSteps(agentSteps);
      addLog(`✓ Plan created: ${agentSteps.length} steps`);

      // Step 2: Execute each step
      for (let i = 0; i < agentSteps.length; i++) {
        const step = agentSteps[i];
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'running' } : s));
        addLog(`⚡ Step ${i+1}: ${step.description}`);

        if (step.type === 'done') {
          setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'done', output: 'Complete!' } : s));
          addLog('✅ Task complete!');
          break;
        }

        const stepResponse = await chat([
          { role: 'system', content: `You are completing step ${i+1} of a coding task. Be specific and produce working code or a clear answer. Format code in markdown code blocks.` },
          { role: 'user', content: `Overall goal: ${goal}\n\nComplete this step: ${step.description}\n\nProvide the code or output for this step.` },
        ], model, 1500);

        setSteps(prev => prev.map(s =>
          s.id === step.id ? { ...s, status: 'done', output: stepResponse.slice(0, 300) } : s
        ));
        addLog(`✓ Step ${i+1} done`);
        await new Promise(r => setTimeout(r, 300));
      }

    } catch (e: any) {
      addLog(`❌ Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Goal input */}
      <Card>
        <Text style={styles.cardTitle}>🤖 Agent Mode</Text>
        <Text style={styles.cardDesc}>Give myai a goal — it plans and executes autonomously.</Text>
        <TextInput
          style={styles.goalInput}
          value={goal}
          onChangeText={setGoal}
          placeholder="e.g. Write unit tests for the auth module"
          placeholderTextColor={colors.textDim}
          multiline
        />
        <Button
          label={running ? 'Running...' : 'Run Agent'}
          onPress={runAgent}
          loading={running}
          disabled={!goal.trim()}
        />
      </Card>

      {/* Example goals */}
      {!running && steps.length === 0 && (
        <Card>
          <Text style={styles.cardTitle}>Example Goals</Text>
          {EXAMPLE_GOALS.map(eg => (
            <TouchableOpacity key={eg} onPress={() => setGoal(eg)} style={styles.exampleRow}>
              <Text style={styles.exampleText}>→ {eg}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Execution Plan</Text>
          {steps.map((step, i) => (
            <View key={step.id} style={styles.stepRow}>
              <View style={[styles.stepDot, {
                backgroundColor:
                  step.status === 'done'    ? colors.success :
                  step.status === 'running' ? colors.primary :
                  step.status === 'failed'  ? colors.danger  : colors.border
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepNum}>Step {i+1} · {step.type.toUpperCase()}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
                {step.output && (
                  <Text style={styles.stepOutput} numberOfLines={3}>{step.output}</Text>
                )}
              </View>
              {step.status === 'running' && <PulseDot />}
            </View>
          ))}
        </Card>
      )}

      {/* Log */}
      {log.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Agent Log</Text>
          {log.map((entry, i) => (
            <Text key={i} style={styles.logEntry}>{entry}</Text>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

// ── Skills tab ─────────────────────────────────────────────

function SkillsTab() {
  const [allSkills, setAllSkills]     = useState<Skill[]>([]);
  const [activeSkills, setActive]     = useState<string[]>([]);
  const [myaiMdText, setMyaiMdText]   = useState('');
  const [showMyaiMd, setShowMyaiMd]   = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillPrompt, setNewSkillPrompt] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const skills = await getAllSkills();
    setAllSkills(skills);
    const active = await AsyncStorage.getItem('myai_active_skills');
    setActive(active ? JSON.parse(active) : ['security', 'git']);
    const md = await AsyncStorage.getItem('myai_md_content') || '';
    setMyaiMdText(md);
  };

  const toggleSkill = async (name: string) => {
    const updated = activeSkills.includes(name)
      ? activeSkills.filter(s => s !== name)
      : [...activeSkills, name];
    setActive(updated);
    await AsyncStorage.setItem('myai_active_skills', JSON.stringify(updated));
  };

  const saveMyaiMd = async () => {
    await AsyncStorage.setItem('myai_md_content', myaiMdText);
    setShowMyaiMd(false);
    Alert.alert('✓ Saved', 'MYAI.md context saved.');
  };

  const addCustomSkill = async () => {
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;
    const skill: Skill = {
      name: newSkillName.trim().toLowerCase(),
      description: `Custom: ${newSkillName}`,
      triggers: [newSkillName.toLowerCase()],
      prompt: newSkillPrompt.trim(),
      source: 'custom',
    };
    await saveCustomSkill(skill);
    setNewSkillName(''); setNewSkillPrompt('');
    loadData();
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>

      {/* MYAI.md */}
      <Card>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardTitle}>📋 MYAI.md</Text>
            <Text style={styles.cardDesc}>Project context myai reads automatically</Text>
          </View>
          <Button label="Edit" onPress={() => setShowMyaiMd(true)} variant="ghost" />
        </View>
        {myaiMdText ? (
          <Text style={styles.myaiMdPreview} numberOfLines={3}>{myaiMdText}</Text>
        ) : (
          <Text style={styles.emptyHint}>No MYAI.md yet. Tap Edit to add project context.</Text>
        )}
      </Card>

      {showMyaiMd && (
        <Card>
          <Text style={styles.cardTitle}>Edit MYAI.md</Text>
          <TextInput
            style={styles.myaiMdInput}
            value={myaiMdText}
            onChangeText={setMyaiMdText}
            multiline
            placeholder={`## Project\nMy Flask API\n\n## Stack\nPython, FastAPI, PostgreSQL\n\n## Rules\n- Always use async/await\n- No print(), use logger\n\n## Skills\n- python\n- security`}
            placeholderTextColor={colors.textDim}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Save" onPress={saveMyaiMd} style={{ flex: 1 }} />
            <Button label="Cancel" onPress={() => setShowMyaiMd(false)} variant="ghost" style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <Divider label="Active Skills" />

      {/* Built-in skills */}
      <View style={styles.skillGrid}>
        {allSkills.filter(s => s.source === 'builtin').map(skill => (
          <TouchableOpacity
            key={skill.name}
            onPress={() => toggleSkill(skill.name)}
            style={[styles.skillChip, activeSkills.includes(skill.name) && styles.skillChipActive]}
          >
            <Text style={[styles.skillChipText, activeSkills.includes(skill.name) && styles.skillChipTextActive]}>
              {skill.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Divider label="Custom Skills" />

      {/* Custom skills */}
      {allSkills.filter(s => s.source === 'custom').map(skill => (
        <Card key={skill.name}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{skill.name}</Text>
            <TouchableOpacity onPress={() => deleteCustomSkill(skill.name).then(loadData)}>
              <Text style={{ color: colors.danger, fontSize: 13 }}>Delete</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardDesc} numberOfLines={2}>{skill.prompt}</Text>
        </Card>
      ))}

      <Card>
        <Text style={styles.cardTitle}>+ New Custom Skill</Text>
        <Input label="Name" value={newSkillName} onChangeText={setNewSkillName} placeholder="my-rules" />
        <Input label="Instructions" value={newSkillPrompt} onChangeText={setNewSkillPrompt}
               placeholder="Always use X, never do Y..." multiline />
        <Button label="Add Skill" onPress={addCustomSkill}
                disabled={!newSkillName.trim() || !newSkillPrompt.trim()} variant="ghost" />
      </Card>
    </ScrollView>
  );
}

// ── Review tab ─────────────────────────────────────────────

function ReviewTab() {
  const [code, setCode]         = useState('');
  const [review, setReview]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [reviewType, setReviewType] = useState<'general' | 'security' | 'performance' | 'tests'>('general');

  const getModel = async () => {
    const modelId = await AsyncStorage.getItem('myai_model') || 'llama-3.3-70b-versatile';
    return MODELS.find(m => m.id === modelId) || MODELS[1];
  };

  const runReview = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setReview('');
    try {
      const model = await getModel();
      const prompts = {
        general:     'Review this code for bugs, readability, and best practices.',
        security:    'Review this code ONLY for security vulnerabilities. Be thorough.',
        performance: 'Review this code ONLY for performance issues and optimizations.',
        tests:       'Suggest what unit tests should be written for this code. List specific test cases.',
      };
      const response = await chat([
        { role: 'system', content: `You are an expert code reviewer. ${prompts[reviewType]}\n\nFormat your response with:\n## Issues\n## Suggestions\n## Verdict (✅ LGTM / ⚠️ Minor issues / ❌ Needs work)` },
        { role: 'user', content: `Review this code:\n\`\`\`\n${code}\n\`\`\`` },
      ], model, 1500);
      setReview(response);
    } catch (e: any) {
      setReview(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setCode(text);
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Card>
        <Text style={styles.cardTitle}>🔍 Code Review</Text>
        <View style={styles.reviewTypeRow}>
          {(['general','security','performance','tests'] as const).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setReviewType(t)}
              style={[styles.typeChip, reviewType === t && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, reviewType === t && styles.typeChipTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.inputLabel}>Code to Review</Text>
          <TouchableOpacity onPress={pasteFromClipboard}>
            <Text style={styles.pasteBtn}>📋 Paste</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={setCode}
          placeholder="Paste your code here..."
          placeholderTextColor={colors.textDim}
          multiline
          fontFamily="monospace"
        />
        <Button label={loading ? 'Reviewing...' : 'Review Code'} onPress={runReview}
                loading={loading} disabled={!code.trim()} />
      </Card>

      {review ? (
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Review Result</Text>
            <TouchableOpacity onPress={() => Clipboard.setStringAsync(review)}>
              <Text style={styles.pasteBtn}>Copy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.reviewText}>{review}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

// ── Main screen ────────────────────────────────────────────

export function AgentScreen() {
  const [tab, setTab] = useState<Tab>('agent');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.tabs}>
        {([['agent','🤖 Agent'],['skills','🎯 Skills'],['review','🔍 Review']] as const).map(([t,l]) => (
          <TouchableOpacity key={t} style={[styles.tab, tab===t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab===t && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'agent'  && <AgentTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'review' && <ReviewTab />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },
  tabs:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:            { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText:        { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive:  { color: colors.primary },
  tabContent:     { padding: spacing.md, paddingBottom: spacing.xxl },
  cardTitle:      { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDesc:       { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginBottom: spacing.sm },
  goalInput:      { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.sm },
  exampleRow:     { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  exampleText:    { color: colors.textMuted, fontSize: 13 },
  stepRow:        { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepDot:        { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stepNum:        { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  stepDesc:       { color: colors.text, fontSize: 13 },
  stepOutput:     { color: colors.textMuted, fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  logEntry:       { color: colors.textMuted, fontSize: 12, paddingVertical: 2, fontFamily: 'monospace' },
  rowBetween:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  myaiMdPreview:  { color: colors.textMuted, fontSize: 12, fontFamily: 'monospace', backgroundColor: colors.codeBlock, padding: 8, borderRadius: radius.sm, marginTop: 4 },
  myaiMdInput:    { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 13, minHeight: 200, textAlignVertical: 'top', fontFamily: 'monospace', marginBottom: spacing.sm },
  emptyHint:      { color: colors.textDim, fontSize: 12, fontStyle: 'italic' },
  skillGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  skillChip:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  skillChipActive:{ backgroundColor: colors.primaryDim + '33', borderColor: colors.primary },
  skillChipText:  { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  skillChipTextActive: { color: colors.primary },
  reviewTypeRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: spacing.sm },
  typeChip:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  typeChipActive: { backgroundColor: colors.primaryDim + '33', borderColor: colors.primary },
  typeChipText:   { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  typeChipTextActive: { color: colors.primary },
  inputLabel:     { color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  pasteBtn:       { color: colors.accent, fontSize: 13, fontWeight: '600' },
  codeInput:      { backgroundColor: colors.codeBlock, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.accent, fontSize: 12, minHeight: 160, textAlignVertical: 'top', marginVertical: spacing.sm },
  reviewText:     { color: colors.text, fontSize: 13, lineHeight: 20 },
});
