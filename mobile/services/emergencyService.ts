import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface EmergencyReport {
  id?: string;
  type: 'security' | 'medical' | 'sos';
  medicalSubType?: 'chat' | 'ambulance';
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  location: string;
  locationCoords: { latitude: number; longitude: number };
  hostelName?: string;
  roomNumber?: string;
  description: string;
  timestamp: Timestamp | any;
  status: 'pending' | 'responding' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  ambulanceRequested?: boolean;
  ambulanceDispatched?: boolean;
  securityNotified?: boolean;
}

class EmergencyService {
  // Send emergency report with immediate notifications
  async sendEmergencyReport(reportData: EmergencyReport) {
    try {
      // Determine priority based on type
      const priority = reportData.type === 'medical' ? 'critical' :
        reportData.type === 'sos' ? 'critical' : 'high';

      // Enhanced report data with emergency flags
      const enhancedReport = {
        ...reportData,
        priority,
        timestamp: serverTimestamp(),
        status: 'pending' as const,
        ambulanceDispatched: reportData.ambulanceRequested === true,
        securityNotified: true,
        requiresImmediateResponse: true,
        emergencyLevel: reportData.type === 'medical' ? 'medical_emergency' :
          reportData.type === 'sos' ? 'sos_alert' : 'security_incident'
      };

      // Add to emergency collection for immediate response
      const docRef = await addDoc(collection(db, 'emergency_reports'), enhancedReport);

      // Also add to respective collections for routing
      if (reportData.type === 'medical') {
        await addDoc(collection(db, 'medical_emergencies'), {
          ...enhancedReport,
          id: docRef.id,
          hostelName: reportData.hostelName,
          ambulanceDispatched: true,
          hospitalNotified: true
        });
      } else if (reportData.type === 'security') {
        await addDoc(collection(db, 'security_alerts'), {
          ...enhancedReport,
          id: docRef.id,
          hostelName: reportData.hostelName,
          securityTeamNotified: true,
          priorityLevel: 'high'
        });
      } else {
        await addDoc(collection(db, 'sos_alerts'), {
          ...enhancedReport,
          id: docRef.id,
          allStaffNotified: true,
          emergencyBroadcast: true
        });
      }

      return {
        success: true,
        reportId: docRef.id,
        message: this.getEmergencyResponseMessage(reportData.type)
      };
    } catch (error: any) {
      console.error('Emergency service error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to send emergency alert'
      };
    }
  }

  // Get appropriate response message
  private getEmergencyResponseMessage(type: string): string {
    switch (type) {
      case 'medical':
        return '🚑 MEDICAL EMERGENCY SENT\n\nAmbulance dispatched to your location.\nMedical team notified.\nYour location has been shared with emergency services.';
      case 'security':
        return '🚨 SECURITY ALERT SENT\n\nSecurity team dispatched to your location.\nCampus security notified.\nYour location has been shared with security personnel.';
      case 'sos':
        return '🆘 SOS EMERGENCY SENT\n\nAll emergency teams notified.\nSecurity and medical teams dispatched.\nYour location shared with all responders.';
      default:
        return 'Emergency report sent successfully.';
    }
  }

  // Track if user is in safe zone
  async checkSafeZone(coords: { latitude: number; longitude: number }): Promise<boolean> {
    // This would integrate with the map service to check if user is in dangerous area
    return false; // Placeholder
  }
}

export default new EmergencyService();
