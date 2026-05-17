// src/components/UI.tsx — Shared UI components

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Animated, Pressable, ViewStyle, TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing, fonts } from '../theme';

// ── Card ───────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ── Button ─────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  const bg = variant === 'primary' ? colors.primary
           : variant === 'danger' ? colors.danger
           : 'transparent';

  const borderColor = variant === 'ghost' ? colors.border : 'transparent';

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || loading}
        style={[
          styles.button,
          { backgroundColor: bg, borderColor, borderWidth: variant === 'ghost' ? 1 : 0 },
          (disabled || loading) && { opacity: 0.5 },
          style,
        ]}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.textMuted }]}>
              {label}
            </Text>
        }
      </Pressable>
    </Animated.View>
  );
}

// ── Input ──────────────────────────────────────────────────

interface InputProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  label?: string;
  style?: ViewStyle;
}

export function Input({ value, onChangeText, placeholder, multiline, secureTextEntry, label, style }: InputProps) {
  return (
    <View style={[styles.inputWrapper, style]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

// ── Badge ──────────────────────────────────────────────────

export function Badge({ label, color = colors.primary }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Section header ─────────────────────────────────────────

export function SectionHeader({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Pulse dot (streaming indicator) ───────────────────────

export function PulseDot() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={styles.pulseRow}>
      {[0, 1, 2].map(i => (
        <Animated.View
          key={i}
          style={[styles.pulseDot, { opacity: anim, transform: [{ scale: anim }] }]}
        />
      ))}
    </View>
  );
}

// ── Empty state ────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle }: {
  icon: string; title: string; subtitle?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Tag pill ───────────────────────────────────────────────

export function TagPill({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <View style={styles.tagPill}>
      <Text style={styles.tagText}>{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.tagRemove}>
          <Text style={styles.tagRemoveText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Divider ────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  if (!label) return <View style={styles.divider} />;
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  inputWrapper: { marginBottom: spacing.md },
  inputLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  pulseRow: { flexDirection: 'row', gap: 4, padding: 8 },
  pulseDot: {
    width: 7, height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  emptyState: { alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 6 },
  emptySubtitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDim + '33',
    borderColor: colors.primaryDim,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  tagText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  tagRemove: { padding: 2 },
  tagRemoveText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerLabel: { color: colors.textDim, fontSize: 12 },
});
