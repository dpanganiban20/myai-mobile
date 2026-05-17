// src/screens/MemoryScreen.tsx — View and manage per-project memory

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import { Card, SectionHeader, EmptyState, Badge, Button, Input, Divider } from '../components/UI';
import { useProjectStore, useChatStore, useMemoryStore, useCorrectionsStore, useTokenStore } from '../store';

export function MemoryScreen() {
  const { projects, load: loadProjects, deleteProject } = useProjectStore();
  const { clearHistory, getHistory } = useMemoryStore();
  const { corrections, remove: removeCorrection, clear: clearCorrections, load: loadCorrections } = useCorrectionsStore();
  const { sessionTokens, totalTokens, sessionCalls, reset: resetTokens } = useTokenStore();
  const { setProject, currentProjectId, clearMessages } = useChatStore();

  const [projectStats, setProjectStats] = useState<Record<string, number>>({});

  useEffect(() => {
    loadProjects();
    loadCorrections();
  }, []);

  useEffect(() => {
    // Load message counts per project
    const loadStats = async () => {
      const stats: Record<string, number> = {};
      for (const p of projects) {
        const history = await getHistory(p.id);
        stats[p.id] = history.length;
      }
      setProjectStats(stats);
    };
    if (projects.length) loadStats();
  }, [projects]);

  const handleClearProject = (projectId: string, name: string) => {
    Alert.alert(
      'Clear Memory',
      `Clear conversation history for "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: async () => {
            await clearHistory(projectId);
            setProjectStats(s => ({ ...s, [projectId]: 0 }));
            if (currentProjectId === projectId) clearMessages();
          },
        },
      ]
    );
  };

  const refCost = (tokens: number) => ((tokens / 1_000_000) * 10).toFixed(4);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Token stats */}
        <SectionHeader title="Token Usage" action="Reset" onAction={() => {
          Alert.alert('Reset Tokens', 'Clear all token usage data?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: resetTokens },
          ]);
        }} />
        <View style={styles.tokenGrid}>
          <Card style={styles.tokenCard}>
            <Text style={styles.tokenNum}>{sessionTokens.toLocaleString()}</Text>
            <Text style={styles.tokenLabel}>Session tokens</Text>
          </Card>
          <Card style={styles.tokenCard}>
            <Text style={styles.tokenNum}>{totalTokens.toLocaleString()}</Text>
            <Text style={styles.tokenLabel}>Total tokens</Text>
          </Card>
          <Card style={styles.tokenCard}>
            <Text style={styles.tokenNum}>{sessionCalls}</Text>
            <Text style={styles.tokenLabel}>AI calls</Text>
          </Card>
          <Card style={[styles.tokenCard, { borderColor: colors.success + '44' }]}>
            <Text style={[styles.tokenNum, { color: colors.success }]}>
              ${refCost(totalTokens)}
            </Text>
            <Text style={styles.tokenLabel}>Ref. cost saved</Text>
          </Card>
        </View>
        <Text style={styles.hint}>💡 Groq is free — this is what you'd pay on GPT-4o</Text>

        <Divider />

        {/* Project memories */}
        <SectionHeader title="Project Memory" />
        {projects.length === 0
          ? <EmptyState icon="🧠" title="No projects yet" subtitle="Create a project to start saving memory" />
          : projects.map(project => (
            <Card key={project.id}>
              <View style={styles.projectRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  <Text style={styles.projectMeta}>
                    {projectStats[project.id] || 0} messages · {project.skills.slice(0,3).join(', ')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleClearProject(project.id, project.name)}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        }

        <Divider />

        {/* Corrections */}
        <SectionHeader
          title="Permanent Rules"
          action={corrections.length ? "Clear all" : undefined}
          onAction={() => Alert.alert('Clear Rules', 'Remove all permanent rules?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: clearCorrections },
          ])}
        />
        {corrections.length === 0
          ? <EmptyState icon="📌" title="No rules yet" subtitle="Add permanent rules in Settings → Rules" />
          : corrections.map(c => (
            <Card key={c.id}>
              <View style={styles.correctionRow}>
                <Badge label={c.category} color={colors.accent} />
                <Text style={styles.correctionText}>{c.text}</Text>
                <TouchableOpacity onPress={() => removeCorrection(c.id)}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        }
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },
  scroll:         { padding: spacing.md, paddingBottom: spacing.xxl },
  tokenGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tokenCard:      { flex: 1, minWidth: '45%', alignItems: 'center' },
  tokenNum:       { color: colors.primary, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  tokenLabel:     { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint:           { color: colors.textDim, fontSize: 12, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  projectRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectName:    { color: colors.text, fontSize: 15, fontWeight: '600' },
  projectMeta:    { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  clearBtn:       { backgroundColor: colors.danger + '22', borderColor: colors.danger + '44', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  clearBtnText:   { color: colors.danger, fontSize: 12, fontWeight: '600' },
  correctionRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  correctionText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  removeText:     { color: colors.textMuted, fontSize: 16, padding: 2 },
});
