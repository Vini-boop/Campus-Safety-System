#!/bin/bash

# Campus Safety App - APK Build Script
# This script automates the APK build process using EAS Build

set -e  # Exit on error

echo "🏗️  Campus Safety App - APK Build Script"
echo "=========================================="
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI is not installed"
    echo "📦 Installing EAS CLI..."
    npm install -g eas-cli
    echo "✅ EAS CLI installed successfully"
else
    echo "✅ EAS CLI is already installed"
fi

echo ""
echo "🔐 Checking Expo authentication..."

# Check if user is logged in
if ! eas whoami &> /dev/null; then
    echo "❌ Not logged in to Expo"
    echo "🔑 Please login to your Expo account:"
    eas login
else
    EXPO_USER=$(eas whoami)
    echo "✅ Logged in as: $EXPO_USER"
fi

echo ""
echo "📋 Select build profile:"
echo "  1) Preview (APK for testing - Recommended)"
echo "  2) Development (APK with debugging)"
echo "  3) Production (AAB for Play Store)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        PROFILE="preview"
        echo "🎯 Building Preview APK..."
        ;;
    2)
        PROFILE="development"
        echo "🎯 Building Development APK..."
        ;;
    3)
        PROFILE="production"
        echo "🎯 Building Production AAB..."
        ;;
    *)
        echo "❌ Invalid choice. Defaulting to Preview."
        PROFILE="preview"
        ;;
esac

echo ""
echo "🔍 Checking environment configuration..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "   Make sure all environment variables are configured"
fi

# Check if google-services.json exists
if [ ! -f "android/app/google-services.json" ]; then
    echo "⚠️  Warning: google-services.json not found in android/app/"
    echo "   Firebase services may not work correctly"
fi

echo ""
echo "🚀 Starting EAS Build..."
echo "   Profile: $PROFILE"
echo "   Platform: Android"
echo ""

# Start the build
eas build --platform android --profile $PROFILE

echo ""
echo "✅ Build submitted successfully!"
echo ""
echo "📱 Next steps:"
echo "   1. Wait for the build to complete (10-20 minutes)"
echo "   2. Download the APK from the provided link"
echo "   3. Install on your Android device"
echo ""
echo "🔗 View build status: https://expo.dev/accounts/$(eas whoami)/projects/mobile/builds"
echo ""
