import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useObsStore } from '../../src/obs/obsStore';
import { buildDeckFromObs, useDeckStore } from '../../src/store/decks';
import { useConnectionStore } from '../../src/store/connections';
import { Card, EmptyState, ListRow, PrimaryButton, SectionTitle } from '../../src/ui/components';
import { ConnectionRow } from '../../src/ui/ConnectionRow';
import { PromptDialog } from '../../src/ui/PromptDialog';
import { useLayout } from '../../src/ui/useLayout';
import { fontSize, theme } from '../../src/ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const layout = useLayout();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const connections = useConnectionStore((state) => state.connections);
  const phase = useObsStore((state) => state.phase);
  const error = useObsStore((state) => state.error);
  const obsVersion = useObsStore((state) => state.obsVersion);
  const decks = useDeckStore((state) => state.decks);

  const rebuildDeck = () => {
    const state = useObsStore.getState();
    if (!state.scenes.length) {
      Alert.alert('Not connected', 'Connect to OBS first so the scenes can be read.');
      return;
    }
    const deck = buildDeckFromObs(state.scenes, state.audioInputs, 'OBS');
    useDeckStore.getState().addDeck(deck);
    Alert.alert('Deck created', `“${deck.name}” now has ${deck.buttons.length} buttons.`);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}>
        <Text style={styles.heading}>Settings</Text>

        <SectionTitle
          action={
            <PrimaryButton
              label="Add"
              icon="add"
              variant="ghost"
              style={{ paddingVertical: theme.space(1.5), paddingHorizontal: theme.space(3) }}
              onPress={() => router.push('/connection/new')}
            />
          }
        >
          Computers
        </SectionTitle>

        {connections.length === 0 ? (
          <EmptyState
            icon="desktop-outline"
            title="No computer yet"
            description="Add the computer running OBS, or let the app scan your Wi-Fi network for it."
            action={
              <PrimaryButton label="Add computer" icon="add" onPress={() => router.push('/connection/new')} />
            }
          />
        ) : (
          <>
            {connections.map((connection) => (
              <ConnectionRow key={connection.id} connection={connection} />
            ))}
            <Text style={styles.hint}>
              Add as many computers as you like — a studio PC and a laptop, for example. Tap one to connect;
              the app talks to one at a time and remembers the last one for next launch.
            </Text>
            <PrimaryButton
              label="Add another computer"
              icon="add"
              variant="ghost"
              style={{ marginTop: theme.space(3) }}
              onPress={() => router.push('/connection/new')}
            />
          </>
        )}

        {phase === 'error' && error ? (
          <Card style={{ borderColor: theme.color.live, marginTop: theme.space(2) }}>
            <Text style={styles.errorTitle}>Connection problem</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </Card>
        ) : null}

        {phase === 'connected' ? (
          <View style={{ gap: theme.space(2), marginTop: theme.space(3) }}>
            <Text style={styles.meta}>obs-websocket {obsVersion}</Text>
            <PrimaryButton
              label="Disconnect"
              icon="power"
              variant="outline"
              color={theme.color.live}
              onPress={() => useObsStore.getState().disconnect()}
            />
          </View>
        ) : null}

        <SectionTitle>Decks</SectionTitle>
        {decks.map((deck) => (
          <ListRow
            key={deck.id}
            title={deck.name}
            subtitle={`${deck.buttons.length} buttons · ${deck.columns} / ${deck.landscapeColumns} columns`}
            icon="grid"
            onPress={() => {
              useDeckStore.getState().setActiveDeck(deck.id);
              router.push('/(tabs)');
            }}
            onLongPress={() => setRenaming({ id: deck.id, name: deck.name })}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
                <Ionicons
                  name="pencil"
                  size={18}
                  color={theme.color.textMuted}
                  onPress={() => setRenaming({ id: deck.id, name: deck.name })}
                />
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={theme.color.textMuted}
                  onPress={() =>
                    Alert.alert('Delete deck', `Delete “${deck.name}”?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => useDeckStore.getState().removeDeck(deck.id),
                      },
                    ])
                  }
                />
              </View>
            }
          />
        ))}

        <View style={{ gap: theme.space(2), marginTop: theme.space(2) }}>
          <PrimaryButton label="New empty deck" icon="add" variant="ghost" onPress={() => useDeckStore.getState().addDeck()} />
          <PrimaryButton label="Generate deck from OBS" icon="sparkles" variant="ghost" onPress={rebuildDeck} />
        </View>

        <SectionTitle>About</SectionTitle>
        <Card>
          <Text style={styles.aboutTitle}>OpenStreamController</Text>
          <Text style={styles.aboutBody}>
            Controls OBS Studio over your Wi-Fi network using obs-websocket 5 (OBS 28 and newer). Enable it in
            OBS under Tools → WebSocket Server Settings, then add this computer here.
          </Text>
          <Text style={[styles.meta, { marginTop: theme.space(3) }]}>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </Card>
      </ScrollView>

      <PromptDialog
        visible={renaming !== null}
        title="Rename deck"
        placeholder="Deck name"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onCancel={() => setRenaming(null)}
        onSubmit={(value) => {
          if (renaming) useDeckStore.getState().renameDeck(renaming.id, value);
          setRenaming(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  content: {
    padding: theme.space(4),
    paddingBottom: theme.space(10),
    width: '100%',
    alignSelf: 'center',
  },
  heading: { color: theme.color.text, fontSize: fontSize.xl, fontWeight: '800', marginBottom: theme.space(2) },
  errorTitle: { color: theme.color.live, fontSize: fontSize.md, fontWeight: '700' },
  errorBody: { color: theme.color.textMuted, fontSize: fontSize.sm, marginTop: theme.space(1), lineHeight: 19 },
  meta: { color: theme.color.textMuted, fontSize: fontSize.xs },
  hint: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: theme.space(2) },
  aboutTitle: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '700' },
  aboutBody: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: theme.space(2) },
});
