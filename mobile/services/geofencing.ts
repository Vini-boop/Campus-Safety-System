/**
 * geofencing.ts
 *
 * Location-based risk zone monitoring for Laikipia University campus.
 *
 * Two types of zones:
 *   1. ALWAYS-ON danger zones  — fire whenever the student enters the radius
 *      (e.g. Ndoro Quarry — deep excavation, always dangerous)
 *
 *   2. TIME-GATED security zones — fire only during a defined time window
 *      (e.g. Table Land / Shamenei / Ndoro A Hostels between 18:00–18:30)
 *
 * Notification behaviour:
 *   • Entry alert fires once per zone entry (reset when user leaves)
 *   • Proximity warning fires at WARN_RADIUS_M before the main radius
 *     (Ndoro Quarry only — gives an early heads-up)
 *   • 30-second cooldown prevents spam if GPS jitters on the boundary
 */

import * as Location from 'expo-location';
import { sendLocalNotification } from '@/services/fcmService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Main alert radius in metres */
  radius: number;
  /** Optional outer warning radius (fires a softer alert before the main one) */
  warnRadius?: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  description: string;
  warningMessage: string;
  /** If set, zone is only active between these hours (24h, inclusive) */
  activeHours?: { from: number; to: number };
  soundEnabled: boolean;
}

export interface SecurityStatus {
  level: 'Low' | 'Medium' | 'High';
  movementStatus: 'Safe' | 'Caution' | 'Unsafe';
  nearbyZones: RiskZone[];
  nearestZone: RiskZone | null;
  distanceToNearest: number | null;
}

// ─── Risk Zone Definitions ────────────────────────────────────────────────────

export const RISK_ZONES: RiskZone[] = [
  // ── Always-on: Ndoro Quarry ───────────────────────────────────────────────
  {
    id: 'ndoro-quarry',
    name: 'Ndoro Quarry',
    latitude: 0.014609,
    longitude: 36.275738,
    radius: 300,        // main alert at 300 m
    warnRadius: 500,    // early warning at 500 m
    riskLevel: 'High',
    description: 'Extremely dangerous deep excavation site near Gate A. Unstable terrain and sheer drops.',
    warningMessage: '⚠️ You are approaching Ndoro Quarry — an extremely deep and dangerous excavation site. Keep away from the edges. Turn back now.',
    soundEnabled: true,
  },

  // ── Time-gated (18:00–18:30): Table Land ─────────────────────────────────
  {
    id: 'table-land-evening',
    name: 'Table Land',
    latitude: 0.036116,   // centre of the Table Land bounding box
    longitude: 36.267111,
    radius: 400,
    riskLevel: 'High',
    description: 'Insecure area after dark. Students should be in their rooms or move in groups.',
    warningMessage: '🚨 SAFETY ALERT — Table Land (6:00 PM)\n\nYou are in Table Land during an insecure hour. Please return to your room immediately or walk only in groups with people you know. Stay safe.',
    activeHours: { from: 18, to: 18.5 }, // 18:00–18:30
    soundEnabled: true,
  },

  // ── Time-gated (18:00–18:30): Shamenei ───────────────────────────────────
  {
    id: 'shamenei-evening',
    name: 'Shamenei',
    latitude: 0.043004,   // centre of Shamenei bounding box
    longitude: 36.278835,
    radius: 400,
    riskLevel: 'High',
    description: 'Insecure area after dark. Students should be in their rooms or move in groups.',
    warningMessage: '🚨 SAFETY ALERT — Shamenei (6:00 PM)\n\nYou are in Shamenei during an insecure hour. Please return to your room immediately or walk only in groups with people you know. Stay safe.',
    activeHours: { from: 18, to: 18.5 }, // 18:00–18:30
    soundEnabled: true,
  },

  // ── Time-gated (18:00–18:30): Ndoro A Hostels ────────────────────────────
  {
    id: 'ndoro-a-evening',
    name: 'Ndoro A Hostels',
    latitude: 0.012793,   // centre of Ndoro A bounding box
    longitude: 36.272800,
    radius: 300,
    riskLevel: 'High',
    description: 'Insecure area after dark. Students should be in their rooms or move in groups.',
    warningMessage: '🚨 SAFETY ALERT — Ndoro A Hostels (6:00 PM)\n\nYou are near Ndoro A Hostels during an insecure hour. Please return to your room immediately or walk only in groups with people you know. Stay safe.',
    activeHours: { from: 18, to: 18.5 }, // 18:00–18:30
    soundEnabled: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the current hour as a decimal (e.g. 18:15 → 18.25) */
function currentHourDecimal(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

/** True if the zone has no time restriction OR the current time is within its window */
function isZoneActiveNow(zone: RiskZone): boolean {
  if (!zone.activeHours) return true;
  const h = currentHourDecimal();
  return h >= zone.activeHours.from && h <= zone.activeHours.to;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class GeofencingService {
  private locationSubscription: any = null;
  /** Tracks zones the user is currently inside (main radius) */
  private notifiedZones: Set<string> = new Set();
  /** Tracks zones the user has received the outer warning for */
  private warnedZones: Set<string> = new Set();
  /** Cooldown: last notification time per zone id */
  private lastNotificationTime: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 30_000; // 30 s

  private securityNotifications: any[] = [];
  private onSecurityUpdateCallback: ((notifications: any[]) => void) | null = null;

  // ── Initialize ─────────────────────────────────────────────────────────────
  async initialize(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('⚠️ Location permission not granted — geofencing disabled');
        return false;
      }
      console.log('✅ Geofencing service initialised');
      return true;
    } catch (e) {
      console.error('❌ Geofencing init error:', e);
      return false;
    }
  }

  // ── Start monitoring ───────────────────────────────────────────────────────
  startMonitoring(onSecurityUpdate: (status: SecurityStatus) => void): void {
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 15 },
      async (loc) => {
        const status = this.calculateSecurityStatus(loc.coords);
        onSecurityUpdate(status);
        await this.checkZoneViolations(loc.coords);
      }
    ).then(sub => {
      this.locationSubscription = sub;
    }).catch(e => {
      console.error('❌ Location watch error:', e);
    });
  }

  // ── Security status ────────────────────────────────────────────────────────
  private calculateSecurityStatus(coords: { latitude: number; longitude: number }): SecurityStatus {
    const { latitude, longitude } = coords;
    const nearbyZones: RiskZone[] = [];
    let nearestZone: RiskZone | null = null;
    let minDist = Infinity;

    for (const zone of RISK_ZONES) {
      if (!isZoneActiveNow(zone)) continue;
      const d = this.haversine(latitude, longitude, zone.latitude, zone.longitude);
      const checkRadius = zone.warnRadius ?? zone.radius;
      if (d <= checkRadius) {
        nearbyZones.push(zone);
        if (d < minDist) { minDist = d; nearestZone = zone; }
      }
    }

    let level: SecurityStatus['level'] = 'Low';
    let movementStatus: SecurityStatus['movementStatus'] = 'Safe';

    if (nearestZone) {
      const ratio = minDist / nearestZone.radius;
      if (nearestZone.riskLevel === 'High') {
        if (ratio <= 0.5) { level = 'High'; movementStatus = 'Unsafe'; }
        else { level = 'Medium'; movementStatus = 'Caution'; }
      } else if (nearestZone.riskLevel === 'Medium') {
        level = 'Medium'; movementStatus = 'Caution';
      }
    }

    return { level, movementStatus, nearbyZones, nearestZone, distanceToNearest: minDist === Infinity ? null : minDist };
  }

  // ── Zone violation checks ──────────────────────────────────────────────────
  private async checkZoneViolations(coords: { latitude: number; longitude: number }): Promise<void> {
    const { latitude, longitude } = coords;

    for (const zone of RISK_ZONES) {
      const dist = this.haversine(latitude, longitude, zone.latitude, zone.longitude);
      const insideMain = dist <= zone.radius;
      const insideWarn = zone.warnRadius ? dist <= zone.warnRadius : false;

      const mainKey = zone.id;
      const warnKey = `${zone.id}_warn`;

      // ── Outer warning (warnRadius only, e.g. Ndoro Quarry at 500 m) ────────
      if (insideWarn && !insideMain && !this.warnedZones.has(warnKey)) {
        if (isZoneActiveNow(zone) && this.canNotify(warnKey)) {
          await this.fireNotification(
            `⚠️ Approaching ${zone.name}`,
            `You are ${Math.round(dist)} m from ${zone.name}. ${zone.warningMessage}`,
            zone,
            warnKey,
            'approach'
          );
          this.warnedZones.add(warnKey);
        }
      }

      // Reset outer warning when user moves away
      if (!insideWarn && this.warnedZones.has(warnKey)) {
        this.warnedZones.delete(warnKey);
      }

      // ── Main entry alert ──────────────────────────────────────────────────
      if (insideMain && !this.notifiedZones.has(mainKey)) {
        if (isZoneActiveNow(zone) && this.canNotify(mainKey)) {
          const title = zone.riskLevel === 'High'
            ? `🚨 DANGER: ${zone.name}`
            : `⚠️ Risk Zone: ${zone.name}`;
          await this.fireNotification(title, zone.warningMessage, zone, mainKey, 'entry');
          this.notifiedZones.add(mainKey);
        }
      }

      // Reset main alert when user leaves
      if (!insideMain && this.notifiedZones.has(mainKey)) {
        this.notifiedZones.delete(mainKey);
      }
    }
  }

  // ── Fire a local push notification ────────────────────────────────────────
  private async fireNotification(
    title: string,
    body: string,
    zone: RiskZone,
    key: string,
    eventType: 'approach' | 'entry'
  ): Promise<void> {
    try {
      this.lastNotificationTime.set(key, Date.now());

      // Use fcmService so the correct Android channel + priority is applied
      await sendLocalNotification(title, body, {
        type: zone.riskLevel === 'High' ? 'emergency' : 'security_alert',
        severity: zone.riskLevel === 'High' ? 'critical' : 'high',
        zoneId: zone.id,
        zoneName: zone.name,
        eventType,
      });

      // Also store in in-app notification list
      this.addSecurityNotification({
        id: `${zone.id}-${Date.now()}`,
        zoneName: zone.name,
        riskLevel: zone.riskLevel,
        message: body,
        timestamp: new Date(),
        isRead: false,
        type: eventType,
        coordinates: { latitude: zone.latitude, longitude: zone.longitude },
      });
    } catch (e) {
      console.error('❌ Geofencing notification error:', e);
    }
  }

  // ── Cooldown guard ─────────────────────────────────────────────────────────
  private canNotify(key: string): boolean {
    const last = this.lastNotificationTime.get(key) ?? 0;
    return Date.now() - last > this.COOLDOWN_MS;
  }

  // ── Haversine distance (metres) ────────────────────────────────────────────
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6_371_000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Stop monitoring ────────────────────────────────────────────────────────
  stopMonitoring(): void {
    if (this.locationSubscription?.remove) this.locationSubscription.remove();
    this.locationSubscription = null;
  }

  // ── In-app notification list helpers ──────────────────────────────────────
  private addSecurityNotification(n: any): void {
    this.securityNotifications.unshift(n);
    if (this.securityNotifications.length > 50) this.securityNotifications.length = 50;
    this.onSecurityUpdateCallback?.(this.securityNotifications);
  }

  public setSecurityNotificationsCallback(cb: (n: any[]) => void): void {
    this.onSecurityUpdateCallback = cb;
    cb(this.securityNotifications);
  }

  public getSecurityNotifications(): any[] { return this.securityNotifications; }

  public markNotificationAsRead(id: string): void {
    const n = this.securityNotifications.find(x => x.id === id);
    if (n) { n.isRead = true; this.onSecurityUpdateCallback?.(this.securityNotifications); }
  }

  public clearAllNotifications(): void {
    this.securityNotifications = [];
    this.onSecurityUpdateCallback?.([]);
  }

  public resetNotifiedZones(): void {
    this.notifiedZones.clear();
    this.warnedZones.clear();
    console.log('🔄 Notified zones reset');
  }

  public cleanup(): void { this.stopMonitoring(); }
}

// Singleton
export const geofencingService = new GeofencingService();
