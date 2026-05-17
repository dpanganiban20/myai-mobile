// src/screens/ProjectsScreen.tsx — Manage coding projects

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import { Card, SectionHeader, EmptyState, Badge, Button, Input, TagPill, Divider } from '../components/UI';
import { useProjectStore, useChatStore } from '../store';

const SKILL_OPTIONS = [
  'python','typescript','react','nextjs','vue','fastapi',
  'django','golang','rust','docker','tailwind','prisma','security',
];

export function ProjectsScreen() {
  const { projects, load, addProject, updateProject, deleteProject } = useProjectStore();
  const { setProject, currentProjectId, clearMessages } = useChatStore();
  const [showModal, setShowModal] = useState(false);
  const [name, setName]           = useState('');
  const [repo, setRepo]           = useState('');
  const [notes, setNotes]         = useState('');
  const [skills, setSkills]       = useState<string[]>([]);
  const [creating, setCreating]   = useState(false);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    await addProject({ name: name.trim(), repo, notes, skills });
    setName(''); setRepo(''); setNotes(''); setSkills([]);
    setShowModal(false);
    setCreating(false);
  };

  const handleSelect = (id: string) => {
    if (currentProjectId === id) {
      setProject(null);
      clearMessages();
    } else {
      setProject(id);
      clearMessages();
    }
  };

  const handleDelete = (id: string, pName: string) => {
    Alert.alert('Delete Project', `Delete "${pName}"? This won't clear its memory.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteProject(id) },
    ]);
  };

  const toggleSkill = (s: string) =>
    setSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionHeader
          title={`Projects (${projects.length})`}
          action="+ New"
          onAction={() => setShowModal(true)}
        />

        {projects.length === 0
          ? <EmptyState
              icon="📁"
              title="No projects yet"
              subtitle="Create a project to give myai context about your codebase"
            />
          : projects.map(project => {
            const isActive = currentProjectId === project.id;
            return (
              <TouchableOpacity
                key={project.id}
                onPress={() => handleSelect(project.id)}
                onLongPress={() => handleDelete(project.id, project.name)}
              >
                <Card style={isActive ? styles.cardActive : undefined}>
                  <View style={styles.projectHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.projectTitleRow}>
                        {isActive && <Text style={styles.activeIndicator}>●</Text>}
                        <Text style={styles.projectName}>{project.name}</Text>
                      </View>
                      {project.repo && (
                        <Text style={styles.repoText}>🐙 {project.repo}</Text>
                      )}
                    </View>
                    <Text style={styles.date}>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  {project.skills.length > 0 && (
                    <View style={styles.skillRow}>
                      {project.skills.slice(0, 5).map(s => (
                        <Badge key={s} label={s} color={colors.primary} />
                      ))}
                      {project.skills.length > 5 && (
                        <Text style={styles.moreSkills}>+{project.skills.length - 5}</Text>
                      )}
                    </View>
                  )}

                  {project.notes ? (
                    <Text style={styles.notes} numberOfLines={2}>{project.notes}</Text>
                  ) : null}

                  {isActive && (
                    <Text style={styles.activeLabel}>✓ Active — myai uses this project context</Text>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })
        }
        <Text style={styles.hint}>Long press a project to delete it</Text>
      </ScrollView>

      {/* Create project modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Project</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Input
              label="Project Name *"
              value={name}
              onChangeText={setName}
              placeholder="My Flask API"
            />
            <Input
              label="GitHub Repo (optional)"
              value={repo}
              onChangeText={setRepo}
              placeholder="owner/repo-name"
            />
            <Input
              label="Notes / Context"
              value={notes}
              onChangeText={setNotes}
              placeholder="What this project does, key decisions, etc."
              multiline
            />

            <Text style={styles.skillLabel}>SKILLS</Text>
            <View style={styles.skillGrid}>
              {SKILL_OPTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleSkill(s)}
                  style={[styles.skillChip, skills.includes(s) && styles.skillChipActive]}
                >
                  <Text style={[styles.skillChipText, skills.includes(s) && styles.skillChipTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              label={creating ? 'Creating...' : 'Create Project'}
              onPress={handleCreate}
              loading={creating}
              disabled={!name.trim()}
              style={{ marginTop: spacing.lg }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.bg },
  scroll:             { padding: spacing.md, paddingBottom: spacing.xxl },
  cardActive:         { borderColor: colors.primary, borderWidth: 1.5 },
  projectHeader:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  projectTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeIndicator:    { color: colors.success, fontSize: 10 },
  projectName:        { color: colors.text, fontSize: 16, fontWeight: '700' },
  repoText:           { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  date:               { color: colors.textDim, fontSize: 11 },
  skillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  moreSkills:         { color: colors.textMuted, fontSize: 11, alignSelf: 'center' },
  notes:              { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 4 },
  activeLabel:        { color: colors.success, fontSize: 11, fontWeight: '600', marginTop: 6 },
  hint:               { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 },
  modal:              { flex: 1, backgroundColor: colors.bg },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:         { color: colors.text, fontSize: 18, fontWeight: '700' },
  modalClose:         { color: colors.textMuted, fontSize: 22, padding: 4 },
  modalScroll:        { padding: spacing.md, paddingBottom: spacing.xxl },
  skillLabel:         { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  skillGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  skillChip:          { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  skillChipActive:    { backgroundColor: colors.primaryDim + '33', borderColor: colors.primary },
  skillChipText:      { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  skillChipTextActive:{ color: colors.primary },
});
