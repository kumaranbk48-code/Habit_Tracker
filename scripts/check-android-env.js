#!/usr/bin/env node
/**
 * Guard script for Android/Capacitor builds.
 * Verifies that VITE_API_URL is configured and uses https://.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });
dotenv.config();

const apiUrl = process.env.VITE_API_URL || process.env.VITE_API_BASE_URL;

if (!apiUrl) {
  console.error('\n❌ ERROR: VITE_API_URL is missing!');
  console.error('Android builds require VITE_API_URL set to your production backend URL (e.g. https://your-domain.com).');
  console.error('Without it, the Android APK calls https://localhost/api and fails.\n');
  process.exit(1);
}

if (!apiUrl.startsWith('https://')) {
  console.error('\n❌ ERROR: VITE_API_URL must start with https://');
  console.error(`Received: ${apiUrl}`);
  console.error('Cleartext HTTP is disabled on Android release builds for security.\n');
  process.exit(1);
}

console.log(`✅ Android build environment verified: VITE_API_URL = ${apiUrl}`);

