import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import ApprovalGate, { getVerificationState } from '@/components/ApprovalGate';
import { api } from '@/services/api';
import { collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import * as Location from 'expo-location';
import { getAccurateLocation } from '@/utils/getAccurateLocation';
import * as ImagePicker from 'expo-image-picker';
import {
  validateMediaAttachments,
  sanitizeInput,
  validateHostelInfo,
} from '@/utils/formValidation';
import { uploadMediaBatch, validateMediaFile } from '@/services/mediaUploadService';
import { logAppError } from '@/utils/errorReporting';
import IncidentService, {
  IncidentType,
  IncidentStatus,
  SecurityCategory,
  MedicalSubType,
  LocationData,
  ReporterInfo,
  EvidenceFile
} from '@/services/incidentService';
import FirebaseConnectivityMonitor from '@/components/FirebaseConnectivityMonitor';
import { MAX_MEDIA_FILES } from '@/constants/mediaConfig';
import AmbulanceRequestForm from '@/components/AmbulanceRequestForm';
import { resolveLocation, resolveLocationSync, getReportLocationForDashboard } from '@/services/placeIntelligenceService';

type ReportType = 'security' | 'medical';

const SECURITY_CATEGORIES = [
  { label: 'Harassment', value: 'harassment' },
  { label: 'Assault', value: 'assault' },
  { label: 'Theft', value: 'theft' },
  { label: 'Suspicious Activity', value: 'suspicious_activity' },
  { label: 'Unsafe Environment', value: 'unsafe_environment' },
];

export default function ReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // ✅ Get safe area insets
  const { user, userProfile, isAuthenticated, authLoading } = useAuth();

  // Form state
  const [reportType, setReportType] = useState<ReportType>('security');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [hostelName, setHostelName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [securityCategory, setSecurityCategory] = useState('');

  // Medical sub-flow state
  const [showAmbulanceForm, setShowAmbulanceForm] = useState(false);
  const [ambulanceCondition, setAmbulanceCondition] = useState('');

  // Emergency symptom detection
  const [showEmergencySuggestion, setShowEmergencySuggestion] = useState(false);

  // System state
  const [submitting, setSubmitting] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [resolvedPlaceName, setResolvedPlaceName] = useState<string>('');

  // Media state
  const [mediaAssets, setMediaAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [mediaValidationErrors, setMediaValidationErrors] = useState<string[]>([]);

  // Prevent duplicate submissions
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const isSubmittingRef = useRef(false);

  // Real-time report tracking
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<string>('');

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      Alert.alert('Authentication Required', 'You must be logged in to submit reports.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
  }, [isAuthenticated, authLoading, router]);

  // ✅ STEP 4: ADD REAL-TIME STATUS UPDATES
  useEffect(() => {
    if (!reportId) return;

    console.log('🔍 Setting up real-time listener for report:', reportId);

    const unsub = onSnapshot(doc(db, 'security_reports', reportId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newStatus = data.status || 'reported';

        console.log('📡 Live update received:', {
          status: newStatus,
          adminResponse: data.adminResponse
        });

        // Only show alert if status changed
        if (newStatus !== reportStatus) {
          setReportStatus(newStatus);

          if (newStatus === 'received') {
            Alert.alert(
              '✅ Case Received',
              'Security team is reviewing your case.'
            );
          } else if (newStatus === 'resolved') {
            Alert.alert(
              '🎉 Case Resolved',
              'Your case has been resolved.'
            );
          } else if (newStatus === 'action_required') {
            Alert.alert(
              '📢 Action Required',
              data.adminResponse?.message || 'Please visit the security office for further assistance.',
              [{ text: 'OK' }]
            );
          }
        }
      }
    }, (error) => {
      // Silently handle permission errors - report updates may not be accessible
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('Report updates require permissions - real-time updates disabled');
      } else {
        console.error('❌ Error in real-time snapshot:', error);
      }
    });

    return () => {
      console.log('🛑 Cleaning up real-time listener');
      unsub();
    };
  }, [reportId, reportStatus]);

  // ✅ Generate unique OB Number: timestamp + random suffix
  const generateOBNumber = useCallback(() => {
    const ts = Date.now().toString(36).toUpperCase().slice(-4); // last 4 chars of base-36 timestamp
    const rand = Math.floor(100 + Math.random() * 900).toString(); // 3-digit random
    return `OB-${ts}${rand}`;
  }, []);

  // Location helpers
  const requestLocationPermission = useCallback(async () => {
    try {
      setLocationLoading(true);
      setLocationError('');

      // getAccurateLocation handles permission internally and waits for a good fix
      const loc = await getAccurateLocation({ targetAccuracyM: 40, timeoutMs: 15_000 });
      const { latitude, longitude } = loc;

      if (latitude === 0 && longitude === 0) {
        setLocationError('Could not get your location. Please enter manually.');
        return false;
      }

      setCurrentCoordinates({ latitude, longitude });
      console.log(`📡 Report GPS: ±${Math.round(loc.accuracy)} m`);

      // 1. Instant campus zone snap
      const syncName = resolveLocationSync(latitude, longitude);
      if (syncName) {
        setLocation(syncName);
        setResolvedPlaceName(syncName);
        setLocationError('');
        console.log('📍 Place Intelligence (sync):', syncName);
      }

      // 2. Async refinement
      resolveLocation(latitude, longitude).then(name => {
        if (name) {
          setLocation(name);
          setResolvedPlaceName(name);
          console.log('📍 Place Intelligence (async):', name);
        }
      }).catch(() => { });

      return true;
    } catch (err: any) {
      if (err?.message?.includes('permission')) {
        Alert.alert(
          'Location Permission Required',
          'This app needs location access to report incidents accurately.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        setLocationError('Location permission denied. Please enter location manually.');
      } else {
        setLocationError('Failed to get current location. Please enter manually.');
      }
      return false;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      requestLocationPermission();
    }
  }, [isAuthenticated, requestLocationPermission]);

  // Detect emergency symptoms and suggest ambulance
  const checkEmergencySymptoms = (text: string) => {
    const emergencyKeywords = [
      'chest pain',
      'difficulty breathing',
      'short of breath',
      'can\'t breathe',
      'severe bleeding',
      'heavy bleeding',
      'unconscious',
      'fainting',
      'heart attack',
      'stroke',
      'severe allergic reaction',
      'anaphylaxis',
      'seizure',
      'convulsion',
      'severe burn',
      'broken bone',
      'head injury',
      'poisoning',
      'overdose',
    ];

    const lowerText = text.toLowerCase();
    const hasEmergency = emergencyKeywords.some(keyword => lowerText.includes(keyword));

    if (hasEmergency && !showAmbulanceForm) {
      setShowEmergencySuggestion(true);
      setTimeout(() => {
        Alert.alert(
          '🚨 EMERGENCY DETECTED',
          'Your description suggests this may be a medical emergency.\n\n' +
          'Would you like to request an ambulance immediately?',
          [
            { text: 'No, Continue Regular Report', style: 'cancel' },
            {
              text: 'YES, Request Ambulance',
              style: 'destructive',
              onPress: () => {
                setShowEmergencySuggestion(false);
                setShowAmbulanceForm(true);
              },
            },
          ]
        );
      }, 500);
    }
  };

  // Media helpers
  const takePhoto = async () => {
    try {
      if (mediaAssets.length >= MAX_MEDIA_FILES) {
        Alert.alert('Limit Reached', `Maximum ${MAX_MEDIA_FILES} files allowed.`);
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Camera Permission Required', 'Camera access is needed to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3] as [number, number],
        quality: 0.8,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        const validation = validateMediaFile(asset);
        if (!validation.valid) { Alert.alert('Validation Error', validation.error || 'Invalid file'); return; }
        setMediaAssets(prev => [...prev, asset]);
        setMediaValidationErrors([]);
      }
    } catch (error: any) {
      await logAppError(error, 'takePhoto');
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const recordVideo = async () => {
    try {
      if (mediaAssets.length >= MAX_MEDIA_FILES) {
        Alert.alert('Limit Reached', `Maximum ${MAX_MEDIA_FILES} files allowed.`);
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Camera Permission Required', 'Camera access is needed to record video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        const validation = validateMediaFile(asset);
        if (!validation.valid) { Alert.alert('Validation Error', validation.error || 'Invalid file'); return; }
        setMediaAssets(prev => [...prev, asset]);
        setMediaValidationErrors([]);
      }
    } catch (error: any) {
      await logAppError(error, 'recordVideo');
      Alert.alert('Error', 'Failed to record video. Please try again.');
    }
  };

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission Required', 'Media library access is needed to attach files.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        const newAssets = result.assets;
        const validationErrors: string[] = [];
        for (const asset of newAssets) {
          const validation = validateMediaFile(asset);
          if (!validation.valid) validationErrors.push(validation.error || 'Invalid file');
        }
        const countValidation = validateMediaAttachments([...mediaAssets, ...newAssets]);
        if (countValidation) validationErrors.push(countValidation.message);
        if (validationErrors.length > 0) { Alert.alert('Validation Error', validationErrors.join('\n')); return; }
        const availableSlots = MAX_MEDIA_FILES - mediaAssets.length;
        const assetsToAdd = newAssets.slice(0, availableSlots);
        if (assetsToAdd.length > 0) { setMediaAssets(prev => [...prev, ...assetsToAdd]); setMediaValidationErrors([]); }
        if (newAssets.length > availableSlots) {
          Alert.alert('Limit Reached', `Only ${availableSlots} more file(s) can be added. Maximum ${MAX_MEDIA_FILES} files allowed.`);
        }
      }
    } catch (error: any) {
      await logAppError(error, 'pickFromGallery');
      Alert.alert('Error', 'Failed to select files. Please try again.');
    }
  };

  const removeMedia = (index: number) => {
    setMediaAssets(prev => prev.filter((_, i) => i !== index));
    setMediaValidationErrors([]);
  };

  // Reset form
  const resetForm = useCallback(() => {
    setLocation('');
    setDescription('');
    setHostelName('');
    setRoomNumber('');
    setSecurityCategory('');
    setShowAmbulanceForm(false);
    setAmbulanceCondition('');
    setLocationError('');
    setMediaAssets([]);
    setMediaValidationErrors([]);
    setCurrentCoordinates(null);
    setHasSubmitted(false);
  }, []);

  // Get fresh token
  const getFreshToken = async (): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    return await user.getIdToken(true);
  };

  // Submit Security report
  const handleSecuritySubmit = async () => {
    if (isSubmittingRef.current) return;
    if (!isAuthenticated || !user || !userProfile) {
      Alert.alert('Authentication Error', 'Please log in to submit reports.');
      return;
    }

    // Students must have a registration number on file; admin verification can complete later
    if (userProfile.role === 'student') {
      const reg = ((userProfile.regNo || (userProfile as any).regNumber || '') as string).trim();
      if (!userProfile.isProfileComplete || !reg) {
        Alert.alert(
          '⚠️ Profile Incomplete',
          'Add your Registration Number in your profile so reports can be linked to you.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Update Profile Now', onPress: () => router.push('/update-profile' as any) }
          ]
        );
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const sanitizedLocation = sanitizeInput(location);
      const sanitizedDescription = sanitizeInput(description);
      const sanitizedHostelName = sanitizeInput(hostelName);
      const sanitizedRoomNumber = sanitizeInput(roomNumber);

      const errors: string[] = [];
      if (!sanitizedLocation) errors.push('Location is required.');
      if (!sanitizedDescription) errors.push('Description is required.');
      if (sanitizedDescription.length < 10) errors.push('Description must be at least 10 characters.');
      if (!securityCategory) errors.push('Please select a category.');
      const hostelErrs = validateHostelInfo({
        hostelName: sanitizedHostelName,
        roomNumber: sanitizedRoomNumber,
        reportType: 'security',
      });
      hostelErrs.forEach(e => errors.push(e.message));
      const mediaValidation = validateMediaAttachments(mediaAssets);
      if (mediaValidation) errors.push(mediaValidation.message);
      if (errors.length > 0) { Alert.alert('Validation Error', errors.join('\n')); return; }

      // Auto-detect priority based on description keywords
      const priorityKeywords = ['weapon', 'attack', 'fire', 'theft in progress', 'assault', 'dangerous', 'emergency'];
      const lowerDesc = sanitizedDescription.toLowerCase();
      const detectedPriority = priorityKeywords.some(keyword => lowerDesc.includes(keyword)) ? 'high' : 'medium';

      // ✅ STEP 3: Generate UNIQUE OB Number BEFORE saving
      const nextOBNumber = generateOBNumber();
      console.log('🎯 Generated unique OB Number:', nextOBNumber);

      // 1. Upload media files FIRST to get URLs
      let evidenceFiles: Array<{ type: 'image' | 'video'; url: string }> = [];
      if (mediaAssets.length > 0) {
        try {
          const uploadResult = await uploadMediaBatch(mediaAssets, 'temp_' + Date.now());
          if (uploadResult.success && uploadResult.uploadedUrls.length > 0) {
            evidenceFiles = uploadResult.uploadedUrls.map(url => ({
              type: url.includes('video') ? 'video' : 'image',
              url: url
            }));
          }
        } catch (uploadError: any) {
          await logAppError(uploadError, 'mediaUpload');
          // Continue even if upload fails - media is optional
        }
      }

      const categoryLabel =
        SECURITY_CATEGORIES.find((c) => c.value === securityCategory)?.label || securityCategory;
      const regNumber =
        userProfile.role === 'student'
          ? ((userProfile.regNo || (userProfile as any).regNumber || '') as string).trim()
          : '';
      const reporterPhone =
        typeof (userProfile as any).phone === 'string' ? (userProfile as any).phone.trim() : '';

      const locInfo = await getReportLocationForDashboard(
        currentCoordinates?.latitude,
        currentCoordinates?.longitude,
        sanitizedLocation
      );
      const dashboardLocationName = locInfo.displayName;

      // 2. Full payload for `security_reports` (OB entry mirrors this)
      const securityReportData = {
        obNumber: nextOBNumber,
        reportType: 'security' as const,
        studentId: user.uid,
        reporterRole: userProfile.role || 'student',
        studentName:
          (userProfile as any).displayName || (userProfile as any).fullName || user.email || 'Anonymous',
        studentEmail: user.email || '',
        regNumber,
        isRegNumberVerified: !!userProfile.isRegNumberVerified,
        phone: reporterPhone || null,
        category: securityCategory,
        categoryLabel,
        description: sanitizedDescription,
        hostelName: sanitizedHostelName,
        roomNumber: sanitizedRoomNumber,
        location: {
          latitude: currentCoordinates?.latitude ?? 0,
          longitude: currentCoordinates?.longitude ?? 0,
          address: dashboardLocationName,
        },
        locationText: dashboardLocationName,
        placeName: dashboardLocationName,
        locationUserInput: sanitizedLocation,
        campusZone: locInfo.campusZone,
        campusZoneCategory: locInfo.campusZoneCategory,
        locationMatchSource: locInfo.matchedBy,
        media: evidenceFiles,
        evidence: evidenceFiles,
        mediaCount: evidenceFiles.length,
        status: 'reported',
        priority: detectedPriority,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        assignedTo: null,
        resolvedAt: null,
      };

      // 3. Save to Firestore `security_reports`, then set stable `reportId` field = document id
      const reportDocRef = await addDoc(collection(db, 'security_reports'), securityReportData);
      const newReportId = reportDocRef.id;
      await updateDoc(reportDocRef, { reportId: newReportId });

      // ✅ Store reportId for real-time updates
      setReportId(newReportId);

      // 4. Occurrence Book — same OB number + mirrored fields for admin OB UI
      const obEntry = {
        obNumber: nextOBNumber,
        reportId: newReportId,
        reportType: 'security',
        reporterRole: userProfile.role || 'student',

        // ── Student info ──────────────────────────────────────────────────────
        studentName: securityReportData.studentName,
        studentEmail: user.email || '',
        studentId: user.uid,
        regNumber,
        isRegNumberVerified: !!userProfile.isRegNumberVerified,
        phone: reporterPhone || null,

        // ── Incident details ──────────────────────────────────────────────────
        category: securityCategory,
        categoryLabel,
        summary:
          sanitizedDescription.substring(0, 100) + (sanitizedDescription.length > 100 ? '...' : ''),
        description: sanitizedDescription,

        // ── Location — admin reads log.location?.address ──────────────────────
        location: {
          address: dashboardLocationName,
          latitude: currentCoordinates?.latitude ?? 0,
          longitude: currentCoordinates?.longitude ?? 0,
        },
        locationText: dashboardLocationName,
        locationUserInput: sanitizedLocation,
        campusZone: locInfo.campusZone,
        campusZoneCategory: locInfo.campusZoneCategory,
        locationMatchSource: locInfo.matchedBy,
        coordinates: {
          latitude: currentCoordinates?.latitude ?? 0,
          longitude: currentCoordinates?.longitude ?? 0,
        },
        placeName: dashboardLocationName,
        hostelName: sanitizedHostelName,
        roomNumber: sanitizedRoomNumber,

        // ── Media ─────────────────────────────────────────────────────────────
        media: evidenceFiles,
        evidence: evidenceFiles,
        mediaCount: evidenceFiles.length,

        // ── Status — admin OB Book uses 'open', not 'reported' ────────────────
        status: 'open',
        priority: detectedPriority,
        isHighRisk: detectedPriority === 'high',

        // ── Required by subscribeToOBLogs: where('year', '==', year) ─────────
        year: new Date().getFullYear(),

        // ── Audit trail ───────────────────────────────────────────────────────
        timeline: [
          {
            action: 'created',
            timestamp: new Date().toISOString(),
            actor: user.uid,
            actorName: securityReportData.studentName,
            notes: 'OB log created from student security report',
          },
        ],
        followUpNotes: [],
        adminResponse: null,
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        closedAt: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        openedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'security_ob_logs'), obEntry);

      // (Notification to security admins is now handled securely via Cloud Functions on document creation)

      // ✅ STEP 6: ADD NOTIFICATIONS (USER FEEDBACK)
      // Create initial notification for the student
      await addDoc(collection(db, 'notifications'), {
        userId: user.uid,
        title: '📝 Report Submitted Successfully',
        message: `Your security report has been logged. OB Number: ${nextOBNumber}`,
        reportId: newReportId,
        obNumber: nextOBNumber,
        category: securityCategory,
        categoryLabel,
        regNumber: regNumber || null,
        read: false,
        createdAt: serverTimestamp(),
      });

      setHasSubmitted(true);

      const pendingRegNote =
        userProfile.role === 'student' && !userProfile.isRegNumberVerified
          ? '\n\nYour registration number is pending staff verification; your report is still on file.'
          : '';

      Alert.alert(
        '✅ SECURITY REPORT SUBMITTED',
        `Your report is in Firestore and the Occurrence Book.\n\n` +
        `OB Number: ${nextOBNumber}\n` +
        `Category: ${categoryLabel}\n` +
        (regNumber ? `Reg No.: ${regNumber}\n` : '') +
        `\nSecurity has been notified.${pendingRegNote}`,
        [{ text: 'OK', onPress: () => { resetForm(); router.back(); } }]
      );
    } catch (error: any) {
      await logAppError(error, 'handleSecuritySubmit');
      Alert.alert('❌ Submission Error', error.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Submit ambulance request
  const handleAmbulanceSubmit = async () => {
    if (isSubmittingRef.current) return;
    if (!isAuthenticated || !user || !userProfile) {
      Alert.alert('Authentication Error', 'Please log in to submit requests.');
      return;
    }

    // Enhanced validation for ambulance requests
    const sanitizedLocation = sanitizeInput(location);
    const sanitizedHostelName = sanitizeInput(hostelName);
    const sanitizedRoomNumber = sanitizeInput(roomNumber);
    const sanitizedCondition = sanitizeInput(ambulanceCondition);

    // Required field validation
    const errors: string[] = [];
    if (!sanitizedLocation) errors.push('Location is required');
    if (!sanitizedHostelName) errors.push('Hostel name is required');
    if (!sanitizedRoomNumber) errors.push('Room number is required');
    if (!sanitizedCondition) errors.push('Medical condition description is required');

    if (sanitizedCondition.length < 10) {
      errors.push('Please provide more details about the medical condition');
    }

    if (errors.length > 0) {
      Alert.alert('❌ Missing Information', errors.join('\n'), [
        { text: 'OK', style: 'default' }
      ]);
      return;
    }

    // Confirm emergency before dispatch
    Alert.alert(
      '🚑 EMERGENCY AMBULANCE REQUEST',
      `This will dispatch an ambulance to:

📍 ${sanitizedHostelName} - Room ${sanitizedRoomNumber}
🏥 Condition: ${sanitizedCondition}

This is an emergency request. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DISPATCH NOW',
          style: 'destructive',
          onPress: async () => {
            await processAmbulanceRequest(
              sanitizedLocation,
              sanitizedHostelName,
              sanitizedRoomNumber,
              sanitizedCondition
            );
          }
        }
      ]
    );
  };

  // Process ambulance request
  const processAmbulanceRequest = async (
    sanitizedLocation: string,
    sanitizedHostelName: string,
    sanitizedRoomNumber: string,
    sanitizedCondition: string
  ) => {
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      // Get current location with high accuracy
      let locationData: LocationData;
      try {
        locationData = await IncidentService.getCurrentLocation();
      } catch (error) {
        // Fallback to manual location input
        locationData = {
          latitude: 0.0417, // Laikipia University default
          longitude: 36.2920,
          address: `${sanitizedHostelName}, Room ${sanitizedRoomNumber}, Laikipia University`
        };
      }

      // Resolve place name for the ambulance location
      let ambulancePlaceName = resolvedPlaceName || sanitizedLocation;
      try {
        if (locationData.latitude && locationData.longitude) {
          ambulancePlaceName = await resolveLocation(locationData.latitude, locationData.longitude);
        }
      } catch {
        // use existing resolved name
      }

      // Create medical incident report with critical priority
      const incidentId = await IncidentService.createIncident({
        type: 'medical',
        medicalSubType: 'ambulance',
        description: `🚑 AMBULANCE EMERGENCY: ${sanitizedCondition}`,
        location: locationData,
        placeName: ambulancePlaceName,
        hostelName: sanitizedHostelName,
        roomNumber: sanitizedRoomNumber,
        reporter: {
          id: user.uid,
          name: (userProfile as any).displayName || (userProfile as any).fullName || user.email || 'Unknown',
          email: user.email || '',
          role: 'student'
        },
        evidence: {
          files: [],
          count: 0
        },
        status: 'pending',
        priority: 'critical'
      });

      setHasSubmitted(true);
      setShowAmbulanceForm(false);

      // Show comprehensive emergency response message
      Alert.alert(
        '🚑 AMBULANCE DISPATCHED',
        `Emergency ambulance has been dispatched to:

📍 ${sanitizedHostelName} - Room ${sanitizedRoomNumber}

⏱️ ETA: 5-10 minutes
📞 Medical team will contact you immediately

Please keep your phone available and stay where you are.`,
        [
          {
            text: 'Got it',
            onPress: () => {
              resetForm();
              router.back();
            }
          }
        ]
      );

      // Optional: Show additional safety instructions
      setTimeout(() => {
        Alert.alert(
          '🏥 Emergency Instructions',
          'While waiting for the ambulance:\n\n• Stay calm and keep breathing steadily\n• Unlock your door if possible\n• Have your ID ready\n• Clear a path for medical staff\n• If safe, have someone wait outside\n\nWe are on our way!',
          [{ text: 'Understood' }]
        );
      }, 2000);

    } catch (error: any) {
      await logAppError(error, 'handleAmbulanceSubmit');
      Alert.alert(
        '❌ Request Failed',
        'Failed to dispatch ambulance. Please try again or call emergency services directly.',
        [
          { text: 'Retry', onPress: () => setSubmitting(false) },
          { text: 'Call Emergency', style: 'destructive' }
        ]
      );
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Shared location bar JSX
  const renderLocationBar = () => (
    <View>
      <View style={styles.locationBar}>
        <Ionicons name="location-outline" size={16} color="#0C156D" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.locationInput}
          placeholder="Location (required) — e.g. Mandela Hall, Library"
          value={location}
          onChangeText={(text) => { setLocation(text); if (locationError) setLocationError(''); }}
          multiline
          placeholderTextColor="#999"
        />
        <TouchableOpacity onPress={requestLocationPermission} disabled={locationLoading} style={styles.locateBtn}>
          {locationLoading ? (
            <ActivityIndicator size="small" color="#0C156D" />
          ) : (
            <Ionicons name="locate" size={18} color="#0C156D" />
          )}
        </TouchableOpacity>
      </View>
      {locationError ? <Text style={[styles.errorText, { marginBottom: 6 }]}>{locationError}</Text> : null}
      {resolvedPlaceName && !locationError ? (
        <View style={styles.resolvedZoneBadge}>
          <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
          <Text style={styles.resolvedZoneText}>📍 {resolvedPlaceName}</Text>
        </View>
      ) : null}
    </View>
  );

  // Shared hostel inputs JSX
  const renderHostelInputs = () => (
    <>
      <TextInput
        style={styles.input}
        placeholder="Hostel Name (required)"
        value={hostelName}
        onChangeText={setHostelName}
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Room Number (required)"
        value={roomNumber}
        onChangeText={setRoomNumber}
        placeholderTextColor="#999"
      />
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report An Incident</Text>
          <View style={styles.headerRight}>
            <FirebaseConnectivityMonitor showDetails={false} />
          </View>
        </View>

        {/* Card */}
        <View style={styles.cardContainer}>
          {/* Tabs */}
          <View style={styles.tabsRow}>
            {(['security', 'medical'] as ReportType[]).map((tab) => {
              const labels: Record<ReportType, string> = { security: 'Security', medical: 'Medical' };
              const isActive = reportType === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabPill, isActive && styles.tabPillActive]}
                  onPress={() => { setReportType(tab); setShowAmbulanceForm(false); }}>
                  <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                    {labels[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: 120 + insets.bottom, // ✅ prevents tab overlap
                flexGrow: 1, // ✅ allows full scroll
              }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* ===== SECURITY TAB ===== */}
            {reportType === 'security' && (
              <View style={styles.tabContent}>
                <Text style={styles.fieldLabel}>Incident Category</Text>
                <View style={styles.categoryGrid}>
                  {SECURITY_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.value}
                      style={[styles.categoryChip, securityCategory === cat.value && styles.categoryChipActive]}
                      onPress={() => setSecurityCategory(cat.value)}>
                      <Text style={[styles.categoryChipText, securityCategory === cat.value && styles.categoryChipTextActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {renderLocationBar()}
                {renderHostelInputs()}

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Description (required) — describe what happened"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor="#999"
                />

                {/* Media Evidence */}
                <View style={styles.evidenceSection}>
                  <Text style={styles.fieldLabel}>Evidence ({mediaAssets.length}/{MAX_MEDIA_FILES} files)</Text>
                  <View style={styles.mediaButtons}>
                    <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto}>
                      <Ionicons name="camera" size={22} color="#0C156D" />
                      <Text style={styles.mediaBtnText}>Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mediaBtn} onPress={recordVideo}>
                      <Ionicons name="videocam" size={22} color="#0C156D" />
                      <Text style={styles.mediaBtnText}>Video</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mediaBtn} onPress={pickFromGallery}>
                      <Ionicons name="images" size={22} color="#0C156D" />
                      <Text style={styles.mediaBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>

                  {mediaValidationErrors.length > 0 && (
                    <Text style={styles.errorText}>{mediaValidationErrors.join('\n')}</Text>
                  )}

                  {mediaAssets.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
                      {mediaAssets.map((asset, index) => (
                        <View key={index} style={styles.thumbnailContainer}>
                          <Image source={{ uri: asset.uri }} style={styles.thumbnail} resizeMode="cover" />
                          {asset.type === 'video' && (
                            <View style={styles.playOverlay}>
                              <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.9)" />
                            </View>
                          )}
                          <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(index)}>
                            <Ionicons name="close-circle" size={20} color="#FF3B30" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>

                {/* Verification gate — shown when student not yet approved */}
                {getVerificationState(userProfile).needsAction && (
                  <ApprovalGate userProfile={userProfile}>{null}</ApprovalGate>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (submitting || getVerificationState(userProfile).needsAction) && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSecuritySubmit}
                  disabled={submitting || getVerificationState(userProfile).needsAction}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Security Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ===== MEDICAL TAB ===== */}
            {reportType === 'medical' && (
              <View style={styles.tabContent}>
                {!showAmbulanceForm ? (
                  <>
                    <Text style={styles.medicalTitle}>How can we help you?</Text>

                    {/* Verification gate for medical actions */}
                    {getVerificationState(userProfile).needsAction && (
                      <ApprovalGate userProfile={userProfile}>{null}</ApprovalGate>
                    )}

                    {!getVerificationState(userProfile).needsAction && (
                      <View style={styles.medicalCards}>
                        <TouchableOpacity
                          style={styles.medicalCard}
                          onPress={() => router.push('/(tabs)/doctor-chat' as any)}>
                          <Text style={styles.medicalCardIcon}>💬</Text>
                          <Text style={styles.medicalCardTitle}>Chat With Doctor</Text>
                          <Text style={styles.medicalCardDesc}>
                            Consult with campus doctor for minor illness, advice, medication guidance
                          </Text>
                          <View style={styles.medicalCardArrow}>
                            <Ionicons name="arrow-forward" size={18} color="#0C156D" />
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.medicalCard, styles.ambulanceCard]}
                          onPress={() => {
                            Alert.alert(
                              '🚑 Request Ambulance',
                              'This will dispatch an ambulance to your location for a serious medical emergency. Continue?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Continue', onPress: () => setShowAmbulanceForm(true) },
                              ]
                            );
                          }}>
                          <Text style={styles.medicalCardIcon}>🚑</Text>
                          <Text style={[styles.medicalCardTitle, { color: '#C0392B' }]}>Request Ambulance</Text>
                          <Text style={styles.medicalCardDesc}>
                            For serious conditions — severe injury, breathing difficulty, loss of consciousness
                          </Text>
                          <View style={styles.medicalCardArrow}>
                            <Ionicons name="arrow-forward" size={18} color="#C0392B" />
                          </View>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                ) : (
                  <AmbulanceRequestForm
                    onSubmit={() => {
                      setShowAmbulanceForm(false);
                      resetForm();
                    }}
                    onCancel={() => setShowAmbulanceForm(false)}
                  />
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C156D' },
  keyboardView: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0C156D',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerRight: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  cardContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  tabPillActive: { backgroundColor: '#0C156D' },
  tabPillText: { fontSize: 11, fontWeight: '600', color: '#666' },
  tabPillTextActive: { color: '#fff' },
  scrollContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  tabContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Location bar
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexWrap: 'wrap',
  },
  locationInput: { flex: 1, fontSize: 14, color: '#333', paddingVertical: 6 },
  locateBtn: { padding: 4 },
  resolvedZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignSelf: 'flex-start',
  },
  resolvedZoneText: { fontSize: 12, color: '#16A34A', fontWeight: '600' },

  // Inputs
  input: {
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 4 },
  errorText: { color: '#C0392B', fontSize: 12, marginTop: 2 },

  // Category chips
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: { backgroundColor: '#0C156D', borderColor: '#0C156D' },
  categoryChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  categoryChipTextActive: { color: '#fff' },

  // Media evidence
  evidenceSection: { marginTop: 4, marginBottom: 12 },
  mediaButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#C5CAE9',
  },
  mediaBtnText: { fontSize: 13, color: '#0C156D', fontWeight: '600' },
  thumbnailScroll: { marginTop: 4 },
  thumbnailContainer: { marginRight: 10, position: 'relative' },
  thumbnail: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#ddd' },
  playOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
  },
  removeBtn: { position: 'absolute', top: -6, right: -6 },

  // Submit button
  submitBtn: {
    backgroundColor: '#0C156D',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20, // ✅ extra safety for tab overlap
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ambulanceSubmitBtn: { backgroundColor: '#C0392B' },

  // Medical tab
  medicalTitle: { fontSize: 18, fontWeight: '700', color: '#0C156D', textAlign: 'center', marginBottom: 16, marginTop: 8 },
  medicalCards: { gap: 14 },
  medicalCard: {
    backgroundColor: '#F5F6FA',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  ambulanceCard: { borderColor: '#FADBD8', backgroundColor: '#FEF9F9' },
  medicalCardIcon: { fontSize: 36, marginBottom: 8 },
  medicalCardTitle: { fontSize: 17, fontWeight: '700', color: '#0C156D', marginBottom: 6 },
  medicalCardDesc: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 10 },
  medicalCardArrow: { alignSelf: 'flex-end' },

  // Ambulance form
  ambulanceForm: { paddingBottom: 16 },
  ambulanceFormHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  backChipText: { color: '#0C156D', fontSize: 13, fontWeight: '600' },
  ambulanceFormTitle: { fontSize: 17, fontWeight: '700', color: '#C0392B' },
  ambulanceUrgencyNote: {
    color: '#C0392B',
    fontSize: 13,
    marginBottom: 16,
    fontStyle: 'italic',
    backgroundColor: '#FADBD8',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
  },
  ambulanceLocationSection: {
    marginBottom: 20,
  },
  ambulanceConditionSection: {
    marginBottom: 20,
  },
  ambulanceSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0C156D',
    marginBottom: 12,
  },
  ambulanceEmergencyInfo: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFE5E5',
  },
  ambulanceInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ambulanceInfoText: {
    fontSize: 14,
    color: '#C0392B',
    marginLeft: 8,
    flex: 1,
  },
  ambulanceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambulanceEmergencyContact: {
    marginTop: 16,
    alignItems: 'center',
  },
  ambulanceEmergencyText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 8,
  },
  emergencyCallButton: {
    backgroundColor: '#27AE60',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyCallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
