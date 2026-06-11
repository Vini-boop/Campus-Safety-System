import NetInfo from '@react-native-community/netinfo';

/**
 * Check network connectivity status
 */
export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  details?: string;
}

/**
 * Get detailed network status
 */
export const getNetworkStatus = async (): Promise<NetworkStatus> => {
  try {
    const netState = await NetInfo.fetch();
    
    return {
      isConnected: netState.isConnected ?? false,
      isInternetReachable: netState.isInternetReachable,
      type: netState.type,
      details: `Type: ${netState.type}, Connected: ${netState.isConnected}, Reachable: ${netState.isInternetReachable}`
    };
  } catch (error) {
    console.error('Error fetching network status:', error);
    return {
      isConnected: false,
      isInternetReachable: false,
      type: null,
      details: 'Failed to fetch network status'
    };
  }
};

/**
 * Test if a specific URL is reachable
 */
export const testUrlReachability = async (url: string, timeout = 5000): Promise<{
  reachable: boolean;
  responseTime?: number;
  error?: string;
}> => {
  try {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      console.log(`✅ Server reachable: ${url} (${responseTime}ms)`);
      return {
        reachable: true,
        responseTime
      };
    } else {
      console.warn(`⚠️ Server responded with error: ${url} (${response.status})`);
      return {
        reachable: false,
        responseTime,
        error: `Server responded with status ${response.status}`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Cannot reach server: ${url}`, errorMessage);
    return {
      reachable: false,
      error: errorMessage
    };
  }
};

/**
 * Validate API configuration and connectivity
 * Tests multiple possible backend addresses
 */
export const validateApiConnection = async (baseUrl: string): Promise<{
  valid: boolean;
  networkOk: boolean;
  serverOk: boolean;
  issues: string[];
}> => {
  const issues: string[] = [];
  
  // Check network connectivity
  const networkStatus = await getNetworkStatus();
  let networkOk = networkStatus.isConnected;
  
  if (!networkOk) {
    issues.push('No network connection');
  } else if (networkStatus.isInternetReachable === false) {
    issues.push('Internet not reachable');
    networkOk = false;
  }
  
  // Test the configured server URL
  const healthUrl = `${baseUrl}/health`;
  console.log(`🔍 Testing server health: ${healthUrl}`);
  
  const reachability = await testUrlReachability(healthUrl);
  let serverOk = reachability.reachable;
  
  if (!serverOk) {
    issues.push(`Cannot reach backend server at ${baseUrl}`);
    if (reachability.error) {
      issues.push(reachability.error);
    }
    
    // Try alternative URLs for debugging
    console.log('⚠️  Primary URL failed, trying alternatives...');
    const alternatives = [
      'http://localhost:5000/health',
      'http://10.0.2.2:5000/health',
      'http://172.16.0.1:5000/health'
    ];
    
    for (const altUrl of alternatives) {
      try {
        const altResult = await testUrlReachability(altUrl, 3000);
        if (altResult.reachable) {
          console.log(`✅ Alternative URL works: ${altUrl}`);
          // If any alternative works, we can treat the server as reachable
          // (especially for web where localhost is the actual base URL).
          serverOk = true;
          issues.push(`Try using this URL instead: ${altUrl.replace('/health', '')}`);
        }
      } catch (e) {
        // Continue checking other alternatives
      }
    }
  }
  
  return {
    valid: networkOk && serverOk,
    networkOk,
    serverOk,
    issues
  };
};

/**
 * Get user-friendly error message for network errors
 */
export const getNetworkErrorMessage = (error: any): string => {
  if (error?.customMessage) {
    return error.customMessage;
  }
  
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return 'Request timed out. The server took too long to respond.';
  }
  
  if (error?.response) {
    const status = error.response.status;
    const message = error.response.data?.message || 'Server error occurred';
    return `Server error (${status}): ${message}`;
  }
  
  if (error?.request) {
    return 'Cannot connect to server. Please check if the backend is running.';
  }
  
  return error?.message || 'An unexpected error occurred';
};
