import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Montserrat_400Regular_Italic,
  Montserrat_800ExtraBold_Italic
} from '@expo-google-fonts/montserrat';



const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();

  // Load fonts
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular_Italic,
    Montserrat_800ExtraBold_Italic,
  });

  // Fade-in animation for the whole screen
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);

  const handleGetStarted = () => {
    console.log('Onboarding: Get Started → navigating to login');
    // Mark onboarding as completed before navigating
    AsyncStorage.setItem('hasCompletedOnboarding', 'true')
      .then(() => console.log('Onboarding: ✅ Marked as completed'))
      .catch(err => console.error('Onboarding: Failed to save completion:', err));
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {fontsLoaded && (
        <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
          {/* Description text — large bold italic, left-aligned */}
          <Text style={styles.description}>
            <Text style={styles.descriptionBold}>Your daily alerts for</Text>{'\n'}
            security,{'\n'}
            weather, and{'\n'}
            safe movements{'\n'}
            around the{'\n'}
            Campus
          </Text>

          {/* Campus map image */}
          <View style={styles.imageContainer}>
            <Image
              source={require('@/assets/images/campus-map.jpg')}
              style={styles.campusImage}
              resizeMode="cover"
            />
          </View>
        </Animated.View>
      )}

      {/* Get Started button — pinned at bottom */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleGetStarted}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C156D',
  },
  inner: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 80 : 80,
    paddingHorizontal: 28,
  },
  description: {
    fontFamily: 'Montserrat_400Regular_Italic',
    color: '#FFFFFF',
    fontSize: width < 380 ? 30 : 36,
    textAlign: 'left',
    lineHeight: width < 380 ? 30 : 34,
    marginBottom: 32,
  },
  descriptionBold: {
    fontFamily: 'Montserrat_800ExtraBold_Italic',
  },
  imageContainer: {
    width: '100%',
    height: Platform.OS === 'web' ? 320 : 380,
    borderRadius: 0,
    overflow: 'hidden',
    marginTop: 10,
  },
  campusImage: {
    width: '100%',
    height: '100%',
  },
  // Bottom CTA
  bottomArea: {
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 50 : 40,
    paddingTop: 16,
  },
  button: {
    backgroundColor: '#D9D9D9',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      web: { boxShadow: '0 3px 10px rgba(0,0,0,0.15)', cursor: 'pointer' } as any,
    }),
  },
  buttonText: {
    fontFamily: 'Montserrat_800ExtraBold_Italic',
    color: '#000000',
    fontSize: 32,
    letterSpacing: 0.5,
  },
});