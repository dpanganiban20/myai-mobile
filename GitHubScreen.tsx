// src/screens/GitHubScreen.tsx — GitHub integration

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import { Card, SectionHeader, EmptyState, Badge, Button, Divider } from '../components/UI';
import { github, getKey } from '../services/api';

type Tab = 'repos' | 'issues' | 'prs';

export function GitHubScreen() {
  const [tab, setTab] = useState<Tab>('repos');
  const [repos, setRepos] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [prs, setPRs]       = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoInput, setRepoInput]       = useState('');
  const [loading, setLoading]           = useState(false);
  const [connected, setConnected]       = useState(false);
  const [username, setUsername]         = useState('');

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    const token = await getKey('github_token');
    if (token) {
      try {
        const me = await github.me();
        setUsername(me.login);
        setConnected(true);
        loadRepos();
      } catch { setConnected(false); }
    }
  };

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await github.repos();
      setRepos(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  const loadRepoData = async (repo: string) => {
    setSelectedRepo(repo);
    setLoading(true);
    try {
      const [owner, name] = repo.split('/');
      const [issueData, prData] = await Promise.all([
        github.issues(owner, name),
        github.prs(owner, name),
      ]);
      setIssues(issueData);
      setPRs(prData);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  if (!connected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon="🐙"
          title="GitHub not connected"
          subtitle="Add your GitHub token in Settings to see repos, issues, and PRs"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['repos', 'issues', 'prs'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'repos' ? '📦 Repos' : t === 'issues' ? '🐛 Issues' : '🔀 PRs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={tab === 'repos' ? loadRepos : () => loadRepoData(selectedRepo)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Repo selector for issues/prs */}
        {tab !== 'repos' && (
          <View style={styles.repoSelector}>
            <TextInput
              style={styles.repoInput}
              value={repoInput}
              onChangeText={setRepoInput}
              placeholder="owner/repo"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={() => loadRepoData(repoInput)}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.repoBtn}
              onPress={() => loadRepoData(repoInput)}
            >
              <Text style={styles.repoBtnText}>Load</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Repos */}
        {tab === 'repos' && (
          <>
            <SectionHeader title={`Your Repos (${repos.length})`} />
            {repos.length === 0
              ? <EmptyState icon="📦" title="No repos found" />
              : repos.map(repo => (
                <Card key={repo.id}>
                  <TouchableOpacity onPress={() => {
                    setRepoInput(repo.full_name);
                    setTab('issues');
                    loadRepoData(repo.full_name);
                  }}>
                    <Text style={styles.repoName}>{repo.full_name}</Text>
                    <Text style={styles.repoDesc} numberOfLines={1}>
                      {repo.description || 'No description'}
                    </Text>
                    <View style={styles.repoMeta}>
                      {repo.language && <Badge label={repo.language} color={colors.accent} />}
                      <Text style={styles.metaText}>⭐ {repo.stargazers_count}</Text>
                      <Text style={styles.metaText}>🔀 {repo.forks_count}</Text>
                    </View>
                  </TouchableOpacity>
                </Card>
              ))
            }
          </>
        )}

        {/* Issues */}
        {tab === 'issues' && (
          <>
            <SectionHeader title={`Issues${selectedRepo ? ` · ${selectedRepo}` : ''} (${issues.length})`} />
            {issues.length === 0
              ? <EmptyState icon="🐛" title="No open issues" subtitle="Enter a repo above to load issues" />
              : issues.map(issue => (
                <Card key={issue.id}>
                  <Text style={styles.issueNum}>#{issue.number}</Text>
                  <Text style={styles.issueTitle}>{issue.title}</Text>
                  <View style={styles.issueMeta}>
                    {issue.labels?.slice(0,3).map((l: any) => (
                      <Badge key={l.id} label={l.name} color={`#${l.color}`} />
                    ))}
                    <Text style={styles.metaText}>
                      {new Date(issue.updated_at).toLocaleDateString()}
                    </Text>
                  </View>
                </Card>
              ))
            }
          </>
        )}

        {/* PRs */}
        {tab === 'prs' && (
          <>
            <SectionHeader title={`Pull Requests${selectedRepo ? ` · ${selectedRepo}` : ''} (${prs.length})`} />
            {prs.length === 0
              ? <EmptyState icon="🔀" title="No open PRs" subtitle="Enter a repo above to load PRs" />
              : prs.map(pr => (
                <Card key={pr.id}>
                  <View style={styles.prRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.issueNum}>#{pr.number}</Text>
                      <Text style={styles.issueTitle}>{pr.title}</Text>
                      <Text style={styles.metaText}>
                        by {pr.user.login} · {pr.head.ref} → {pr.base.ref}
                      </Text>
                    </View>
                    <Badge
                      label={pr.draft ? 'Draft' : 'Open'}
                      color={pr.draft ? colors.textMuted : colors.success}
                    />
                  </View>
                </Card>
              ))
            }
          </>
        )}
      </ScrollView>
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
  scroll:         { padding: spacing.md, paddingBottom: spacing.xxl },
  repoSelector:   { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  repoInput:      { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 14 },
  repoBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  repoBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  repoName:       { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  repoDesc:       { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  repoMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText:       { color: colors.textMuted, fontSize: 11 },
  issueNum:       { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  issueTitle:     { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  issueMeta:      { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  prRow:          { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
