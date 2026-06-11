/**
 * Notification Sound Generator
 * 
 * This creates simple beep sounds for notifications
 * Run this once to generate the sound files
 */

const fs = require('fs');
const path = require('path');

// Create public/sounds directory if it doesn't exist
const soundsDir = path.join(__dirname, '..', 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
  console.log('✅ Created sounds directory:', soundsDir);
}

// Generate emergency alarm sound (loud, repeating tone)
const generateEmergencySound = () => {
  console.log('🔊 Generating emergency alarm sound...');
  
  // Simple WAV file with 880Hz tone (high-pitched alarm)
  const sampleRate = 44100;
  const duration = 2; // 2 seconds
  const frequency = 880; // Hz (A5 note - attention-grabbing)
  
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  // Generate samples (square wave for alarm effect)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Square wave with modulation for alarm effect
    const modulation = Math.sin(2 * Math.PI * 4 * t); // 4Hz modulation
    const sample = Math.sign(Math.sin(2 * Math.PI * frequency * t)) * modulation * 32767;
    buffer.writeInt16LE(Math.floor(sample), offset);
    offset += 2;
  }
  
  fs.writeFileSync(path.join(soundsDir, 'emergency-alarm.mp3'), buffer);
  console.log('✅ Emergency alarm generated');
};

// Generate normal notification sound (pleasant single beep)
const generateNormalSound = () => {
  console.log('🔔 Generating normal notification sound...');
  
  // Simple WAV file with 523Hz tone (C5 note - pleasant)
  const sampleRate = 44100;
  const duration = 0.5; // 0.5 seconds
  const frequency = 523.25; // Hz (C5 note)
  
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  // Generate samples (sine wave with fade out)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fadeOut = 1 - (t / duration); // Linear fade out
    const sample = Math.sin(2 * Math.PI * frequency * t) * fadeOut * 32767;
    buffer.writeInt16LE(Math.floor(sample), offset);
    offset += 2;
  }
  
  fs.writeFileSync(path.join(soundsDir, 'notification-beep.mp3'), buffer);
  console.log('✅ Normal notification sound generated');
};

// Generate both sounds
try {
  generateEmergencySound();
  generateNormalSound();
  console.log('\n✅ All notification sounds generated successfully!');
  console.log('📁 Location:', soundsDir);
} catch (error) {
  console.error('❌ Error generating sounds:', error);
}
