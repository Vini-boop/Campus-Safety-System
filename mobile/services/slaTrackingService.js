/**
 * SLA Tracking Service - Response Time Monitoring
 * 
 * Features:
 * - Track SLA compliance
 * - Breach detection
 * - Performance analytics
 */

const SLA_TARGETS = {
  critical: { response: 5, resolution: 60 },    // minutes
  high: { response: 15, resolution: 180 },
  medium: { response: 30, resolution: 360 },
  low: { response: 60, resolution: 1440 }
};

/**
 * Track SLA compliance for a report
 */
export const trackSLACompliance = (report) => {
  const target = SLA_TARGETS[report.priority] || SLA_TARGETS.medium;
  const now = Date.now();
  const createdAt = new Date(report.createdAt).getTime();
  
  const minutesSinceCreation = (now - createdAt) / 60000;
  
  let slaStatus = 'on_track';
  let timeRemaining = null;
  let percentElapsed = 0;
  
  // Check response SLA (initial response)
  if (!report.firstResponseAt && report.status === 'pending') {
    timeRemaining = (target.response * 60000) - (now - createdAt);
    percentElapsed = (minutesSinceCreation / target.response) * 100;
    
    if (timeRemaining < 0) {
      slaStatus = 'breached';
    } else if (timeRemaining < target.response * 0.2 * 60000) {
      slaStatus = 'at_risk'; // Within 20% of breach
    }
  }
  
  // Check resolution SLA
  if (report.status !== 'resolved' && report.status !== 'closed') {
    const resolutionTimeRemaining = (target.resolution * 60000) - (now - createdAt);
    const resolutionPercentElapsed = (minutesSinceCreation / target.resolution) * 100;
    
    if (resolutionTimeRemaining < 0) {
      slaStatus = 'breached'; // Resolution breached
    } else if (slaStatus !== 'breached' && resolutionPercentElapsed > 80) {
      slaStatus = 'at_risk'; // Resolution at risk
    }
    
    percentElapsed = Math.max(percentElapsed, resolutionPercentElapsed);
  }
  
  return {
    priority: report.priority,
    slaStatus,
    timeRemaining: Math.max(0, timeRemaining || 0),
    percentElapsed: Math.min(100, percentElapsed),
    breached: slaStatus === 'breached',
    atRisk: slaStatus === 'at_risk',
    targets: target,
    minutesElapsed: minutesSinceCreation
  };
};

/**
 * Calculate average response time
 */
export const calculateAverageResponseTime = (reports) => {
  const respondedReports = reports.filter(r => r.firstResponseAt);
  
  if (respondedReports.length === 0) {
    return 'N/A';
  }
  
  const totalResponseTime = respondedReports.reduce((sum, report) => {
    const createdAt = new Date(report.createdAt).getTime();
    const respondedAt = new Date(report.firstResponseAt).getTime();
    return sum + (respondedAt - createdAt);
  }, 0);
  
  const avgMs = totalResponseTime / respondedReports.length;
  const avgMinutes = Math.round(avgMs / 60000);
  
  if (avgMinutes < 60) {
    return `${avgMinutes}m`;
  } else {
    const hours = Math.floor(avgMinutes / 60);
    const mins = avgMinutes % 60;
    return `${hours}h ${mins}m`;
  }
};

/**
 * Calculate SLA compliance rate
 */
export const calculateSLAComplianceRate = (reports, priority = null) => {
  const filteredReports = priority 
    ? reports.filter(r => r.priority === priority)
    : reports;
  
  if (filteredReports.length === 0) {
    return { rate: 100, total: 0, met: 0, breached: 0 };
  }
  
  const slaResults = filteredReports.map(report => trackSLACompliance(report));
  const met = slaResults.filter(r => !r.breached).length;
  const breached = slaResults.filter(r => r.breached).length;
  const rate = (met / filteredReports.length) * 100;
  
  return {
    rate: Math.round(rate * 10) / 10,
    total: filteredReports.length,
    met,
    breached
  };
};

/**
 * Get reports at risk of SLA breach
 */
export const getAtRiskReports = (reports) => {
  return reports
    .filter(r => r.status !== 'resolved' && r.status !== 'closed')
    .map(report => ({
      ...report,
      sla: trackSLACompliance(report)
    }))
    .filter(r => r.sla.atRisk || r.sla.breached)
    .sort((a, b) => b.sla.percentElapsed - a.sla.percentElapsed);
};

/**
 * Generate SLA performance report
 */
export const generateSLAReport = (reports, dateRange = 'all') => {
  // Filter by date range
  const filteredReports = dateRange === 'all' 
    ? reports 
    : reports.filter(r => {
        const reportDate = new Date(r.createdAt);
        const now = new Date();
        const daysDiff = (now - reportDate) / (1000 * 60 * 60 * 24);
        
        if (dateRange === '7d') return daysDiff <= 7;
        if (dateRange === '14d') return daysDiff <= 14;
        if (dateRange === '30d') return daysDiff <= 30;
        return true;
      });
  
  const byPriority = {
    critical: calculateSLAComplianceRate(filteredReports, 'critical'),
    high: calculateSLAComplianceRate(filteredReports, 'high'),
    medium: calculateSLAComplianceRate(filteredReports, 'medium'),
    low: calculateSLAComplianceRate(filteredReports, 'low')
  };
  
  const overall = calculateSLAComplianceRate(filteredReports);
  const avgResponseTime = calculateAverageResponseTime(filteredReports);
  const atRiskCount = getAtRiskReports(filteredReports).length;
  
  return {
    dateRange,
    overall,
    byPriority,
    avgResponseTime,
    atRiskCount,
    totalReports: filteredReports.length
  };
};

/**
 * Format SLA time remaining
 */
export const formatTimeRemaining = (milliseconds) => {
  if (milliseconds <= 0) return 'BREACHED';
  
  const minutes = Math.floor(milliseconds / 60000);
  
  if (minutes < 1) {
    return '< 1m';
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
};

/**
 * Get SLA status color
 */
export const getSLAStatusColor = (status) => {
  switch (status) {
    case 'breached': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'at_risk': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    default: return 'text-green-400 bg-green-500/10 border-green-500/30';
  }
};

export default {
  trackSLACompliance,
  calculateAverageResponseTime,
  calculateSLAComplianceRate,
  getAtRiskReports,
  generateSLAReport,
  formatTimeRemaining,
  getSLAStatusColor
};
