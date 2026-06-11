#!/usr/bin/env bash

# Script to upload google-services.json to EAS as a secret

set -e

echo "📤 Uploading google-services.json to EAS Secrets"
echo "================================================"

# Check if google-services.json exists
if [ ! -f "google-services.json" ]; then
    echo "❌ ERROR: google-services.json not found in current directory"
    echo "   Please run this script from the mobile directory"
    exit 1
fi

echo "✅ Found google-services.json"

# Encode to base64
echo "🔐 Encoding file to base64..."
BASE64_CONTENT=$(base64 -w 0 google-services.json 2>/dev/null || base64 google-services.json)

echo "✅ File encoded successfully"
echo ""
echo "📋 Next steps:"
echo "1. Go to: https://expo.dev/accounts/simbariu/projects/mobile/environment-variables"
echo "2. Click 'Create Variable'"
echo "3. Set the following:"
echo "   - Name: GOOGLE_SERVICES_JSON"
echo "   - Value: (paste the base64 string below)"
echo "   - Visibility: Secret"
echo "   - Environment: All (or specific environments)"
echo ""
echo "4. Copy this base64 string:"
echo "================================================"
echo "$BASE64_CONTENT"
echo "================================================"
echo ""
echo "After adding the secret, run: eas build --platform android --profile preview"
