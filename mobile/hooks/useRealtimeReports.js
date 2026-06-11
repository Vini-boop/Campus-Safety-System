/**
 * Real-Time Reports Hook - Optimized Firebase Integration
 * 
 * Features:
 * - Incremental updates with docChanges()
 * - Multi-collection merging
 * - Connection status detection
 * - Auto-retry on failure
 * - Memoization to prevent re-renders
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  where,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../services/firebase';

const COLLECTIONS = ['security_alerts', 'emergencies', 'security_reports'];

// Normalize report data structure
const normalizeReport = (data, id, collectionName) => ({
  id,
  _collection: collectionName,
  type: data.type || data.category || data.subCategory || 'security',
  description: data.description || data.message || '',
  location: typeof data.location === 'object' 
    ? (data.location?.address || data.location?.name || 'Unknown')
    : (data.location || 'Unknown'),
  locationCoords: data.locationCoords || data.location?.coords || null,
  reporterName: data.reporterName || data.reportedBy || data.studentName || 'Anonymous',
  reporterEmail: data.reporterEmail || data.studentEmail || '',
  priority: data.priority || data.urgency || 'medium',
  status: data.status || 'pending',
  createdAt: data.createdAt || data.timestamp || new Date().toISOString(),
  isHighRisk: data.isHighRisk || false,
  notes: data.notes || '',
  mediaUrls: data.mediaUrls || data.images || data.evidenceUrls || [],
  assignedTo: data.assignedTo || null,
  obNumber: data.obNumber || null,
  ...data
});

export const useRealtimeReports = (options = {}) => {
  const { 
    maxReports = 100, 
    enableNotifications = true,
    filters = {},
    autoRefreshInterval = 30000 // 30 seconds
  } = options;
  
  // State
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  
  // Refs for cleanup
  const collectionsDataRef = useRef({});
  const unsubscribersRef = useRef([]);
  const isInitialLoadRef = useRef(true);
  const retryTimeoutRef = useRef(null);
  
  /**
   * Trigger browser notification
   */
  const triggerNotification = useCallback((report) => {
    if (!enableNotifications) return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      const typeStr = (report.type || '').toLowerCase();
      const isCritical = typeStr.includes('sos') || 
                         typeStr.includes('emergency') || 
                         report.priority === 'critical';
      
      try {
        new Notification(isCritical ? '🚨 CRITICAL ALERT' : 'New Incident Report', {
          body: `${report.reporterName} reported at ${report.location}`,
          icon: '/alert-icon.png',
          badge: '/badge.png',
          requireInteraction: isCritical,
          tag: `report-${report.id}`, // Prevent duplicates
          silent: false
        });
        
        // Play sound for critical alerts
        if (isCritical) {
          const audio = new Audio('/sounds/alert.mp3');
          audio.play().catch(err => console.warn('⚠️ Alert sound failed:', err));
        }
      } catch (err) {
        console.warn('⚠️ Notification failed:', err);
      }
    }
  }, [enableNotifications]);
  
  /**
   * Merge reports from all collections
   */
  const mergeReports = useCallback(() => {
    const allReports = Object.values(collectionsDataRef.current).flat();
    
    // Sort by createdAt DESC
    allReports.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Limit results
    return allReports.slice(0, maxReports);
  }, [maxReports]);
  
  /**
   * Handle snapshot changes efficiently
   */
  const handleSnapshotChange = useCallback((collectionName, snapshot) => {
    console.log(`[Realtime] ${collectionName}: ${snapshot.docChanges().length} changes`);
    
    // Process incremental changes
    snapshot.docChanges().forEach((change) => {
      const report = normalizeReport(
        { ...change.doc.data(), id: change.doc.id },
        change.doc.id,
        collectionName
      );
      
      switch (change.type) {
        case 'added':
          console.log(`[Realtime] NEW ${report.type.toUpperCase()} report from ${report.reporterName}`);
          
          // Only notify on additions after initial load
          if (!isInitialLoadRef.current) {
            triggerNotification(report);
          }
          break;
          
        case 'modified':
          console.log(`[Realtime] Report updated: ${report.id} (${report.status})`);
          break;
          
        case 'removed':
          console.log(`[Realtime] Report removed: ${report.id}`);
          break;
      }
    });
    
    // Rebuild collection data
    collectionsDataRef.current[collectionName] = snapshot.docs.map(doc =>
      normalizeReport({ ...doc.data(), id: doc.id }, doc.id, collectionName)
    );
    
    // Merge and update state
    const merged = mergeReports();
    setReports(merged);
    setLoading(false);
    setConnectionStatus('connected');
    setLastUpdated(new Date());
    
  }, [mergeReports, triggerNotification]);
  
  /**
   * Setup real-time listeners
   */
  useEffect(() => {
    console.log('[Realtime] Setting up multi-collection listeners...');
    setConnectionStatus('reconnecting');
    
    // Clear existing listeners
    unsubscribersRef.current.forEach(unsub => {
      console.log('[Realtime] Cleaning up listener');
      unsub();
    });
    unsubscribersRef.current = [];
    
    // Setup new listeners for each collection
    COLLECTIONS.forEach((collectionName) => {
      collectionsDataRef.current[collectionName] = [];
      
      let q = query(
        collection(db, collectionName),
        orderBy('createdAt', 'desc'),
        limit(maxReports)
      );
      
      // Apply filters
      if (filters.type) {
        q = query(q, where('type', '==', filters.type));
      }
      
      if (filters.priority) {
        q = query(q, where('priority', '==', filters.priority));
      }
      
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => handleSnapshotChange(collectionName, snapshot),
        (err) => {
          console.error(`[Error] ${collectionName} listener:`, err);
          setConnectionStatus('disconnected');
          setError(err.message);
          
          // Auto-retry after 5 seconds
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          
          retryTimeoutRef.current = setTimeout(() => {
            console.log('[Retry] Reconnecting to Firebase...');
            setConnectionStatus('reconnecting');
            
            // Re-setup this listener
            const q = query(
              collection(db, collectionName),
              orderBy('createdAt', 'desc'),
              limit(maxReports)
            );
            
            const newUnsubscribe = onSnapshot(
              q,
              (snapshot) => handleSnapshotChange(collectionName, snapshot),
              (retryErr) => {
                console.error(`[Error] ${collectionName} retry failed:`, retryErr);
              }
            );
            
            // Replace old unsubscribe with new one
            const index = unsubscribersRef.current.findIndex(u => u === unsubscribe);
            if (index !== -1) {
              unsubscribersRef.current[index] = newUnsubscribe;
            }
          }, 5000);
        }
      );
      
      unsubscribersRef.current.push(unsubscribe);
    });
    
    // Mark as loaded
    isInitialLoadRef.current = false;
    
    // Cleanup on unmount
    return () => {
      console.log('[Realtime] Disconnecting all listeners');
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [maxReports, enableNotifications, filters, handleSnapshotChange]);
  
  /**
   * Periodic refresh safety net
   */
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log(`[Refresh] Dashboard data check at ${new Date().toLocaleTimeString()}`);
      // Firebase listeners automatically pull latest data
      setLastUpdated(new Date());
    }, autoRefreshInterval);
    
    return () => clearInterval(refreshInterval);
  }, [autoRefreshInterval]);
  
  /**
   * Update display time every second
   */
  useEffect(() => {
    const displayInterval = setInterval(() => {
      setLastUpdated(prev => new Date(prev.getTime()));
    }, 1000);
    
    return () => clearInterval(displayInterval);
  }, []);
  
  // Request notification permission on mount
  useEffect(() => {
    if (enableNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('🔔 Notification permission:', permission);
      });
    }
  }, [enableNotifications]);
  
  return {
    reports,
    loading,
    error,
    connectionStatus,
    lastUpdated,
    totalReports: reports.length,
    isConnected: connectionStatus === 'connected'
  };
};

/**
 * Paginated Query Hook for large datasets
 */
export const usePaginatedReports = (pageSize = 20) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  
  const fetchNextPage = useCallback(async () => {
    if (loading || (!hasMore && lastVisible)) return;
    
    setLoading(true);
    
    try {
      let q = query(
        collection(db, 'security_alerts'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
      
      if (lastVisible) {
        q = query(q, startAfter(lastVisible));
      }
      
      const snapshot = await getDocs(q);
      
      const newReports = snapshot.docs.map(doc =>
        normalizeReport({ ...doc.data(), id: doc.id }, doc.id, 'security_alerts')
      );
      
      setReports(prev => [...prev, ...newReports]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === pageSize);
    } catch (error) {
      console.error('❌ Error fetching paginated reports:', error);
    } finally {
      setLoading(false);
    }
  }, [pageSize, lastVisible, loading, hasMore]);
  
  const reset = useCallback(() => {
    setReports([]);
    setLastVisible(null);
    setHasMore(true);
    fetchNextPage();
  }, [fetchNextPage]);
  
  return {
    reports,
    loading,
    hasMore,
    fetchNextPage,
    reset
  };
};

/**
 * Connection Status Monitor Hook
 */
export const useFirebaseConnection = () => {
  const [status, setStatus] = useState('connected');
  const [lastChecked, setLastChecked] = useState(new Date());
  
  useEffect(() => {
    // Simple connectivity test
    const checkConnection = async () => {
      try {
        const testRef = collection(db, 'system_status');
        await getDocs(testRef);
        setStatus('connected');
        setLastChecked(new Date());
      } catch (error) {
        setStatus('disconnected');
        console.error('❌ Connection check failed:', error);
      }
    };
    
    checkConnection();
    
    const interval = setInterval(checkConnection, 10000); // Check every 10s
    
    return () => clearInterval(interval);
  }, []);
  
  return { status, lastChecked };
};

export default useRealtimeReports;
