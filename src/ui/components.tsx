import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { fontSize, theme, tint } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Pill({
  label,
  color = theme.color.textMuted,
  filled = false,
  icon,
}: {
  label: string;
  color?: string;
  filled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View
      style={[
        styles.pill,
        { borderColor: filled ? color : theme.color.border, backgroundColor: filled ? tint(color, 0.18) : 'transparent' },
      ]}
    >
      {icon ? <Ionicons name={icon} size={12} color={color} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  color = theme.color.accent,
  disabled = false,
  loading = false,
  variant = 'solid',
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'outline' | 'ghost';
  style?: StyleProp<ViewStyle>;
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: solid ? color : variant === 'outline' ? 'transparent' : tint(color, 0.14),
          borderColor: variant === 'outline' ? color : 'transparent',
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={solid ? '#fff' : color} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={solid ? '#fff' : color} /> : null}
          <Text style={[styles.primaryButtonText, { color: solid ? '#fff' : color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.color.textMuted}
        {...inputProps}
        style={[styles.input, inputProps.style]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Password input with a reveal toggle and a paste button — typing an
 * obs-websocket password on a tablet keyboard is otherwise miserable.
 */
export function PasswordField({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  onPaste,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onPaste?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textMuted}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          style={[styles.input, onPaste ? styles.passwordInputWide : styles.passwordInput]}
        />
        <View style={styles.passwordActions}>
          {onPaste ? (
            <Pressable onPress={onPaste} style={styles.passwordButton} hitSlop={6}>
              <Ionicons name="clipboard-outline" size={18} color={theme.color.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            style={styles.passwordButton}
            hitSlop={6}
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off' : 'eye'}
              size={18}
              color={revealed ? theme.color.accent : theme.color.textMuted}
            />
          </Pressable>
        </View>
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: theme.space(3) }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.color.border, true: tint(theme.color.accent, 0.6) }}
        thumbColor={value ? theme.color.accent : '#6B7280'}
      />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconColor = theme.color.textMuted,
  right,
  onPress,
  onLongPress,
  selected = false,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.listRow,
        selected && { borderColor: theme.color.accent, backgroundColor: tint(theme.color.accent, 0.1) },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: tint(iconColor, 0.16) }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowDescription} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={theme.color.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <View style={{ marginTop: theme.space(4) }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(4),
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space(2),
    marginTop: theme.space(5),
  },
  sectionTitle: {
    color: theme.color.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(1),
  },
  pillText: { fontSize: fontSize.xs, fontWeight: '700' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
  },
  primaryButtonText: { fontSize: fontSize.md, fontWeight: '700' },
  field: { marginBottom: theme.space(4) },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: theme.space(2),
  },
  fieldHint: { color: theme.color.textMuted, fontSize: fontSize.xs, marginTop: theme.space(2) },
  input: {
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    color: theme.color.text,
    fontSize: fontSize.md,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  // Reserve room so long passwords never run under the overlaid buttons.
  passwordInput: { paddingRight: 48 },
  passwordInputWide: { paddingRight: 88 },
  passwordActions: {
    position: 'absolute',
    right: theme.space(1),
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space(3),
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(3),
    marginBottom: theme.space(2),
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '600' },
  rowDescription: { color: theme.color.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: theme.space(12), paddingHorizontal: theme.space(6) },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
    marginBottom: theme.space(4),
  },
  emptyTitle: { color: theme.color.text, fontSize: fontSize.lg, fontWeight: '700' },
  emptyDescription: {
    color: theme.color.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: theme.space(2),
    lineHeight: 20,
  },
});
