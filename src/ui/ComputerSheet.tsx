import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useConnectionStore } from '../store/connections';
import { ConnectionRow } from './ConnectionRow';
import { EmptyState, PrimaryButton } from './components';
import { fontSize, theme } from './theme';

/**
 * Quick switcher for the saved computers, reachable from the status strip on
 * every tab so swapping machines never means a trip through Settings.
 */
export function ComputerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const connections = useConnectionStore((state) => state.connections);

  const addComputer = () => {
    onClose();
    router.push('/connection/new');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Computers</Text>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>

          {connections.length === 0 ? (
            <EmptyState
              icon="desktop-outline"
              title="No computer yet"
              description="Add the computer running OBS — scan its QR code and you are done."
              action={<PrimaryButton label="Add computer" icon="add" onPress={addComputer} />}
            />
          ) : (
            <>
              <Text style={styles.hint}>
                Tap a computer to connect; tapping the connected one disconnects. Only one at a time.
              </Text>
              <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: theme.space(2) }}>
                {connections.map((connection) => (
                  <ConnectionRow key={connection.id} connection={connection} onNavigate={onClose} />
                ))}
              </ScrollView>
              <PrimaryButton label="Add another computer" icon="add" variant="ghost" onPress={addComputer} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    padding: theme.space(4),
    paddingBottom: theme.space(8),
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    marginBottom: theme.space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space(2) },
  title: { flex: 1, color: theme.color.text, fontSize: fontSize.lg, fontWeight: '700' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm, marginBottom: theme.space(3), lineHeight: 19 },
  list: { flexGrow: 0, marginBottom: theme.space(2) },
});
