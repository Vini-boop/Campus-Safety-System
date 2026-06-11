import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { getIdToken, auth } from './firebase';

const PENDING_SYNC_KEY = '@pending_sync_users';

/**
 * Queue a user profile for background sync to Firestore
 */
export const queueProfileSync = async (userData: {
  uid: string;
  email: string;
  fullName: string;
  role: string;
}) => {
  try {
    console.log('📥 Queueing profile for sync:', userData.uid);
    
    // Get existing pending syncs
    const existing = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    const pending = existing ? JSON.parse(existing) : [];
    
    // Add new pending sync (avoid duplicates)
    const exists = pending.some((u: any) => u.uid === userData.uid);
    if (!exists) {
      pending.push({
        ...userData,
        queuedAt: new Date().toISOString(),
        attempts: 0
      });
      
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
      // Silent - profile queued
    } else {
      // Silent - already queued
    }
  } catch (error) {
    // Silent error handling
  }
};

/**
 * Attempt to sync all pending user profiles to Firestore
 */
export const syncPendingProfiles = async () => {
  try {
    const existing = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!existing) {
      return; // Nothing to sync
    }
    
    const pending = JSON.parse(existing);
    if (pending.length === 0) {
      return; // All synced
    }
    
    // Silent logging - removed to prevent errors
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // Silent - no user
      return;
    }
    
    const idToken = await getIdToken(currentUser);
    if (!idToken) {
      // Silent - no token
      return;
    }
    
    const synced = [];
    
    for (const userData of pending) {
      try {
        // Silent - syncing profile
        
        const response = await api.register(
          { fullName: userData.fullName, email: userData.email },
          idToken
        );
        
        if (response.status >= 200 && response.status < 300) {
          // Silent - successfully synced
          synced.push(userData.uid);
        } else {
          // Silent - sync failed
        }
      } catch (syncError: any) {
        // Silent - keeping in queue for retry
      }
    }
    
    // Remove successfully synced profiles from queue
    const remaining = pending.filter((u: any) => !synced.includes(u.uid));
    
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(PENDING_SYNC_KEY);
      // Silent - all synced
    } else {
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));
      // Silent - still pending
    }
    
  } catch (error) {
    // Silent error handling
  }
};

/**
 * Check if there are pending syncs
 */
export const hasPendingSync = async (): Promise<boolean> => {
  try {
    const existing = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!existing) {
      return false;
    }
    
    const pending = JSON.parse(existing);
    return pending.length > 0;
  } catch (error) {
    // Silent error handling
    return false;
  }
};

/**
 * Get count of pending syncs
 */
export const getPendingSyncCount = async (): Promise<number> => {
  try {
    const existing = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!existing) {
      return 0;
    }
    
    const pending = JSON.parse(existing);
    return pending.length;
  } catch (error) {
    // Silent error handling
    return 0;
  }
};

/**
 * Clear all pending syncs (use with caution)
 */
export const clearPendingSyncs = async () => {
  try {
    await AsyncStorage.removeItem(PENDING_SYNC_KEY);
    // Silent - cleared
  } catch (error) {
    // Silent error handling
  }
};
