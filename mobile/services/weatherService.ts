/**
 * weatherService.ts
 *
 * Fetches real-time weather from WeatherAPI.com
 *
 * Strategy:
 *   1. Return in-memory cache if < 5 min old
 *   2. Call WeatherAPI.com /forecast endpoint
 *   3. Throw errors instead of silent fallback to mock data
 *   4. UI layer handles errors and shows appropriate messages
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface WeatherData {
  temperature: number;
  condition: string;
  description: string;
  icon: string;
  rainProbability: number; // 0–100 %
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  isDaytime: boolean;
  sunrise: number;
  sunset: number;
  isMock?: boolean;
  location?: string;
  lastUpdated?: string;
}

const BASE_URL = 'https://api.weatherapi.com/v1';
const CACHE_KEY = '@weather_cache_v3';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class WeatherService {
  private apiKey: string;
  private memCache: WeatherData | null = null;
  private memCacheTime = 0;

  constructor() {
    // Load API key from environment with proper fallback
    this.apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY || '';

    // Validate API key
    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE') {
      console.error('❌ WEATHER API KEY NOT CONFIGURED');
      console.error('Set EXPO_PUBLIC_WEATHER_API_KEY in your .env file');
      console.error('Get a free API key at: https://www.weatherapi.com/signup.aspx');
    } else {
      console.log('✅ Weather API key loaded:', this.apiKey.substring(0, 8) + '...');
      console.log('📝 Full key length:', this.apiKey.length, 'characters');
    }

    this.loadDiskCache();
  }

  // ── Disk cache ──────────────────────────────────────────────────────────────
  private async loadDiskCache(): Promise<void> {
    if (Platform.OS === 'web') return; // sessionStorage not needed; skip
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) {
        this.memCache = data;
        this.memCacheTime = ts;
        console.log('📦 Loaded weather cache from disk');
      }
    } catch { /* ignore */ }
  }

  private async saveDiskCache(data: WeatherData): Promise<void> {
    this.memCache = data;
    this.memCacheTime = Date.now();
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: this.memCacheTime }));
      console.log('💾 Saved weather data to cache');
    } catch { /* ignore */ }
  }

  // ── Main fetch ──────────────────────────────────────────────────────────────
  private async fetchWeatherAPI(query: string, forceRefresh = false): Promise<WeatherData | null> {
    // 1. Return memory cache if fresh
    if (!forceRefresh && this.memCache && Date.now() - this.memCacheTime < CACHE_TTL) {
      console.log('☁️ Using cached weather data (age: ' + Math.round((Date.now() - this.memCacheTime) / 1000) + 's)');
      return { ...this.memCache, lastUpdated: new Date(this.memCacheTime).toISOString() };
    }

    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE') {
      const error = 'Weather API key not configured. Get a free key at https://www.weatherapi.com/signup.aspx';
      console.error('❌', error);
      throw new Error(error);
    }

    try {
      const url = `${BASE_URL}/forecast.json?key=${this.apiKey}&q=${query}&days=1&aqi=no&alerts=no`;
      console.log('🌍 Fetching weather from:', url.replace(this.apiKey, 'API_KEY'));

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');

        if (res.status === 401 || res.status === 403) {
          const error = `Weather API authentication failed (${res.status}): Invalid or expired API key. Please get a new key from https://www.weatherapi.com/my/`;
          console.error('❌', error);
          console.error('Response:', errorText);
          console.error('API Key used:', this.apiKey.substring(0, 8) + '...' + this.apiKey.substring(this.apiKey.length - 4));
          throw new Error(error);
        } else if (res.status === 400) {
          const error = `Weather API bad request (${res.status}): ${errorText}`;
          console.error('❌', error);
          throw new Error(error);
        } else if (res.status === 429) {
          const error = `Weather API rate limit exceeded (${res.status}). Please wait a moment and try again.`;
          console.error('❌', error);
          throw new Error(error);
        } else {
          const error = `Weather API error (${res.status}): ${errorText}`;
          console.error('❌', error);
          throw new Error(error);
        }
      }

      const json = await res.json();
      console.log('✅ Weather API response received');

      // Validate response structure
      if (!json.current || !json.location) {
        console.error('❌ Invalid weather API response structure:', json);
        throw new Error('Invalid weather data structure from API');
      }

      const rainProbability = json.forecast?.forecastday?.[0]?.day?.daily_chance_of_rain ?? 0;

      const nowSec = Date.now() / 1000;
      const isDaytime = json.current.is_day === 1;

      // Parse sunrise/sunset roughly
      let sunrise = nowSec - 3600;
      let sunset = nowSec + 3600;
      try {
        const astro = json.forecast?.forecastday?.[0]?.astro;
        if (astro?.sunrise && astro?.sunset) {
          const parseTime = (t: string) => {
            const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!match) return nowSec;
            let h = parseInt(match[1]);
            const m = parseInt(match[2]);
            if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
            if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
            const d = new Date();
            d.setHours(h, m, 0, 0);
            return d.getTime() / 1000;
          };
          sunrise = parseTime(astro.sunrise);
          sunset = parseTime(astro.sunset);
        }
      } catch (e) {
        console.warn('⚠️ Could not parse sunrise/sunset times');
      }

      // WeatherAPI icon url starts with //cdn.weatherapi.com
      let iconStr = json.current.condition.icon || '';
      if (iconStr.startsWith('//')) iconStr = 'https:' + iconStr;

      const data: WeatherData = {
        temperature: Math.round(json.current.temp_c),
        condition: json.current.condition.text,
        description: json.current.condition.text,
        icon: iconStr,
        rainProbability,
        humidity: json.current.humidity,
        windSpeed: Math.round((json.current.wind_kph * 1000) / 3600 * 10) / 10,
        feelsLike: Math.round(json.current.feelslike_c),
        isDaytime,
        sunrise,
        sunset,
        location: json.location?.name || 'Current Location',
        isMock: false,
        lastUpdated: new Date().toISOString(),
      };

      console.log('✅ Weather data parsed:', {
        temp: data.temperature + '°C',
        condition: data.condition,
        humidity: data.humidity + '%',
        rain: data.rainProbability + '%',
        location: data.location,
      });

      await this.saveDiskCache(data);
      return data;

    } catch (err: any) {
      console.error('❌ Weather fetch failed:', err?.message || err);

      // Re-throw the error instead of falling back to mock data
      // This allows the UI to handle the error appropriately
      throw err;
    }
  }

  async getWeatherByCoordinates(lat: number, lon: number, forceRefresh = false): Promise<WeatherData | null> {
    return this.fetchWeatherAPI(`${lat},${lon}`, forceRefresh);
  }

  async getWeatherByCity(city: string): Promise<WeatherData | null> {
    return this.fetchWeatherAPI(encodeURIComponent(city));
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  async clearCache(): Promise<void> {
    this.memCache = null;
    this.memCacheTime = 0;
    try { await AsyncStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

  getCacheStatus() {
    return {
      hasCache: !!this.memCache,
      ageSeconds: this.memCacheTime ? Math.round((Date.now() - this.memCacheTime) / 1000) : null,
      isValid: !!this.memCache && Date.now() - this.memCacheTime < CACHE_TTL,
    };
  }
}

export default new WeatherService();
