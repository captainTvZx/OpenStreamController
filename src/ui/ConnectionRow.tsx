import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useObsStore } from '../obs/obsStore';
import { connectionUrl, SavedConnection, useConnectionStore } from '../store/connections';
import { Pill } from './components';
import { fontSize, theme, tint } from './theme';

/** Confirms, disconnects if needed, then forgets the computer and its password. */
export function confirmRemoveConnection(connection: SavedConnection, onRemoved?: () => void) {
  Alert.alert(
    'Remove computer',
    `Remove “${connection.name}”? The saved password is deleted from the keychain too.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (useObsStore.getState().activeConnectionId === connection.id) {
            useObsStore.getState().disconnect();
          }
          void useConnectionStore.getState().remove(connection.id);
          onRemoved?.();
        },
      },
    ],
  );
}

/**
 * One saved computer with every action visible: connect by tapping the row,
 * and edit/remove from the buttons rather than a hidden long press.
 */
export function ConnectionRow({
  connection,
  onNavigate,
}: {
  connection: SavedConnection;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const phase = useObsStore((state) => state.phase);
  const activeConnectionId = useObsStore((state) => state.activeConnectionId);

  const isActive = activeConnectionId === connection.id;
  const isConnected = isActive && phase === 'connected';
  const isBusy = isActive && (phase === 'connecting' || phase === 'reconnecting');
  const statusColor = isConnected
    ? theme.color.good
    : isBusy
      ? theme.color.warn
      : isActive && phase === 'error'
        ? theme.color.live
        : theme.color.textMuted;

  const connect = () => {
    useObsStore
      .getState()
      .connectById(connection.id)
      .catch((error: Error) => Alert.alert('Could not connect', error.message));
    onNavigate?.();
  };

  return (
    <View style={[styles.row, isActive && { borderColor: statusColor }]}>
      <Pressable
        style={styles.main}
        onPress={isConnected ? () => useObsStore.getState().disconnect() : connect}
      >
        <View style={[styles.icon, { backgroundColor: tint(statusColor, 0.16) }]}>
          <Ionicons name="desktop" size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {connection.name}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {connectionUrl(connection)}
          </Text>
        </View>
        {isConnected ? <Pill label="Connected" color={theme.color.good} filled /> : null}
        {isBusy ? <Pill label={phase === 'reconnecting' ? 'Retrying' : 'Connecting'} color={theme.color.warn} filled /> : null}
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={isConnected ? () => useObsStore.getState().disconnect() : connect}
          style={styles.actionButton}
          hitSlop={6}
          accessibilityLabel={isConnected ? 'Disconnect' : 'Connect'}
        >
          <Ionicons
            name={isConnected ? 'power' : 'flash'}
            size={18}
            color={isConnected ? theme.color.live : theme.color.accent}
          />
        </Pressable>
        <Pressable
          onPress={() => {
            router.push(`/connection/${connection.id}`);
            onNavigate?.();
          }}
          style={styles.actionButton}
          hitSlop={6}
          accessibilityLabel="Edit computer"
        >
          <Ionicons name="create-outline" size={18} color={theme.color.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => confirmRemoveConnection(connection)}
          style={styles.actionButton}
          hitSlop={6}
          accessibilityLabel="Remove computer"
        >
          <Ionicons name="trash-outline" size={18} color={theme.color.live} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    marginBottom: theme.space(2),
    overflow: 'hidden',
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    padding: theme.space(3),
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '600' },
  address: { color: theme.color.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space(1),
    paddingHorizontal: theme.space(2),
    paddingBottom: theme.space(2),
  },
  actionButton: {
    width: 40,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surfaceRaised,
  },
});
