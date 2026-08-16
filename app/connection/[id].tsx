import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConnectInfo, parseObsConnectString } from '../../src/obs/connectInfo';
import { DiscoveredHost, getSubnetPrefix, scanLocalNetwork } from '../../src/obs/discovery';
import { useObsStore } from '../../src/obs/obsStore';
import { OBS_DEFAULT_PORT } from '../../src/obs/protocol';
import { ConnectionDraft, newConnectionDraft, useConnectionStore } from '../../src/store/connections';
import {
  Card,
  Field,
  ListRow,
  PasswordField,
  Pill,
  PrimaryButton,
  SectionTitle,
  ToggleRow,
} from '../../src/ui/components';
import { QrScannerModal } from '../../src/ui/QrScannerModal';
import { fontSize, theme, tint } from '../../src/ui/theme';

export default function ConnectionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const existing = useConnectionStore((state) => (isNew ? undefined : state.byId(id)));
  const [draft, setDraft] = useState<ConnectionDraft>(newConnectionDraft());
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [found, setFound] = useState<DiscoveredHost[]>([]);
  const [subnet, setSubnet] = useState<string>();
  const [qrOpen, setQrOpen] = useState(false);
  const stopScan = useRef(false);

  useEffect(() => {
    getSubnetPrefix().then(setSubnet).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!existing) return;
    let cancelled = false;
    useConnectionStore
      .getState()
      .getPassword(existing.id)
      .then((password) => {
        if (cancelled) return;
        setDraft({
          name: existing.name,
          host: existing.host,
          port: existing.port,
          useTls: existing.useTls,
          autoReconnect: existing.autoReconnect,
          password: password ?? '',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [existing]);

  // Stop an in-flight scan if the user leaves the screen.
  useEffect(() => () => {
    stopScan.current = true;
  }, []);

  const patch = (values: Partial<ConnectionDraft>) => setDraft((current) => ({ ...current, ...values }));

  /** A scanned connect code fills in everything, including the password. */
  const applyConnectInfo = (info: ConnectInfo) => {
    setQrOpen(false);
    setDraft((current) => ({
      ...current,
      host: info.host,
      port: info.port,
      password: info.password ?? '',
      name: current.name || `OBS ${info.host.split('.').pop()}`,
    }));
  };

  const pastePassword = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        Alert.alert('Clipboard empty', 'Copy the password from OBS first.');
        return;
      }
      // A full connect string on the clipboard is just as good as a scan.
      const info = parseObsConnectString(text);
      if (info?.password) {
        applyConnectInfo(info);
        return;
      }
      patch({ password: text });
    } catch {
      Alert.alert('Clipboard unavailable', 'Could not read the clipboard on this device.');
    }
  };

  const startScan = useCallback(async () => {
    stopScan.current = false;
    setScanning(true);
    setFound([]);
    setScanned(0);
    try {
      await scanLocalNetwork({
        port: draft.port || OBS_DEFAULT_PORT,
        onProgress: (progress) => {
          setScanned(progress.scanned);
          setFound(progress.found);
        },
        shouldStop: () => stopScan.current,
      });
    } catch (error) {
      Alert.alert('Scan failed', error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }, [draft.port]);

  const save = async (thenConnect: boolean) => {
    if (!draft.host.trim()) {
      Alert.alert('Missing address', 'Enter the IP address of the computer running OBS.');
      return;
    }
    setSaving(true);
    try {
      const store = useConnectionStore.getState();
      let connection;
      if (existing) {
        await store.update(existing.id, draft);
        connection = store.byId(existing.id)!;
      } else {
        connection = await store.add(draft);
      }

      if (thenConnect) {
        await useObsStore.getState().connect(connection, draft.password || undefined);
      }
      router.back();
    } catch (error) {
      Alert.alert('Could not connect', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <Stack.Screen options={{ title: isNew ? 'Add computer' : 'Edit computer' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <View style={[styles.qrIcon, { backgroundColor: tint(theme.color.accent, 0.16) }]}>
              <Ionicons name="qr-code" size={22} color={theme.color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.qrTitle}>Scan the code from OBS</Text>
              <Text style={styles.qrBody}>
                Tools → WebSocket Server Settings → Show Connect Info. The QR carries the address, port
                and password, so there is nothing to type.
              </Text>
            </View>
          </View>
          <PrimaryButton label="Scan QR code" icon="qr-code-outline" onPress={() => setQrOpen(true)} />
        </Card>

        <Card style={{ marginTop: theme.space(4) }}>
          <Field
            label="Name"
            placeholder="Studio PC"
            value={draft.name}
            onChangeText={(value) => patch({ name: value })}
            autoCapitalize="words"
          />
          <Field
            label="IP address"
            placeholder={subnet ? `${subnet}25` : '192.168.1.25'}
            value={draft.host}
            onChangeText={(value) => patch({ host: value.trim() })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            hint="The local address of the computer running OBS. Both devices must be on the same Wi-Fi."
          />
          <Field
            label="Port"
            placeholder={String(OBS_DEFAULT_PORT)}
            value={String(draft.port)}
            onChangeText={(value) => patch({ port: Number(value.replace(/\D/g, '')) || 0 })}
            keyboardType="number-pad"
          />
          <PasswordField
            label="Password"
            placeholder="Leave empty if OBS has authentication off"
            value={draft.password ?? ''}
            onChangeText={(value) => patch({ password: value })}
            onPaste={pastePassword}
            hint="Tap the eye to check what you typed, or the clipboard icon to paste. Stored in the device keychain, never in plain app storage."
          />
          <ToggleRow
            label="Reconnect automatically"
            description="Keeps retrying with backoff when the Wi-Fi drops or OBS restarts."
            value={draft.autoReconnect}
            onValueChange={(value) => patch({ autoReconnect: value })}
          />
          <ToggleRow
            label="Use TLS (wss://)"
            description="Only needed if obs-websocket sits behind a TLS proxy."
            value={draft.useTls}
            onValueChange={(value) => patch({ useTls: value })}
          />
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            label={isNew ? 'Save & connect' : 'Save & connect'}
            icon="flash"
            loading={saving}
            onPress={() => save(true)}
            style={{ flex: 1 }}
          />
          <PrimaryButton label="Save" variant="outline" onPress={() => save(false)} disabled={saving} />
        </View>

        <SectionTitle
          action={
            scanning ? (
              <Pressable onPress={() => (stopScan.current = true)}>
                <Text style={styles.stopText}>Stop</Text>
              </Pressable>
            ) : (
              <PrimaryButton
                label="Scan Wi-Fi"
                icon="wifi"
                variant="ghost"
                style={{ paddingVertical: theme.space(1.5), paddingHorizontal: theme.space(3) }}
                onPress={startScan}
              />
            )
          }
        >
          Find OBS automatically
        </SectionTitle>

        {scanning ? (
          <View style={styles.scanRow}>
            <ActivityIndicator color={theme.color.accent} />
            <Text style={styles.scanText}>
              Scanning {subnet ? `${subnet}0/24` : 'the local network'} · {scanned}/254 checked
            </Text>
          </View>
        ) : null}

        {found.map((host) => (
          <ListRow
            key={`${host.host}:${host.port}`}
            title={host.host}
            subtitle={
              host.requiresPassword
                ? 'Fills the address — password still needed, scan the QR for it'
                : `obs-websocket ${host.obsWebSocketVersion} · no password needed`
            }
            icon="desktop"
            iconColor={theme.color.good}
            onPress={() =>
              patch({
                host: host.host,
                port: host.port,
                name: draft.name || `OBS ${host.host.split('.').pop()}`,
              })
            }
            right={
              host.requiresPassword ? (
                <Pill label="password" icon="lock-closed" color={theme.color.warn} />
              ) : (
                <Pill label="open" color={theme.color.good} />
              )
            }
          />
        ))}

        {!scanning && found.length === 0 ? (
          <View style={[styles.tipCard, { backgroundColor: tint(theme.color.accent, 0.08) }]}>
            <Ionicons name="information-circle" size={18} color={theme.color.accent} />
            <Text style={styles.tipText}>
              A network scan can find the computer, but it can never read the password — OBS only proves a
              password is required. Use the QR code for that, or turn off{' '}
              <Text style={styles.tipStrong}>Enable Authentication</Text> in OBS if the network is yours alone.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <QrScannerModal visible={qrOpen} onClose={() => setQrOpen(false)} onResult={applyConnectInfo} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  content: {
    padding: theme.space(4),
    paddingBottom: theme.space(12),
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  actions: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(4) },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(3), paddingVertical: theme.space(3) },
  scanText: { color: theme.color.textMuted, fontSize: fontSize.sm },
  stopText: { color: theme.color.live, fontSize: fontSize.sm, fontWeight: '700' },
  tipCard: {
    flexDirection: 'row',
    gap: theme.space(3),
    borderRadius: theme.radius.md,
    padding: theme.space(3.5),
  },
  tipText: { flex: 1, color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  tipStrong: { color: theme.color.text, fontWeight: '700' },
  qrCard: { gap: theme.space(4), borderColor: tint(theme.color.accent, 0.4) },
  qrHeader: { flexDirection: 'row', gap: theme.space(3) },
  qrIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTitle: { color: theme.color.text, fontSize: fontSize.md, fontWeight: '700' },
  qrBody: { color: theme.color.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: theme.space(1) },
});
