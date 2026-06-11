/**
 * Test Weather API Key
 * 
 * Run this script to verify your Weather API key is working:
 * node mobile/scripts/test-weather-api.js
 */

const API_KEY = 'cf6df6653a2b4814b8744642262804'; // Replace with your key
const BASE_URL = 'https://api.weatherapi.com/v1';

async function testWeatherAPI() {
    console.log('🧪 Testing Weather API...\n');
    console.log('API Key:', API_KEY.substring(0, 8) + '...' + API_KEY.substring(API_KEY.length - 4));
    console.log('Key Length:', API_KEY.length, 'characters\n');

    // Test coordinates (Nyahururu, Shamane - Laikipia University)
    const lat = -0.0358;
    const lon = 36.3683;
    const query = `${lat},${lon}`;

    const url = `${BASE_URL}/forecast.json?key=${API_KEY}&q=${query}&days=1&aqi=no&alerts=no`;

    console.log('📍 Testing location: Nyahururu, Shamane (Laikipia University)');
    console.log('📍 Coordinates:', query);
    console.log('🌐 Request URL:', url.replace(API_KEY, 'API_KEY') + '\n');

    try {
        console.log('⏳ Sending request...\n');

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        console.log('📥 Response Status:', response.status, response.statusText);
        console.log('📋 Response Headers:');
        response.headers.forEach((value, key) => {
            console.log(`   ${key}: ${value}`);
        });
        console.log('');

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Request Failed!\n');
            console.error('Status:', response.status);
            console.error('Error:', errorText);
            console.error('\n💡 Solutions:');

            if (response.status === 401 || response.status === 403) {
                console.error('   1. Your API key is invalid or expired');
                console.error('   2. Get a new key at: https://www.weatherapi.com/signup.aspx');
                console.error('   3. Update the API_KEY constant in this script');
                console.error('   4. Update EXPO_PUBLIC_WEATHER_API_KEY in mobile/.env');
            } else if (response.status === 400) {
                console.error('   1. Check the location coordinates are valid');
                console.error('   2. Verify the API endpoint URL is correct');
            } else if (response.status === 429) {
                console.error('   1. You have exceeded the rate limit');
                console.error('   2. Wait a few minutes and try again');
                console.error('   3. Free tier: 1 million calls/month');
            }

            process.exit(1);
        }

        const data = await response.json();

        console.log('✅ API Request Successful!\n');
        console.log('📊 Weather Data:');
        console.log('   Location:', data.location?.name, ',', data.location?.country);
        console.log('   Temperature:', data.current?.temp_c + '°C');
        console.log('   Condition:', data.current?.condition?.text);
        console.log('   Humidity:', data.current?.humidity + '%');
        console.log('   Wind Speed:', data.current?.wind_kph, 'km/h');
        console.log('   Feels Like:', data.current?.feelslike_c + '°C');
        console.log('   Is Daytime:', data.current?.is_day === 1 ? 'Yes' : 'No');

        if (data.forecast?.forecastday?.[0]) {
            const forecast = data.forecast.forecastday[0];
            console.log('   Rain Chance:', forecast.day?.daily_chance_of_rain + '%');
            console.log('   Sunrise:', forecast.astro?.sunrise);
            console.log('   Sunset:', forecast.astro?.sunset);
        }

        console.log('\n✅ Your Weather API key is working correctly!');
        console.log('💡 Next steps:');
        console.log('   1. Update EXPO_PUBLIC_WEATHER_API_KEY in mobile/.env');
        console.log('   2. Restart your Expo development server');
        console.log('   3. Test the weather widget in your app\n');

    } catch (error) {
        console.error('❌ Network Error!\n');
        console.error('Error:', error.message);
        console.error('\n💡 Solutions:');
        console.error('   1. Check your internet connection');
        console.error('   2. Verify the API endpoint is accessible');
        console.error('   3. Check if a firewall is blocking the request\n');
        process.exit(1);
    }
}

// Run the test
testWeatherAPI();
