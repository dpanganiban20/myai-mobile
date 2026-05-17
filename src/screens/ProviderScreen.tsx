// src/screens/ProviderScreen.tsx — Provider switcher + API key setup

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, radius } from '../theme';
import { Card, SectionHeader, Badge, Button, Input, Divider, EmptyState } from '../components/UI';
import { Keys, MODELS, getAvailableProviders, testKey, Provider, ProviderModel } from '../services/providers';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDER_INFO = [
  {
    id: 'groq' as Provider,
    name: 'Groq',
    icon: '🚀',
    color: '#f55036',
    free: true,
    keyName: 'GROQ_API_KEY',
    keyPrefix: 'gsk_',
    setupUrl: 'https://console.groq.com/keys',
    setupSteps: [
      'Go to console.groq.com',
      'Sign up free (no credit card)',
      'Click API Keys in sidebar',
      'Click Create API Key',
      'Copy and paste below',
    ],
    description: 'Free, fast. Powers Llama3 and Mixtral.',
  },
  {
    id: 'gemini' as Provider,
    name: 'Gemini',
    icon: '✨',
    color: '#4285f4',
    free: true,
    keyName: 'GEMINI_API_KEY',
    keyPrefix: 'AIza',
    setupUrl: 'https://aistudio.google.com/apikey',
    setupSteps: [
      'Go to aistudio.google.com',
      'Sign in with Google',
      'Click Get API Key',
      'Click Create API key',
      'Copy and paste below',
    ],
    description: 'Free. Gemini 2.5 Pro has 1M token context.',
  },
  {
    id: 'deepseek' as Provider,
    name: 'DeepSeek',
    icon: '🧠',
    color: '#00b4d8',
    free: false,
    keyName: 'DEEPSEEK_API_KEY',
    keyPrefix: 'sk-',
    setupUrl: 'https://platform.deepseek.com/api_keys',
    setupSteps: [
      'Go to platform.deepseek.com',
      'Create account + add $5 credit',
      'Go to API Keys',
      'Create new key',
      'Copy and paste below',
    ],
    description: 'Ultra cheap. R1 reasoner near Claude Opus quality.',
  },
  {
    id: 'anthropic' as Provider,
    name: 'Anthropic',
    icon: '🤖',
    color: '#d4763b',
    free: false,
    keyName: 'ANTHROPIC_API_KEY',
    keyPrefix: 'sk-ant-',
    setupUrl: 'https://console.anthropic.com/settings/keys',
    setupSteps: [
      'Go to console.anthropic.com',
      'Sign in + add billing',
      'Go to API Keys',
      'Create new key',
      'Copy and paste below',
    ],
    description: 'Paid. Claude Sonnet & Opus — most powerful.',
  },
];

const MODEL_DEFAULTS: Record<Provider, string> = {
  groq:      'llama-3.3-70b-versatile',
  gemini:    'gemini-2.0-flash',
  deepseek:  'deepseek-chat',
  anthropic: 'claude-sonnet-4-6',
  auto:      '',
};

export function ProviderScreen() {
  const [available, setAvailable]         = useState<Provider[]>([]);
  const [currentProvider, setCurrentProv] = useState<string>('groq');
  const [currentModel, setCurrentModel]   = useState<string>('llama-3.3-70b-versatile');
  const [setupModal, setSetupModal]       = useState<typeof PROVIDER_INFO[0] | null>(null);
  const [keyInput, setKeyInput]           = useState('');
  const [testing, setTesting]             = useState(false);
  const [modelModal, setModelModal]       = useState(false);

  useEffect(() => { loadState(); }, []);

  const loadState = async () => {
    const avail = await getAvailableProviders();
    setAvailable(avail);
    const p = await AsyncStorage.getItem('myai_provider') || 'auto';
    const m = await AsyncStorage.getItem('myai_model') || 'llama-3.3-70b-versatile';
    setCurrentProv(p);
    setCurrentModel(m);
  };

  const switchProvider = async (pid: Provider) => {
    const defaultModel = MODEL_DEFAULTS[pid] || 'llama-3.3-70b-versatile';
    await AsyncStorage.setItem('myai_provider', pid);
    await AsyncStorage.setItem('myai_model', defaultModel);
    setCurrentProv(pid);
    setCurrentModel(defaultModel);
  };

  const switchModel = async (model: ProviderModel) => {
    await AsyncStorage.setItem('myai_provider', model.provider);
    await AsyncStorage.setItem('myai_model', model.id);
    setCurrentProv(model.provider);
    setCurrentModel(model.id);
    setModelModal(false);
  };

  const handleSetupKey = async (provInfo: typeof PROVIDER_INFO[0]) => {
    if (!keyInput.trim()) return;
    setTesting(true);
    try {
      const result = await testKey(provInfo.id, keyInput.trim());
      if (result.ok) {
        await Keys.set(provInfo.keyName, keyInput.trim());
        setAvailable(await getAvailableProviders());
        setKeyInput('');
        setSetupModal(null);
        Alert.alert('✓ Connected', result.message);
        await switchProvider(provInfo.id);
      } else {
        Alert.alert('Connection Failed', result.message);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveKey = (provInfo: typeof PROVIDER_INFO[0]) => {
    Alert.alert('Remove Key', `Remove ${provInfo.name} API key?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await Keys.delete(provInfo.keyName);
          setAvailable(await getAvailableProviders());
          if (currentProvider === provInfo.id) await switchProvider('groq');
        },
      },
    ]);
  };

  const currentModelInfo = MODELS.find(m => m.id === currentModel);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Current selection */}
        <Card style={styles.currentCard}>
          <Text style={styles.currentLabel}>ACTIVE MODEL</Text>
          <Text style={styles.currentModel}>{currentModelInfo?.name || currentModel}</Text>
          <View style={styles.currentMeta}>
            <Badge
              label={currentModelInfo?.free ? 'Free' : 'Paid'}
              color={currentModelInfo?.free ? colors.success : colors.warning}
            />
            <Badge label={`${currentModelInfo?.contextK || '?'}K ctx`} color={colors.accent} />
            <Badge label={currentProvider.toUpperCase()} color={colors.primary} />
          </View>
          <Button
            label="Switch Model"
            onPress={() => setModelModal(true)}
            variant="ghost"
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        {/* Auto mode */}
        <TouchableOpacity onPress={() => switchProvider('auto')}>
          <Card style={currentProvider === 'auto' ? styles.cardActive : undefined}>
            <View style={styles.providerRow}>
              <Text style={styles.providerIcon}>🧭</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.providerName}>Auto Mode</Text>
                <Text style={styles.providerDesc}>Best model per task — reasoning, speed, vision</Text>
              </View>
              {currentProvider === 'auto' && <Text style={styles.activeIndicator}>●</Text>}
            </View>
          </Card>
        </TouchableOpacity>

        <Divider label="Providers" />

        {/* Provider cards */}
        {PROVIDER_INFO.map(prov => {
          const isConnected = available.includes(prov.id);
          const isActive    = currentProvider === prov.id;

          return (
            <Card key={prov.id} style={isActive ? styles.cardActive : undefined}>
              <View style={styles.providerRow}>
                <Text style={styles.providerIcon}>{prov.icon}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.providerTitleRow}>
                    <Text style={styles.providerName}>{prov.name}</Text>
                    <Badge
                      label={prov.free ? 'Free' : 'Paid'}
                      color={prov.free ? colors.success : colors.warning}
                    />
                    {isConnected && <Badge label="Connected" color={colors.success} />}
                  </View>
                  <Text style={styles.providerDesc}>{prov.description}</Text>
                </View>
                {isActive && <Text style={styles.activeIndicator}>●</Text>}
              </View>

              <View style={styles.providerActions}>
                {isConnected ? (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.primary }]}
                      onPress={() => switchProvider(prov.id)}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                        {isActive ? 'Active' : 'Use'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.danger }]}
                      onPress={() => handleRemoveKey(prov)}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.accent, flex: 1 }]}
                    onPress={() => { setSetupModal(prov); setKeyInput(''); }}
                  >
                    <Text style={[styles.actionBtnText, { color: colors.accent }]}>
                      + Connect {prov.name}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Models for this provider */}
              {isConnected && (
                <View style={styles.modelList}>
                  {MODELS.filter(m => m.provider === prov.id).map(m => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => switchModel(m)}
                      style={[styles.modelChip, currentModel === m.id && styles.modelChipActive]}
                    >
                      <Text style={[styles.modelChipText, currentModel === m.id && styles.modelChipTextActive]}>
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {/* Setup modal */}
      <Modal visible={!!setupModal} animationType="slide" presentationStyle="pageSheet">
        {setupModal && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect {setupModal.name}</Text>
              <TouchableOpacity onPress={() => setSetupModal(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Badge
                label={setupModal.free ? '🎉 Free' : '💳 Paid'}
                color={setupModal.free ? colors.success : colors.warning}
              />
              <Text style={styles.modalDesc}>{setupModal.description}</Text>

              <Text style={styles.stepsTitle}>Steps:</Text>
              {setupModal.setupSteps.map((step, i) => (
                <Text key={i} style={styles.step}>{i+1}. {step}</Text>
              ))}

              <Button
                label={`Open ${setupModal.name} in browser`}
                onPress={() => Linking.openURL(setupModal.setupUrl)}
                variant="ghost"
                style={{ marginVertical: spacing.md }}
              />

              <Input
                label="Paste API Key"
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={`${setupModal.keyPrefix}...`}
                secureTextEntry
              />

              <Button
                label={testing ? 'Testing...' : 'Connect & Test'}
                onPress={() => handleSetupKey(setupModal)}
                loading={testing}
                disabled={!keyInput.trim()}
              />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Model picker modal */}
      <Modal visible={modelModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick a Model</Text>
            <TouchableOpacity onPress={() => setModelModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {MODELS.filter(m => available.includes(m.provider)).map(m => (
              <TouchableOpacity
                key={m.id}
                onPress={() => switchModel(m)}
                style={[styles.modelRow, currentModel === m.id && styles.modelRowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modelRowName}>{m.name}</Text>
                  <Text style={styles.modelRowMeta}>
                    {m.provider} · {m.contextK}K ctx
                  </Text>
                </View>
                <View style={styles.modelRowBadges}>
                  <Badge label={m.free ? 'Free' : 'Paid'} color={m.free ? colors.success : colors.warning} />
                  {'⭐'.repeat(m.quality)}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.bg },
  scroll:           { padding: spacing.md, paddingBottom: spacing.xxl },
  currentCard:      { borderColor: colors.primary, borderWidth: 1.5, marginBottom: spacing.md },
  currentLabel:     { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  currentModel:     { color: colors.primary, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  currentMeta:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardActive:       { borderColor: colors.primary, borderWidth: 1.5 },
  providerRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  providerIcon:     { fontSize: 24, marginTop: 2 },
  providerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  providerName:     { color: colors.text, fontSize: 16, fontWeight: '700' },
  providerDesc:     { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  activeIndicator:  { color: colors.success, fontSize: 12, marginLeft: 4 },
  providerActions:  { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  actionBtn:        { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnText:    { fontSize: 13, fontWeight: '600' },
  modelList:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  modelChip:        { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  modelChipActive:  { backgroundColor: colors.primaryDim + '33', borderColor: colors.primary },
  modelChipText:    { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  modelChipTextActive: { color: colors.primary },
  modal:            { flex: 1, backgroundColor: colors.bg },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:       { color: colors.text, fontSize: 18, fontWeight: '700' },
  modalClose:       { color: colors.textMuted, fontSize: 22, padding: 4 },
  modalScroll:      { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  modalDesc:        { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginVertical: spacing.sm },
  stepsTitle:       { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  step:             { color: colors.textMuted, fontSize: 13, lineHeight: 22, marginLeft: 4 },
  modelRow:         { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modelRowActive:   { borderColor: colors.primary },
  modelRowName:     { color: colors.text, fontSize: 15, fontWeight: '600' },
  modelRowMeta:     { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modelRowBadges:   { alignItems: 'flex-end', gap: 4 },
});
