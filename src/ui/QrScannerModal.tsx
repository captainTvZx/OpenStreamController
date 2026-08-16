import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectInfo, parseObsConnectString } from '../obs/connectInfo';
import { PrimaryButton } from './components';
import { fontSize, theme } from './theme';

/**
 * Reads the QR code from OBS → Tools → WebSocket Server Settings →
 * Show Connect Info, which encodes address, port and password in one go.
 */
export function QrScannerModal({
  visible,
  onClose,
  onResult,
}: {
  visible: boolean;
  onClose: () => void;
  onResult: (info: ConnectInfo) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  /** Guards against the camera firing repeatedly for the same code. */
  const handled = useRef(false);

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    setError(null);
  }, [visible]);

  const handleScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const info = parseObsConnectString(data);
    if (!info) {
      setError((current) => current ?? 'That is not an OBS connect code. Use the QR in Show Connect Info.');
      return;
    }
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onResult(info);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        ) : null}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Scan OBS connect code</Text>
          </View>

          {permission?.granted ? (
            <>
              <View style={styles.reticle} />
              <View style={styles.footer}>
                <Text style={styles.instructions}>
                  In OBS: <Text style={styles.strong}>Tools → WebSocket Server Settings → Show Connect Info</Text>,
                  then point the camera at the QR code. Address, port and password all come across at once.
                </Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            </>
          ) : (
            <View style={styles.permission}>
              <Ionicons name="camera-outline" size={36} color={theme.color.textMuted} />
              <Text style={styles.permissionTitle}>Camera access needed</Text>
              <Text style={styles.instructions}>
                The camera is only used to read the connect code from OBS. Nothing is recorded or sent anywhere.
              </Text>
              <PrimaryButton
                label={permission?.canAskAgain === false ? 'Open settings' : 'Allow camera'}
                icon="camera"
                onPress={() => {
                  requestPermission().catch(() => undefined);
                }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    paddingTop: theme.space(14),
    paddingHorizontal: theme.space(4),
    paddingBottom: theme.space(4),
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  reticle: {
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: theme.radius.lg,
    borderWidth: 3,
    borderColor: theme.color.accent,
  },
  footer: {
    padding: theme.space(5),
    gap: theme.space(2),
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  instructions: { color: '#D8DEE9', fontSize: fontSize.sm, lineHeight: 20, textAlign: 'center' },
  strong: { color: '#fff', fontWeight: '700' },
  error: { color: theme.color.warn, fontSize: fontSize.sm, textAlign: 'center', fontWeight: '600' },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(8),
  },
  permissionTitle: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700' },
});
