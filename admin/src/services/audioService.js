/**
 * Audio Service
 * Manages alert sounds for emergency and security notifications
 */

class AudioService {
    constructor() {
        this.emergencySound = null;
        this.securitySound = null;
        this.isEnabled = this.getPreference();
        this.volume = 0.7;
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.isInitialized = false;
    }

    /**
     * Initialize audio with sound files or Web Audio API
     */
    init() {
        try {
            // Ambulance siren — for medical/ambulance emergencies
            this.ambulanceSound = new Audio('/sounds/Ambulance-fast-pass-by-with-siren-on.mp3');
            this.ambulanceSound.volume = 1.0;
            this.ambulanceSound.preload = 'auto';
            this.ambulanceSound.onerror = () => { this.ambulanceSound = null; };

            // Alarm beeping — for SOS/security emergencies
            this.emergencySound = new Audio('/sounds/Alarm-beeping-sound.mp3');
            this.emergencySound.volume = this.volume;
            this.emergencySound.preload = 'auto';
            this.emergencySound.onerror = () => { this.emergencySound = null; };

            // SOS morse code — for critical SOS
            this.sosSound = new Audio('/sounds/Sos-morse-code.mp3');
            this.sosSound.volume = this.volume;
            this.sosSound.preload = 'auto';
            this.sosSound.onerror = () => { this.sosSound = null; };

            // Security alert (fallback to beeping)
            this.securitySound = new Audio('/sounds/Alarm-beeping-sound.mp3');
            this.securitySound.volume = this.volume;
            this.securitySound.preload = 'auto';
            this.securitySound.onerror = () => { this.securitySound = null; };

            // Initialize Web Audio API context
            const audioContextClass = window.AudioContext || window.webkitAudioContext;
            if (audioContextClass && !this.audioContext) {
                this.audioContext = new audioContextClass();
                this.gainNode = this.audioContext.createGain();
                this.gainNode.connect(this.audioContext.destination);
                this.gainNode.gain.value = this.volume;
                this.isInitialized = true;
            }
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }
    }

    /**
     * Play ambulance siren — for medical/ambulance emergency requests
     */
    async playAmbulanceSiren() {
        if (!this.isEnabled) return;
        try {
            if (this.ambulanceSound) {
                this.ambulanceSound.currentTime = 0;
                await this.ambulanceSound.play();
                return;
            }
        } catch (error) {
            // Fallback to emergency beep
            this.createEmergencyBeep();
        }
    }

    /**
     * Play emergency alarm sound (SOS/Emergency)
     * @returns {Promise<void>}
     */
    async playEmergencyAlarm() {
        if (!this.isEnabled) {
            return;
        }

        try {
            // Try to play emergency sound file first
            if (this.emergencySound) {
                this.emergencySound.currentTime = 0;
                const playPromise = this.emergencySound.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    return; // Success with file-based sound
                }
            }

            // Fallback to Web Audio API emergency beep
            if (this.audioContext && !this.oscillator) {
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                this.createEmergencyBeep();
            }
        } catch (error) {
            console.error('Error playing emergency alarm:', error.message);

            if (this.audioContext && this.audioContext.state !== 'suspended') {
                try {
                    this.createEmergencyBeep();
                } catch (e) {
                    console.error('Failed to create emergency beep:', e);
                }
            }
        }
    }

    /**
     * Play security alert sound
     * @returns {Promise<void>}
     */
    async playSecurityAlert() {
        if (!this.isEnabled) return;
        try {
            if (this.securitySound) {
                this.securitySound.currentTime = 0;
                await this.securitySound.play();
                return;
            }
            if (this.audioContext) {
                if (this.audioContext.state === 'suspended') await this.audioContext.resume();
                this.createSecurityBeep();
            }
        } catch (error) {
            if (this.audioContext && this.audioContext.state !== 'suspended') {
                try { this.createSecurityBeep(); } catch (e) { /* ignore */ }
            }
        }
    }

    /**
     * Play notification sound (for verification requests, info alerts)
     * @returns {Promise<void>}
     */
    async playNotificationSound() {
        if (!this.isEnabled) {
            return;
        }

        try {
            // Use Web Audio API for a pleasant notification chime
            if (this.audioContext) {
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                this.createNotificationChime();
            }
        } catch (error) {
            console.error('Error playing notification sound:', error.message);
        }
    }

    /**
     * Create notification chime pattern (pleasant two-tone)
     * Gentle ding-dong for verification/info notifications
     */
    createNotificationChime() {
        if (!this.audioContext || !this.gainNode) return;

        try {
            if (this.oscillator) {
                this.oscillator.stop();
                this.oscillator.disconnect();
            }

            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sine';

            this.oscillator.connect(this.gainNode);

            const now = this.audioContext.currentTime;
            const beepDuration = 0.15; // 150ms beeps
            const silence = 0.1; // 100ms silence

            // Pleasant two-tone pattern: 880Hz (A5) -> 660Hz (E5)
            const times = [
                { time: now, freq: 880, gain: this.volume * 0.8 }, // High tone
                { time: now + beepDuration, freq: 880, gain: 0 },
                { time: now + beepDuration + silence, freq: 660, gain: this.volume * 0.8 }, // Low tone
                { time: now + 2 * beepDuration + silence, freq: 660, gain: 0 }
            ];

            times.forEach(t => {
                this.oscillator.frequency.setValueAtTime(t.freq, t.time);
                this.gainNode.gain.setValueAtTime(t.gain, t.time);
            });

            this.oscillator.start(now);
            this.oscillator.stop(now + 2 * beepDuration + silence);

            setTimeout(() => {
                this.oscillator = null;
            }, (2 * beepDuration + silence) * 1000);
        } catch (error) {
            console.error('Error creating notification chime:', error);
            this.oscillator = null;
        }
    }

    /**
     * Create emergency beep pattern (urgent, fast)
     * 3 quick high-frequency beeps for SOS/Emergency
     */
    createEmergencyBeep() {
        if (!this.audioContext || !this.gainNode) return;

        try {
            if (this.oscillator) {
                this.oscillator.stop();
                this.oscillator.disconnect();
            }

            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sine';

            this.oscillator.connect(this.gainNode);

            const now = this.audioContext.currentTime;
            const beepDuration = 0.12; // 120ms beeps (shorter = more urgent)
            const silence = 0.08; // 80ms silence (shorter = more urgent)

            // High frequency emergency pattern: 1000, 1200, 1000 Hz
            const times = [
                { time: now, freq: 1000, gain: this.volume * 1.2 }, // Boost volume
                { time: now + beepDuration, freq: 1000, gain: 0 },
                { time: now + beepDuration + silence, freq: 1200, gain: this.volume * 1.2 },
                { time: now + 2 * beepDuration + silence, freq: 1200, gain: 0 },
                { time: now + 2 * beepDuration + 2 * silence, freq: 1000, gain: this.volume * 1.2 },
                { time: now + 3 * beepDuration + 2 * silence, freq: 1000, gain: 0 }
            ];

            times.forEach(t => {
                this.oscillator.frequency.setValueAtTime(t.freq, t.time);
                this.gainNode.gain.setValueAtTime(Math.min(t.gain, 1.0), t.time); // Cap at max
            });

            this.oscillator.start(now);
            this.oscillator.stop(now + 3 * beepDuration + 2 * silence);

            setTimeout(() => {
                this.oscillator = null;
            }, (3 * beepDuration + 2 * silence) * 1000);
        } catch (error) {
            console.error('Error creating emergency beep:', error);
            this.oscillator = null;
        }
    }

    /**
     * Create security alert beep pattern (steady, moderate)
     * 2 medium-frequency beeps for security issues
     */
    createSecurityBeep() {
        if (!this.audioContext || !this.gainNode) return;

        try {
            if (this.oscillator) {
                this.oscillator.stop();
                this.oscillator.disconnect();
            }

            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'square'; // Different waveform for distinction

            this.oscillator.connect(this.gainNode);

            const now = this.audioContext.currentTime;
            const beepDuration = 0.2; // 200ms beeps (longer = less urgent)
            const silence = 0.15; // 150ms silence

            // Medium frequency security pattern: 600, 600 Hz (square wave)
            const times = [
                { time: now, freq: 600, gain: this.volume },
                { time: now + beepDuration, freq: 600, gain: 0 },
                { time: now + beepDuration + silence, freq: 600, gain: this.volume },
                { time: now + 2 * beepDuration + silence, freq: 600, gain: 0 }
            ];

            times.forEach(t => {
                this.oscillator.frequency.setValueAtTime(t.freq, t.time);
                this.gainNode.gain.setValueAtTime(t.gain, t.time);
            });

            this.oscillator.start(now);
            this.oscillator.stop(now + 2 * beepDuration + silence);

            setTimeout(() => {
                this.oscillator = null;
            }, (2 * beepDuration + silence) * 1000);
        } catch (error) {
            console.error('Error creating security beep:', error);
            this.oscillator = null;
        }
    }

    /**
     * Stop currently playing sound
     */
    stop() {
        if (this.alertSound) {
            this.alertSound.pause();
            this.alertSound.currentTime = 0;
        }
    }

    /**
     * Set volume level
     * @param {number} level - Volume level (0.0 to 1.0)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        if (this.alertSound) {
            this.alertSound.volume = this.volume;
        }
        this.savePreference();
    }

    /**
     * Toggle sound enabled/disabled
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.savePreference();
    }

    /**
     * Get user preference from localStorage
     * @returns {boolean}
     */
    getPreference() {
        const saved = localStorage.getItem('alertSoundEnabled');
        return saved !== null ? saved === 'true' : true; // Default enabled
    }

    /**
     * Save user preference to localStorage
     */
    savePreference() {
        localStorage.setItem('alertSoundEnabled', this.isEnabled.toString());
        localStorage.setItem('alertSoundVolume', this.volume.toString());
    }

    /**
     * Check if sound is enabled
     * @returns {boolean}
     */
    isAlertEnabled() {
        return this.isEnabled;
    }
}

// Export singleton instance
const audioService = new AudioService();
audioService.init();

export default audioService;
