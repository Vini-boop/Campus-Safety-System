/**
 * OB Book Integration Monitor - Real-time Communication Checker
 * 
 * Features:
 * - Monitor real-time connection status
 * - Track data flow between User → Firestore → Dashboard
 * - Verify OB log creation, updates, and deletion
 * - Performance metrics (latency, sync time)
 * - Error tracking and recovery
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../services/firebase';

// Connection states
const CONNECTION_STATES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

export const useOBIntegrationMonitor = (session) => {
  // State
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATES.DISCONNECTED);
  const [lastSync, setLastSync] = useState(null);
  const [syncLatency, setSyncLatency] = useState(0);
  const [obCount, setObCount] = useState(0);
  const [errors, setErrors] = useState([]);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    avgSyncTime: 0,
    totalSyncs: 0,
    failedSyncs: 0,
    lastUpdateTime: null
  });
  
  // Refs
  const syncTimesRef = useRef([]);
  const listenerActiveRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);
  
  /**
   * Track performance metrics
   */
  const trackPerformance = useCallback((syncTime) => {
    syncTimesRef.current.push(syncTime);
    
    // Keep only last 10 sync times
    if (syncTimesRef.current.length > 10) {
      syncTimesRef.current.shift();
    }
    
    // Calculate average
    const avg = syncTimesRef.current.reduce((a, b) => a + b, 0) / syncTimesRef.current.length;
    
    setPerformanceMetrics(prev => ({
      avgSyncTime: Math.round(avg),
      totalSyncs: prev.totalSyncs + 1,
      failedSyncs: prev.failedSyncs,
      lastUpdateTime: new Date()
    }));
  }, []);
  
  /**
   * Handle errors
   */
  const handleError = useCallback((error, context) => {
    console.error(`[OB Monitor] Error in ${context}:`, error);
    
    setErrors(prev => [...prev, {
      error: error.message,
      context,
      timestamp: new Date(),
      code: error.code
    }].slice(-10)); // Keep last 10 errors
    
    setPerformanceMetrics(prev => ({
      ...prev,
      failedSyncs: prev.failedSyncs + 1
    }));
  }, []);
  
  /**
   * Setup real-time monitoring
   */
  useEffect(() => {
    if (!session?.uid) {
      console.log('[OB Monitor] No session, skipping monitor');
      return;
    }
    
    console.log('[OB Monitor] Starting real-time communication monitor...');
    setConnectionStatus(CONNECTION_STATES.RECONNECTING);
    
    const currentYear = new Date().getFullYear();
    const startTime = Date.now();
    
    // Setup main OB listener
    const q = query(
      collection(db, 'security_ob_logs'),
      where('year', '==', currentYear),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const syncTime = Date.now() - startTime;
        const count = snapshot.docs.length;
        
        console.log(`[OB Monitor] ✅ Real-time sync successful: ${count} OB logs (${syncTime}ms)`);
        
        // Update state
        setConnectionStatus(CONNECTION_STATES.CONNECTED);
        setLastSync(new Date());
        setSyncLatency(syncTime);
        setObCount(count);
        
        // Track performance
        trackPerformance(syncTime);
        
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        listenerActiveRef.current = true;
      },
      (error) => {
        console.error('[OB Monitor] ❌ Real-time sync failed:', error);
        
        handleError(error, 'onSnapshot');
        setConnectionStatus(CONNECTION_STATES.ERROR);
        
        // Attempt reconnection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[OB Monitor] 🔄 Attempting reconnection...');
          setConnectionStatus(CONNECTION_STATES.RECONNECTING);
        }, 5000);
      }
    );
    
    // Cleanup
    return () => {
      console.log('[OB Monitor] Stopping monitor');
      unsubscribe();
      listenerActiveRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [session?.uid, trackPerformance, handleError]);
  
  /**
   * Test write operation
   */
  const testWriteOperation = useCallback(async () => {
    try {
      console.log('[OB Monitor] Testing write operation...');
      
      const testDoc = {
        obNumber: `TEST-${Date.now()}`,
        year: new Date().getFullYear(),
        category: 'system_test',
        summary: 'Integration test - auto-deleted',
        status: 'open',
        priority: 'low',
        timeline: [{
          action: 'test_created',
          timestamp: serverTimestamp(),
          actor: 'system',
          actorName: 'Integration Monitor'
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isTest: true
      };
      
      const start = Date.now();
      const docRef = await addDoc(collection(db, 'security_ob_logs'), testDoc);
      const writeTime = Date.now() - start;
      
      console.log(`[OB Monitor] ✅ Write test successful (${writeTime}ms): ${docRef.id}`);
      
      // Clean up test document
      await updateDoc(docRef, {
        deletedAt: serverTimestamp(),
        timeline: [{
          action: 'test_deleted',
          timestamp: serverTimestamp(),
          actor: 'system',
          actorName: 'Integration Monitor'
        }]
      });
      
      return {
        success: true,
        writeTime,
        docId: docRef.id
      };
    } catch (error) {
      handleError(error, 'write_test');
      return {
        success: false,
        error: error.message
      };
    }
  }, [handleError]);
  
  /**
   * Manual refresh
   */
  const forceRefresh = useCallback(() => {
    console.log('[OB Monitor] Force refresh requested');
    setConnectionStatus(CONNECTION_STATES.RECONNECTING);
  }, []);
  
  /**
   * Clear errors
   */
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);
  
  return {
    // Status
    connectionStatus,
    isConnected: connectionStatus === CONNECTION_STATES.CONNECTED,
    isReconnecting: connectionStatus === CONNECTION_STATES.RECONNECTING,
    hasError: connectionStatus === CONNECTION_STATES.ERROR,
    
    // Metrics
    lastSync,
    syncLatency,
    obCount,
    performanceMetrics,
    errors,
    
    // Actions
    testWriteOperation,
    forceRefresh,
    clearErrors
  };
};

// ─── UI Component for Display ────────────────────────────────────────────────

export const OBIntegrationMonitorUI = ({ session }) => {
  const {
    connectionStatus,
    isConnected,
    isReconnecting,
    hasError,
    lastSync,
    syncLatency,
    obCount,
    performanceMetrics,
    errors,
    testWriteOperation,
    forceRefresh,
    clearErrors
  } = useOBIntegrationMonitor(session);
  
  const [expanded, setExpanded] = useState(false);
  
  // Status indicator color
  const getStatusColor = () => {
    if (isConnected) return 'bg-green-500';
    if (isReconnecting) return 'bg-yellow-500 animate-pulse';
    if (hasError) return 'bg-red-500';
    return 'bg-gray-500';
  };
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Mini Status Indicator */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="bg-[#141728] border border-[#252A41] rounded-xl p-3 shadow-lg hover:border-purple-500 transition-colors"
        title="OB Integration Monitor"
      >
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-white text-xs font-semibold">
            {isConnected ? 'Live' : isReconnecting ? 'Reconnecting' : 'Error'}
          </span>
        </div>
      </button>
      
      {/* Expanded View */}
      {expanded && (
        <div className="absolute bottom-14 right-0 w-96 bg-[#141728] border border-[#252A41] rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-[#1e2347] px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm">🔗 OB Integration Monitor</h3>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          {/* Content */}
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {/* Connection Status */}
            <div className="flex items-center justify-between bg-[#0D1130] rounded-lg p-3">
              <span className="text-gray-400 text-xs">Connection</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                <span className={`text-xs font-semibold ${
                  isConnected ? 'text-green-400' : isReconnecting ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
            </div>
            
            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0D1130] rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">OB Logs</p>
                <p className="text-white text-lg font-bold">{obCount}</p>
              </div>
              <div className="bg-[#0D1130] rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Sync Latency</p>
                <p className={`text-lg font-bold ${
                  syncLatency < 100 ? 'text-green-400' : syncLatency < 500 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {syncLatency}ms
                </p>
              </div>
              <div className="bg-[#0D1130] rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Avg Sync Time</p>
                <p className="text-white text-lg font-bold">{performanceMetrics.avgSyncTime}ms</p>
              </div>
              <div className="bg-[#0D1130] rounded-lg p-2">
                <p className="text-gray-500 text-[10px]">Total Syncs</p>
                <p className="text-white text-lg font-bold">{performanceMetrics.totalSyncs}</p>
              </div>
            </div>
            
            {/* Last Sync */}
            <div className="bg-[#0D1130] rounded-lg p-2">
              <p className="text-gray-500 text-[10px]">Last Sync</p>
              <p className="text-white text-xs">
                {lastSync ? lastSync.toLocaleTimeString() : 'Never'}
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={forceRefresh}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
              <button
                onClick={testWriteOperation}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                🧪 Test Write
              </button>
            </div>
            
            {/* Errors */}
            {errors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-red-400 text-xs font-semibold">⚠️ Recent Errors ({errors.length})</p>
                  <button
                    onClick={clearErrors}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {errors.slice(-3).map((err, idx) => (
                    <div key={idx} className="text-red-300 text-[10px] bg-red-500/10 p-1 rounded">
                      {err.context}: {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default useOBIntegrationMonitor;
