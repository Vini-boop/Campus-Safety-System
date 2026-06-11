import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Linking,
  Vibration,
  Animated,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function QRScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const scanLineAnim = React.useRef(new Animated.Value(0)).current;

  // Animate the scanning line
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanLineAnim]);

  const handleBarCodeScanned = useCallback(
    ({ type, data }: BarcodeScanningResult) => {
      if (scanned) return;
      setScanned(true);
      setLastScan(data);
      Vibration.vibrate(120);

      const isURL =
        data.startsWith('http://') || data.startsWith('https://');

      Alert.alert(
        '✅ QR Code Detected',
        `Type: ${type}\n\nData:\n${data}`,
        [
          {
            text: 'Scan Again',
            style: 'cancel',
            onPress: () => setScanned(false),
          },
          isURL
            ? {
              text: 'Open Link',
              onPress: () => Linking.openURL(data),
            }
            : {
              text: 'Copy',
              onPress: () => {
                // Could wire up Clipboard here
                setScanned(false);
              },
            },
        ]
      );
    },
    [scanned]
  );

  // ─── Permission: loading ───────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Checking camera permission…</Text>
      </View>
    );
  }

  // ─── Permission: denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <LinearGradient
          colors={['#0C156D', '#1a237e']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="camera-off-outline" size={72} color="#fff" style={{ opacity: 0.7 }} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSubtitle}>
          Campus Safety needs camera access to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Scanner ───────────────────────────────────────────────────────────────
  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'pdf417', 'aztec', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code128', 'itf14', 'datamatrix'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Dark overlay with transparent cutout via borders */}
      <View style={styles.overlay}>
        {/* Top dark strip */}
        <View style={styles.overlayTop} />

        {/* Middle row */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />

          {/* Scan frame */}
          <View style={styles.scanFrame}>
            {/* Corner accents */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Animated scan line */}
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineTranslate }] },
              ]}
            />
          </View>

          <View style={styles.overlaySide} />
        </View>

        {/* Bottom dark strip */}
        <View style={styles.overlayBottom}>
          <Text style={styles.hintText}>
            {scanned ? 'Processing…' : 'Point the camera at a QR code'}
          </Text>

          {lastScan ? (
            <View style={styles.lastScanBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
              <Text style={styles.lastScanText} numberOfLines={1}>
                {lastScan.length > 40 ? lastScan.slice(0, 40) + '…' : lastScan}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>QR Scanner</Text>
        <TouchableOpacity
          style={[styles.iconBtn, torchOn && styles.iconBtnActive]}
          onPress={() => setTorchOn(!torchOn)}
        >
          <Ionicons name={torchOn ? 'flashlight' : 'flashlight-outline'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Scan-again button when scanned */}
      {scanned && (
        <TouchableOpacity
          style={styles.scanAgainButton}
          onPress={() => setScanned(false)}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const FRAME_SIZE = 260;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C156D',
    paddingHorizontal: 32,
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
  },

  // ─── Permission screen ─────────────────────────────────────
  permTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 24,
    textAlign: 'center',
  },
  permSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  permButton: {
    marginTop: 32,
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  permButtonText: {
    color: '#0C156D',
    fontWeight: '700',
    fontSize: 16,
  },
  backButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },

  // ─── Header ────────────────────────────────────────────────
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(255,220,50,0.35)',
  },

  // ─── Overlay ───────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 32,
  },

  // ─── Scan frame ────────────────────────────────────────────
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#fff',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#4fc3f7',
    shadowColor: '#4fc3f7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },

  // ─── Hints & status ────────────────────────────────────────
  hintText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    textAlign: 'center',
  },
  lastScanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    maxWidth: '90%',
  },
  lastScanText: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },

  // ─── Scan again ────────────────────────────────────────────
  scanAgainButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C156D',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  scanAgainText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
