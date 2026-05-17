// src/screens/ChatScreen.tsx — Main chat interface

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, StyleSheet, Image,
  ScrollView, Pressable, Keyboard, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Markdown from 'react-native-markdown-display';

import { colors, radius, spacing } from '../theme';
import { PulseDot, Badge } from '../components/UI';
import {
  useChatStore, useProjectStore, useCorrectionsStore,
  useTokenStore,
} from '../store';
import { groqChat, buildSystemPrompt } from '../services/api';

const DRAWER_W = Dimensions.get('window').width * 0.78;
const ANDROID_TAB_BAR_HEIGHT = 60;

// ── Message bubble ─────────────────────────────────────────

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>⚡</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, { maxWidth: '82%' }]}>
        {message.imageUri && (
          <Image source={{ uri: message.imageUri }} style={styles.messageImage} />
        )}
        {isUser
          ? <Text style={styles.bubbleTextUser}>{message.content}</Text>
          : <Markdown style={markdownStyles}>{message.content}</Markdown>
        }
        <Text style={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

// ── Quick action chips ─────────────────────────────────────

const QUICK_ACTIONS = [
  { label: '🐛 Fix bug',      prompt: 'Find and fix the bug in: ' },
  { label: '✍️ Write tests',  prompt: 'Write unit tests for: ' },
  { label: '📖 Explain',      prompt: 'Explain this code: ' },
  { label: '⚡ Optimize',     prompt: 'Optimize this code: ' },
  { label: '📝 Docstring',    prompt: 'Add docstrings to: ' },
  { label: '🔒 Security',     prompt: 'Review for security issues: ' },
];

// ── Main Chat Screen ───────────────────────────────────────

export default function ChatScreen() {
  const navigation = useNavigation();

  const [input, setInput]           = useState('');
  const [imageUri, setImageUri]     = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [kbOffset, setKbOffset]     = useState(0);
  const listRef = useRef<any>(null);

  // Drawer animation
  const drawerX      = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpac = useRef(new Animated.Value(0)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerX,      { toValue: 0,   duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpac, { toValue: 0.55, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [drawerX, backdropOpac]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerX,      { toValue: -DRAWER_W, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpac, { toValue: 0,          duration: 220, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  }, [drawerX, backdropOpac]);

  // Set hamburger button in header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={openDrawer} style={styles.hamburger}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, openDrawer]);

  // Android keyboard offset
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKbOffset(Math.max(0, e.endCoordinates.height - ANDROID_TAB_BAR_HEIGHT));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const {
    messages, isStreaming, addMessage, appendToLast, setStreaming,
    currentProjectId, sessions, currentSessionId,
    loadSessions, newSession, switchSession, deleteSession, persistSession,
  } = useChatStore();
  const { projects }               = useProjectStore();
  const { corrections, toPromptContext } = useCorrectionsStore();
  const { addUsage }               = useTokenStore();

  const currentProject = projects.find(p => p.id === currentProjectId);

  // Load sessions on mount
  useEffect(() => { loadSessions(); }, []);

  // Persist session whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      persistSession(currentSessionId, messages);
    }
  }, [messages]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 100);
    }
  }, [messages.length]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
    }
  };

  const removeImage = () => { setImageUri(null); setImageBase64(null); };

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput || input).trim();
    if (!text && !imageUri) return;
    if (isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');

    addMessage({ role: 'user', content: text, imageUri: imageUri || undefined });
    const hadImage = !!imageUri;
    removeImage();
    setStreaming(true);

    const correctionCtx = toPromptContext();
    const projectCtx = currentProject
      ? `Project: ${currentProject.name}\nSkills: ${currentProject.skills.join(', ')}\nNotes: ${currentProject.notes}`
      : '';
    const systemPrompt = buildSystemPrompt(
      [correctionCtx, projectCtx].filter(Boolean).join('\n\n'),
      currentProject?.skills
    );

    const apiMessages: any[] = [{ role: 'system', content: systemPrompt }];
    for (const msg of messages.slice(-10)) {
      apiMessages.push({ role: msg.role, content: msg.content });
    }

    if (hadImage && imageBase64) {
      apiMessages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: text || 'What is in this image?' },
        ],
      });
    } else {
      apiMessages.push({ role: 'user', content: text });
    }

    addMessage({ role: 'assistant', content: '' });

    try {
      let fullResponse = '';
      await groqChat(apiMessages, text, hadImage, (chunk) => {
        fullResponse += chunk;
        appendToLast(chunk);
      });
      const tokens = Math.ceil((text.length + fullResponse.length) / 4);
      addUsage(tokens);
    } catch (err: any) {
      appendToLast(`\n\n❌ Error: ${err.message}`);
    } finally {
      setStreaming(false);
    }
  }, [input, imageUri, imageBase64, isStreaming, messages, currentProject]);

  const handleNewChat = () => {
    newSession();
    closeDrawer();
  };

  const handleSwitchSession = (id: string) => {
    switchSession(id);
    closeDrawer();
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
  };

  const isEmpty = messages.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {currentProject && (
          <View style={styles.projectBar}>
            <Text style={styles.projectBarText}>📁 {currentProject.name}</Text>
            {currentProject.skills.slice(0, 3).map(s => (
              <Badge key={s} label={s} color={colors.primary} />
            ))}
          </View>
        )}

        <KeyboardAvoidingView
          style={[{ flex: 1 }, Platform.OS === 'android' && { paddingBottom: kbOffset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {isEmpty ? (
            <ScrollView contentContainerStyle={styles.emptyContainer} keyboardShouldPersistTaps="handled">
              <Text style={styles.emptyGlyph}>⚡</Text>
              <Text style={styles.emptyTitle}>myai</Text>
              <Text style={styles.emptySubtitle}>Your AI coding assistant</Text>
              <View style={styles.quickGrid}>
                {QUICK_ACTIONS.map(action => (
                  <Pressable key={action.label} style={styles.quickChip} onPress={() => setInput(action.prompt)}>
                    <Text style={styles.quickChipText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              renderItem={({ item }) => <MessageBubble message={item} />}
              contentContainerStyle={styles.messageList}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {isStreaming && (
            <View style={styles.streamingBar}>
              <PulseDot />
              <Text style={styles.streamingText}>myai is thinking...</Text>
            </View>
          )}

          {imageUri && (
            <View style={styles.imagePreview}>
              <Image source={{ uri: imageUri }} style={styles.previewThumb} />
              <Text style={styles.previewLabel}>Image attached</Text>
              <TouchableOpacity onPress={removeImage} style={styles.removeImage}>
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputBar}>
            <TouchableOpacity onPress={pickImage} style={styles.iconBtn}>
              <Text style={styles.iconBtnText}>🖼️</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything..."
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={4000}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={isStreaming || (!input.trim() && !imageUri)}
              style={[styles.sendBtn, (isStreaming || (!input.trim() && !imageUri)) && styles.sendBtnDisabled]}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Side Drawer ─────────────────────────────────── */}
      {drawerOpen && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, { opacity: backdropOpac }]}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeDrawer} activeOpacity={1} />
          </Animated.View>

          {/* Drawer panel */}
          <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerX }] }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              {/* Header */}
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerLogo}>⚡ myai</Text>
                <TouchableOpacity onPress={closeDrawer} style={styles.drawerClose}>
                  <Text style={styles.drawerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* New chat */}
              <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat}>
                <Text style={styles.newChatIcon}>✏️</Text>
                <Text style={styles.newChatText}>New chat</Text>
              </TouchableOpacity>

              {/* Recents */}
              {sessions.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Recents</Text>
                  <FlatList
                    data={sessions}
                    keyExtractor={s => s.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.sessionRow, item.id === currentSessionId && styles.sessionRowActive]}
                        onPress={() => handleSwitchSession(item.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.sessionTitle, item.id === currentSessionId && styles.sessionTitleActive]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <TouchableOpacity onPress={() => handleDeleteSession(item.id)} style={styles.sessionDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.sessionDeleteText}>⋯</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )}
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                  />
                </>
              )}

              {sessions.length === 0 && (
                <Text style={styles.noSessions}>No recent chats yet</Text>
              )}
            </SafeAreaView>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ── Markdown styles ────────────────────────────────────────

const markdownStyles = {
  body:         { color: colors.text, fontSize: 14, lineHeight: 22 },
  code_inline:  { backgroundColor: colors.codeBlock, color: colors.accent, fontFamily: 'monospace', fontSize: 13, paddingHorizontal: 4, borderRadius: 4 },
  fence:        { backgroundColor: colors.codeBlock, borderRadius: radius.sm, padding: 12, marginVertical: 8 },
  code_block:   { color: colors.accent, fontFamily: 'monospace', fontSize: 12 },
  strong:       { color: colors.text, fontWeight: '700' as any },
  heading1:     { color: colors.primary, fontSize: 18, fontWeight: '700' as any, marginVertical: 8 },
  heading2:     { color: colors.primary, fontSize: 16, fontWeight: '600' as any, marginVertical: 6 },
  heading3:     { color: colors.text, fontSize: 14, fontWeight: '600' as any, marginVertical: 4 },
  bullet_list:  { marginLeft: 8 },
  list_item:    { marginVertical: 2 },
  hr:           { backgroundColor: colors.border, height: 1, marginVertical: 12 },
  link:         { color: colors.accent },
  blockquote:   { backgroundColor: colors.bgElevated, borderLeftColor: colors.primary, borderLeftWidth: 3, paddingLeft: 12, marginVertical: 8 },
};

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.bg },
  projectBar:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap' },
  projectBarText:     { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginRight: 4 },
  messageList:        { padding: spacing.md, paddingBottom: spacing.lg },
  bubbleRow:          { flexDirection: 'row', marginBottom: 12, gap: 8 },
  bubbleRowUser:      { flexDirection: 'row-reverse' },
  avatar:             { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText:         { fontSize: 14 },
  bubble:             { borderRadius: radius.lg, padding: 12 },
  bubbleUser:         { backgroundColor: colors.userBubble, borderBottomRightRadius: 4 },
  bubbleAI:           { backgroundColor: colors.aiBubble, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleTextUser:     { color: '#fff', fontSize: 14, lineHeight: 22 },
  timestamp:          { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  messageImage:       { width: '100%', height: 160, borderRadius: radius.sm, marginBottom: 8, resizeMode: 'cover' },
  streamingBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 6, gap: 8 },
  streamingText:      { color: colors.textMuted, fontSize: 12 },
  imagePreview:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 8, gap: 10 },
  previewThumb:       { width: 40, height: 40, borderRadius: radius.sm },
  previewLabel:       { color: colors.textMuted, fontSize: 12, flex: 1 },
  removeImage:        { padding: 6 },
  removeImageText:    { color: colors.textMuted, fontSize: 16 },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgCard },
  iconBtn:            { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgInput, alignItems: 'center', justifyContent: 'center' },
  iconBtnText:        { fontSize: 18 },
  textInput:          { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 15, maxHeight: 120 },
  sendBtn:            { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:    { backgroundColor: colors.primaryDim, opacity: 0.5 },
  sendBtnText:        { color: '#fff', fontSize: 20, fontWeight: '700' },
  emptyContainer:     { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.lg },
  emptyGlyph:         { fontSize: 48, marginBottom: 12 },
  emptyTitle:         { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  emptySubtitle:      { color: colors.textMuted, fontSize: 15, marginBottom: 40 },
  quickGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  quickChip:          { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 10 },
  quickChipText:      { color: colors.text, fontSize: 13, fontWeight: '500' },
  // Hamburger
  hamburger:          { paddingHorizontal: 16, paddingVertical: 10, gap: 5, justifyContent: 'center' },
  hamburgerLine:      { width: 22, height: 2, backgroundColor: colors.text, borderRadius: 2 },
  // Drawer
  backdrop:           { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  drawer:             { position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_W, backgroundColor: colors.bgCard, borderRightWidth: 1, borderRightColor: colors.border },
  drawerHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerLogo:         { color: colors.text, fontSize: 18, fontWeight: '800' },
  drawerClose:        { padding: 4 },
  drawerCloseText:    { color: colors.textMuted, fontSize: 18 },
  newChatBtn:         { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  newChatIcon:        { fontSize: 18 },
  newChatText:        { color: colors.text, fontSize: 15, fontWeight: '600' },
  sectionHeader:      { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, textTransform: 'uppercase' },
  sessionRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 8 },
  sessionRowActive:   { backgroundColor: colors.bgElevated },
  sessionTitle:       { flex: 1, color: colors.textMuted, fontSize: 14 },
  sessionTitleActive: { color: colors.text, fontWeight: '500' },
  sessionDelete:      { paddingHorizontal: 4 },
  sessionDeleteText:  { color: colors.textDim, fontSize: 18, letterSpacing: 1 },
  noSessions:         { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 32 },
});
