// src/screens/SettingsScreen.tsx — API keys, rules, preferences

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import { Card, Input, Button, SectionHeader, Divider, Badge, TagPill } from '../components/UI';
import { saveKey, getKey, deleteKey } from '../services/api';
import { useCorrectionsStore } from '../store';

const AVAILABLE_SKILLS = [
  'python','typescript','react','nextjs','vue','svelte','tailwind',
  'fastapi','django','flask','express','golang','rust','docker',
  'prisma','graphql','security','testing','git','api','database',
];

export function SettingsScreen() {
  const [groqKey, setGroqKey]       = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [jiraUrl, setJiraUrl]       = useState('');
  const [jiraEmail, setJiraEmail]   = useState('');
  const [jiraToken, setJiraToken]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [newRule, setNewRule]       = useState('');
  const [ruleCategory, setRuleCategory] = useState('general');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const { corrections, add: addCorrection, load: loadCorrections } = useCorrectionsStore();

  useEffect(() => {
    loadKeys();
    loadCorrections();
    loadSkills();
  }, []);

  const loadKeys = async () => {
    const [gk, gt, ju, je, jt] = await Promise.all([
      getKey('groq_api_key'),
      getKey('github_token'),
      getKey('jira_url'),
      getKey('jira_email'),
      getKey('jira_token'),
    ]);
    if (gk) setGroqKey(gk);
    if (gt) setGithubToken(gt);
    if (ju) setJiraUrl(ju);
    if (je) setJiraEmail(je);
    if (jt) setJiraToken(jt);
  };

  const loadSkills = async () => {
    const s = await getKey('selected_skills');
    if (s) setSelectedSkills(JSON.parse(s));
  };

  const saveKeys = async () => {
    setSaving(true);
    try {
      if (groqKey)     await saveKey('groq_api_key', groqKey);
      if (githubToken) await saveKey('github_token', githubToken);
      if (jiraUrl)     await saveKey('jira_url', jiraUrl);
      if (jiraEmail)   await saveKey('jira_email', jiraEmail);
      if (jiraToken)   await saveKey('jira_token', jiraToken);
      await saveKey('selected_skills', JSON.stringify(selectedSkills));
      Alert.alert('✓ Saved', 'Settings saved securely.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const addRule = async () => {
    if (!newRule.trim()) return;
    await addCorrection(newRule.trim(), ruleCategory);
    setNewRule('');
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills(s =>
      s.includes(skill) ? s.filter(x => x !== skill) : [...s, skill]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* API Keys */}
        <SectionHeader title="API Keys" />
        <Card>
          <Input
            label="Groq API Key (required)"
            value={groqKey}
            onChangeText={setGroqKey}
            placeholder="gsk_..."
            secureTextEntry
          />
          <Text style={styles.hint}>
            Free at console.groq.com — powers all AI responses
          </Text>
        </Card>

        <Divider label="Integrations" />

        <Card>
          <Input
            label="GitHub Token"
            value={githubToken}
            onChangeText={setGithubToken}
            placeholder="ghp_..."
            secureTextEntry
          />
          <Text style={styles.hint}>github.com/settings/tokens → repo, issues scopes</Text>
        </Card>

        <Card>
          <Input
            label="Jira URL"
            value={jiraUrl}
            onChangeText={setJiraUrl}
            placeholder="https://yourorg.atlassian.net"
          />
          <Input
            label="Jira Email"
            value={jiraEmail}
            onChangeText={setJiraEmail}
            placeholder="you@company.com"
          />
          <Input
            label="Jira API Token"
            value={jiraToken}
            onChangeText={setJiraToken}
            placeholder="your token"
            secureTextEntry
          />
          <Text style={styles.hint}>id.atlassian.com → Security → API tokens</Text>
        </Card>

        <Button label={saving ? 'Saving...' : 'Save All Settings'} onPress={saveKeys} loading={saving} />

        <Divider label="Global Skills" />

        <Card>
          <Text style={styles.sectionDesc}>
            Skills auto-apply rules to every AI response. Select the ones that match your work.
          </Text>
          <View style={styles.skillGrid}>
            {AVAILABLE_SKILLS.map(skill => (
              <TouchableOpacity
                key={skill}
                onPress={() => toggleSkill(skill)}
                style={[
                  styles.skillChip,
                  selectedSkills.includes(skill) && styles.skillChipActive,
                ]}
              >
                <Text style={[
                  styles.skillChipText,
                  selectedSkills.includes(skill) && styles.skillChipTextActive,
                ]}>
                  {skill}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Divider label="Permanent Rules" />

        <Card>
          <Text style={styles.sectionDesc}>
            Rules myai will ALWAYS follow — never forgotten across sessions.
          </Text>
          <Input
            label="New Rule"
            value={newRule}
            onChangeText={setNewRule}
            placeholder='e.g. "Always use async/await, never callbacks"'
            multiline
          />

          {/* Category selector */}
          <View style={styles.categoryRow}>
            {['general','style','security','architecture','testing'].map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setRuleCategory(cat)}
                style={[styles.catChip, ruleCategory === cat && styles.catChipActive]}
              >
                <Text style={[styles.catChipText, ruleCategory === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button label="Add Rule" onPress={addRule} variant="ghost" />

          {corrections.length > 0 && (
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {corrections.slice(-5).map(c => (
                <View key={c.id} style={styles.ruleRow}>
                  <Badge label={c.category} color={colors.accent} />
                  <Text style={styles.ruleText} numberOfLines={2}>{c.text}</Text>
                </View>
              ))}
              {corrections.length > 5 && (
                <Text style={styles.hint}>+{corrections.length - 5} more in Memory tab</Text>
              )}
            </View>
          )}
        </Card>

        <Divider />

        {/* Danger zone */}
        <SectionHeader title="Danger Zone" />
        <Card>
          <Button
            label="Clear All API Keys"
            variant="danger"
            onPress={() => Alert.alert(
              'Clear Keys',
              'This will remove all stored API keys. You will need to re-enter them.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear', style: 'destructive',
                  onPress: async () => {
                    await Promise.all([
                      deleteKey('groq_api_key'),
                      deleteKey('github_token'),
                      deleteKey('jira_url'),
                      deleteKey('jira_email'),
                      deleteKey('jira_token'),
                    ]);
                    setGroqKey(''); setGithubToken('');
                    setJiraUrl(''); setJiraEmail(''); setJiraToken('');
                    Alert.alert('Done', 'All keys cleared.');
                  },
                },
              ]
            )}
          />
        </Card>

        <Text style={styles.footer}>
          myai v1.0.0 · All keys stored securely with Expo SecureStore · Never sent to any server except the API you configure
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.bg },
  scroll:             { padding: spacing.md, paddingBottom: spacing.xxl },
  hint:               { color: colors.textMuted, fontSize: 11, marginTop: 4, marginBottom: spacing.xs },
  sectionDesc:        { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  skillGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip:          { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  skillChipActive:    { backgroundColor: colors.primaryDim + '33', borderColor: colors.primary },
  skillChipText:      { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  skillChipTextActive:{ color: colors.primary },
  categoryRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  catChip:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  catChipActive:      { backgroundColor: colors.accentDim, borderColor: colors.accent },
  catChipText:        { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  catChipTextActive:  { color: colors.accent },
  ruleRow:            { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleText:           { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16 },
  footer:             { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: spacing.lg, lineHeight: 16 },
});
