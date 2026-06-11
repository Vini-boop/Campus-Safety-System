/**
 * Prioritization Service - Smart Incident Scoring
 * 
 * Features:
 * - Priority scoring algorithm
 * - Auto-escalation detection
 * - Officer assignment recommendations
 * - Workload balancing
 */

/**
 * Calculate priority score for incident
 * Higher score = more urgent
 */
export const calculatePriorityScore = (report) => {
  let score = 0;
  
  // Type-based priority (0-100 points)
  const typeScores = {
    'sos': 100,
    'emergency': 95,
    'medical': 80,
    'assault': 90,
    'theft': 60,
    'harassment': 75,
    'security': 50,
    'noise': 30,
    'maintenance': 25
  };
  
  const reportType = (report.type || '').toLowerCase();
  const typeScore = Object.entries(typeScores)
    .find(([key]) => reportType.includes(key))?.[1] || 50;
  
  score += typeScore;
  
  // Time-based escalation (+1 point per minute since creation)
  const minutesSinceCreation = (Date.now() - new Date(report.createdAt).getTime()) / 60000;
  score += Math.min(minutesSinceCreation, 50); // Cap at 50 points
  
  // High-risk zone bonus
  if (report.isHighRisk) {
    score += 20;
  }
  
  // Unassigned penalty
  if (!report.assignedTo && report.status === 'pending') {
    score += 10;
  }
  
  // Critical priority bonus
  if (report.priority === 'critical') {
    score += 30;
  } else if (report.priority === 'high') {
    score += 20;
  }
  
  return Math.min(score, 200); // Cap at 200
};

/**
 * Check for incidents requiring auto-escalation
 */
export const checkAutoEscalation = async (reports) => {
  const escalationThresholds = {
    'critical': 5,   // 5 minutes
    'high': 15,      // 15 minutes
    'medium': 30,    // 30 minutes
    'low': 60        // 60 minutes
  };
  
  const now = Date.now();
  const toEscalate = [];
  
  reports.forEach(report => {
    const minutesPending = (now - new Date(report.createdAt).getTime()) / 60000;
    const threshold = escalationThresholds[report.priority] || 30;
    
    if (minutesPending > threshold && report.status === 'pending') {
      toEscalate.push({
        ...report,
        requiresEscalation: true,
        minutesOverdue: minutesPending - threshold,
        escalatedPriority: report.priority === 'critical' ? 'critical' :
                          report.priority === 'high' ? 'critical' :
                          report.priority === 'medium' ? 'high' : 'medium'
      });
    }
  });
  
  return toEscalate;
};

/**
 * Recommend best officer for assignment
 */
export const recommendOfficer = async (report, availableOfficers) => {
  if (!availableOfficers || availableOfficers.length === 0) {
    return null;
  }
  
  const scores = availableOfficers.map(officer => {
    let score = 100;
    
    // Workload penalty (-10 per active case)
    score -= (officer.activeCases || 0) * 10;
    
    // Availability bonus
    if (officer.status === 'available') {
      score += 30;
    } else if (officer.status === 'patrolling') {
      score += 15;
    } else if (officer.status === 'on_duty') {
      score += 10;
    }
    
    // Specialization match
    if (officer.specializations?.includes(report.type)) {
      score += 20;
    }
    
    // Proximity bonus (if location data available)
    if (officer.location && report.locationCoords) {
      const distance = calculateDistance(
        officer.location.latitude,
        officer.location.longitude,
        report.locationCoords.latitude,
        report.locationCoords.longitude
      );
      
      // Closer officers get higher score
      if (distance < 0.5) { // Within 0.5 km
        score += 25;
      } else if (distance < 1) { // Within 1 km
        score += 15;
      } else if (distance < 2) { // Within 2 km
        score += 5;
      }
    }
    
    return { officer, score };
  });
  
  // Sort by score DESC
  scores.sort((a, b) => b.score - a.score);
  
  return scores[0]?.officer || null;
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

/**
 * Get priority color based on score
 */
export const getPriorityColor = (score) => {
  if (score >= 150) return 'red';     // Critical
  if (score >= 100) return 'orange';  // High
  if (score >= 50) return 'yellow';   // Medium
  return 'green';                     // Low
};

/**
 * Batch assign incidents to officers
 */
export const batchAssignIncidents = async (incidents, officers) => {
  const assignments = [];
  
  // Sort incidents by priority score DESC
  const sortedIncidents = [...incidents].sort((a, b) => 
    calculatePriorityScore(b) - calculatePriorityScore(a)
  );
  
  // Track officer workloads
  const officerWorkloads = {};
  officers.forEach(officer => {
    officerWorkloads[officer.id] = officer.activeCases || 0;
  });
  
  // Assign highest priority incidents first
  for (const incident of sortedIncidents) {
    if (incident.assignedTo) continue; // Already assigned
    
    // Find best available officer
    const bestOfficer = await recommendOfficer(incident, officers.filter(o => 
      o.status === 'available' || o.status === 'patrolling'
    ));
    
    if (bestOfficer) {
      assignments.push({
        incidentId: incident.id,
        officerId: bestOfficer.id,
        officerName: bestOfficer.name,
        priority: calculatePriorityScore(incident),
        reason: 'Auto-assigned based on priority and availability'
      });
      
      // Update workload
      officerWorkloads[bestOfficer.id]++;
    }
  }
  
  return assignments;
};

/**
 * Generate priority distribution stats
 */
export const getPriorityDistribution = (reports) => {
  const distribution = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  
  reports.forEach(report => {
    const score = calculatePriorityScore(report);
    
    if (score >= 150) distribution.critical++;
    else if (score >= 100) distribution.high++;
    else if (score >= 50) distribution.medium++;
    else distribution.low++;
  });
  
  return distribution;
};

export default {
  calculatePriorityScore,
  checkAutoEscalation,
  recommendOfficer,
  getPriorityColor,
  batchAssignIncidents,
  getPriorityDistribution
};
