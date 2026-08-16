import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton } from './components';
import { fontSize, theme } from './theme';

/**
 * Cross-platform text prompt. `Alert.prompt` is iOS-only, and renaming a deck
 * has to work the same on Android tablets.
 */
export function PromptDialog({
  visible,
  title,
  description,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [initialValue, visible]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Swallow taps inside the card so they do not dismiss the dialog. */}
          <Pressable style={styles.card} onPress={() => undefined}>
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}

            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            <View style={styles.actions}>
              <PrimaryButton label="Cancel" variant="ghost" color={theme.color.textMuted} onPress={onCancel} />
              <PrimaryButton label={confirmLabel} onPress={submit} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(6),
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(5),
  },
  title: { color: theme.color.text, fontSize: fontSize.lg, fontWeight: '700' },
  description: {
    color: theme.color.textMuted,
    fontSize: fontSize.sm,
    marginTop: theme.space(1),
    lineHeight: 19,
  },
  input: {
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    color: theme.color.text,
    fontSize: fontSize.md,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
    marginTop: theme.space(4),
  },
  actions: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4) },
});
