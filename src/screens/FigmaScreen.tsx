// src/screens/FigmaScreen.tsx — Figma integration for mobile

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, radius } from '../theme';
import { Card, SectionHeader, Badge, Button, Input, EmptyState, Divider } from '../components/UI';
import { Keys } from '../services/providers';
import { chat, MODELS } from '../services/providers';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIGMA_BASE = 'https://api.figma.com/v1';

async function figmaGet(path: string): Promise<any> {
  const token = await Keys.get('FIGMA_TOKEN');
  if (!token) throw new Error('Figma token not set');
  const resp = await fetch(`${FIGMA_BASE}${path}`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!resp.ok) throw new Error(`Figma error ${resp.status}`);
  return resp.json();
}

type Tab = 'files' | 'inspect' | 'setup';

export function FigmaScreen() {
  const [tab, setTab]             = useState<Tab>('files');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [fileKey, setFileKey]     = useState('');
  const [fileData, setFileData]   = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savedFiles, setSavedFiles] = useState<string[]>([]);

  useEffect(() => { checkConnection(); loadSavedFiles(); }, []);

  const checkConnection = async () => {
    const token = await Keys.get('FIGMA_TOKEN');
    setConnected(!!token);
    if (!!token) setTab('files');
    else setTab('setup');
  };

  const loadSavedFiles = async () => {
    const data = await AsyncStorage.getItem('myai_figma_files');
    setSavedFiles(data ? JSON.parse(data) : []);
  };

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    setLoading(true);
    try {
      await Keys.set('FIGMA_TOKEN', tokenInput.trim());
      // Test
      const me = await figmaGet('/me');
      Alert.alert('✓ Connected', `Logged in as ${me.email}`);
      setConnected(true);
      setTab('files');
    } catch (e: any) {
      Alert.alert('Error', e.message);
      await Keys.delete('FIGMA_TOKEN');
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (key: string) => {
    if (!key.trim()) return;
    setLoading(true);
    setFileData(null);
    setAiAnalysis('');
    try {
      const data = await figmaGet(`/files/${key}`);
      setFileData(data);

      // Save to history
      const files = [...new Set([key, ...savedFiles])].slice(0, 10);
      setSavedFiles(files);
      await AsyncStorage.setItem('myai_figma_files', JSON.stringify(files));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithAI = async () => {
    if (!fileData) return;
    setAnalyzing(true);
    try {
      const modelId = await AsyncStorage.getItem('myai_model') || 'llama-3.3-70b-versatile';
      const model = MODELS.find(m => m.id === modelId) || MODELS[1];

      const doc = fileData.document || {};
      const pages = doc.children || [];
      const summary = pages.map((p: any) => {
        const frames = (p.children || []).filter((c: any) => c.type === 'FRAME');
        return `Page: ${p.name} (${frames.length} frames: ${frames.slice(0,5).map((f: any) => f.name).join(', ')})`;
      }).join('\n');

      const response = await chat([
        { role: 'system', content: 'You are a UI/UX expert and frontend developer. Analyze Figma files and give actionable implementation advice.' },
        { role: 'user', content: `Analyze this Figma file:\nName: ${fileData.name}\n\nStructure:\n${summary}\n\nProvide:\n1. Overview of the design\n2. Key components to implement\n3. Suggested React/HTML component structure\n4. Design system observations (colors, typography, spacing)` },
      ], model, 1500);

      setAiAnalysis(response);
    } catch (e: any) {
      setAiAnalysis(`Error: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.tabs}>
        {connected && (['files','inspect'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab===t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab===t && styles.tabTextActive]}>
              {t === 'files' ? '🎨 Files' : '🔍 Inspect'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.tab, tab==='setup' && styles.tabActive]} onPress={() => setTab('setup')}>
          <Text style={[styles.tabText, tab==='setup' && styles.tabTextActive]}>⚙️ Setup</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} tintColor={colors.primary} />}
      >

        {/* Setup tab */}
        {tab === 'setup' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>🎨 Connect Figma</Text>
              <Text style={styles.cardDesc}>
                Read your designs, components, and export assets.
              </Text>
              <Button
                label="Open Figma Settings"
                onPress={() => Linking.openURL('https://www.figma.com/settings')}
                variant="ghost"
                style={{ marginBottom: spacing.md }}
              />
              <Text style={styles.steps}>
                1. Go to figma.com/settings{'\n'}
                2. Scroll to Personal access tokens{'\n'}
                3. Generate new token{'\n'}
                4. Copy and paste below
              </Text>
              <Input
                label="Personal Access Token"
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="figd_..."
                secureTextEntry
              />
              <Button
                label={loading ? 'Connecting...' : 'Connect Figma'}
                onPress={saveToken}
                loading={loading}
                disabled={!tokenInput.trim()}
              />
            </Card>
            {connected && (
              <Button
                label="Remove Figma Token"
                variant="danger"
                onPress={() => {
                  Alert.alert('Remove', 'Remove Figma token?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: async () => {
                      await Keys.delete('FIGMA_TOKEN');
                      setConnected(false); setTab('setup');
                    }},
                  ]);
                }}
              />
            )}
          </>
        )}

        {/* Files tab */}
        {tab === 'files' && (
          <>
            <Card>
              <Text style={styles.cardTitle}>Load Figma File</Text>
              <Text style={styles.cardDesc}>
                Paste a Figma file key (from the URL: figma.com/design/[FILE_KEY]/...)
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.fileKeyInput}
                  value={fileKey}
                  onChangeText={setFileKey}
                  placeholder="File key..."
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.loadBtn}
                  onPress={() => { loadFile(fileKey); setTab('inspect'); }}
                >
                  <Text style={styles.loadBtnText}>Load</Text>
                </TouchableOpacity>
              </View>
            </Card>

            {savedFiles.length > 0 && (
              <>
                <SectionHeader title="Recent Files" />
                {savedFiles.map(key => (
                  <TouchableOpacity key={key} onPress={() => { setFileKey(key); loadFile(key); setTab('inspect'); }}>
                    <Card>
                      <Text style={styles.fileKey} numberOfLines={1}>{key}</Text>
                      <Text style={styles.tapHint}>Tap to load →</Text>
                    </Card>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {savedFiles.length === 0 && (
              <EmptyState
                icon="🎨"
                title="No files loaded yet"
                subtitle="Paste a Figma file key above to get started"
              />
            )}
          </>
        )}

        {/* Inspect tab */}
        {tab === 'inspect' && (
          <>
            {!fileData ? (
              <EmptyState
                icon="🔍"
                title="No file loaded"
                subtitle="Load a file from the Files tab first"
              />
            ) : (
              <>
                <Card>
                  <Text style={styles.cardTitle}>{fileData.name}</Text>
                  <Text style={styles.cardDesc}>
                    Last modified: {new Date(fileData.lastModified).toLocaleDateString()}
                  </Text>
                  <Button
                    label={analyzing ? 'Analyzing...' : '🤖 Analyze with AI'}
                    onPress={analyzeWithAI}
                    loading={analyzing}
                  />
                </Card>

                {/* Pages */}
                <SectionHeader title="Pages" />
                {(fileData.document?.children || []).map((page: any) => {
                  const frames = (page.children || []).filter((c: any) => c.type === 'FRAME');
                  return (
                    <Card key={page.id}>
                      <Text style={styles.pageName}>📄 {page.name}</Text>
                      <Text style={styles.pageDesc}>{frames.length} frames</Text>
                      <View style={styles.frameList}>
                        {frames.slice(0, 6).map((frame: any) => (
                          <Badge key={frame.id} label={frame.name} color={colors.accent} />
                        ))}
                        {frames.length > 6 && (
                          <Badge label={`+${frames.length - 6} more`} color={colors.textMuted} />
                        )}
                      </View>
                    </Card>
                  );
                })}

                {/* AI analysis */}
                {aiAnalysis ? (
                  <>
                    <Divider label="AI Analysis" />
                    <Card>
                      <Text style={styles.aiText}>{aiAnalysis}</Text>
                    </Card>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  tabs:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText:      { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive:{ color: colors.primary },
  scroll:       { padding: spacing.md, paddingBottom: spacing.xxl },
  cardTitle:    { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDesc:     { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginBottom: spacing.sm },
  steps:        { color: colors.textMuted, fontSize: 13, lineHeight: 22, marginBottom: spacing.md },
  inputRow:     { flexDirection: 'row', gap: 8 },
  fileKeyInput: { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 13 },
  loadBtn:      { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  loadBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  fileKey:      { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  tapHint:      { color: colors.textDim, fontSize: 11, marginTop: 2 },
  pageName:     { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  pageDesc:     { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  frameList:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  aiText:       { color: colors.text, fontSize: 13, lineHeight: 20 },
});
