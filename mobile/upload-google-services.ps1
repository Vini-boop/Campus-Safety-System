# Script to upload google-services.json to EAS as a secret

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Uploading google-services.json to EAS Secrets" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if google-services.json exists
if (-not (Test-Path "google-services.json")) {
    Write-Host "ERROR: google-services.json not found in current directory" -ForegroundColor Red
    Write-Host "Please run this script from the mobile directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Found google-services.json" -ForegroundColor Green

# Encode to base64
Write-Host "[INFO] Encoding file to base64..." -ForegroundColor Yellow
$filePath = Join-Path $PSScriptRoot "google-services.json"
$base64Content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($filePath))

Write-Host "[OK] File encoded successfully" -ForegroundColor Green
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "1. Go to: https://expo.dev/accounts/simbariu/projects/mobile/environment-variables"
Write-Host "2. Click 'Create Variable'"
Write-Host "3. Set the following:"
Write-Host "   - Name: GOOGLE_SERVICES_JSON"
Write-Host "   - Value: (paste the base64 string below)"
Write-Host "   - Visibility: Secret"
Write-Host "   - Environment: All (or specific environments)"
Write-Host ""
Write-Host "4. Copy this base64 string:" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host $base64Content
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The base64 string has been copied to your clipboard!" -ForegroundColor Green
$base64Content | Set-Clipboard
Write-Host ""
Write-Host "After adding the secret, run:" -ForegroundColor Yellow
Write-Host "  eas build --platform android --profile preview" -ForegroundColor White
Write-Host ""
