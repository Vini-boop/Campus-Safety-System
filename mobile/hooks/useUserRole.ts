import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_ROLES } from '@/utils/roleUtils';

export const useUserRole = () => {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const storedRole = await AsyncStorage.getItem('userRole');
        setUserRole(storedRole);
      } catch (error) {
        console.error('Error loading user role:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserRole();
  }, []);

  const setUserRoleAsync = async (role: string) => {
    try {
      await AsyncStorage.setItem('userRole', role);
      setUserRole(role);
    } catch (error) {
      console.error('Error setting user role:', error);
    }
  };

  const clearUserData = async () => {
    try {
      await AsyncStorage.removeItem('userRole');
      setUserRole(null);
    } catch (error) {
      console.error('Error clearing user data:', error);
    }
  };

  return {
    userRole,
    loading,
    setUserRole: setUserRoleAsync,
    clearUserData
  };
};