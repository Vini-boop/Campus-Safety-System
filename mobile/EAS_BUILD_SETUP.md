# EAS Build Setup - Final Steps

## ✅ Configuration Complete!

All necessary files have been configured for EAS Build. Now you just need to add the google-services.json secret to EAS.

## 📤 Step 1: Upload google-services.json Secret

The base64 encoded string has been copied to your clipboard!

### Manual Steps:

1. **Go to EAS Environment Variables page:**
   ```
   https://expo.dev/accounts/simbariu/projects/mobile/environment-variables
   ```

2. **Click "Create Variable"**

3. **Fill in the form:**
   - **Name:** `GOOGLE_SERVICES_JSON`
   - **Value:** Paste the base64 string from your clipboard (or run `./upload-google-services.ps1` again)
   - **Visibility:** Select **"Secret"** (important!)
   - **Environment:** Select **"All"** or choose specific environments

4. **Click "Save"**

### Base64 String (if needed):

```
ewogICJwcm9qZWN0X2luZm8iOiB7CiAgICAicHJvamVjdF9udW1iZXIiOiAiNzk2NzQ4NTAwMzA0IiwKICAgICJwcm9qZWN0X2lkIjogInNhZmV0eS1tYW5hZ2VtZW50LXN5c3RlbS00ZmFmMCIsCiAgICAic3RvcmFnZV9idWNrZXQiOiAic2FmZXR5LW1hbmFnZW1lbnQtc3lzdGVtLTRmYWYwLmZpcmViYXNlc3RvcmFnZS5hcHAiCiAgfSwKICAiY2xpZW50IjogWwogICAgewogICAgICAiY2xpZW50X2luZm8iOiB7CiAgICAgICAgIm1vYmlsZXNka19hcHBfaWQiOiAiMTo3OTY3NDg1MDAzMDQ6YW5kcm9pZDpmNzk2OGJmNGI2YjhkNDQ3ZWRiMDU1IiwKICAgICAgICAiYW5kcm9pZF9jbGllbnRfaW5mbyI6IHsKICAgICAgICAgICJwYWNrYWdlX25hbWUiOiAiY29tLmNhbXB1c3NhZmV0eS5hcHAiCiAgICAgICAgfQogICAgICB9LAogICAgICAib2F1dGhfY2xpZW50IjogWwogICAgICAgIHsKICAgICAgICAgICJjbGllbnRfaWQiOiAiNzk2NzQ4NTAwMzA0LTV1YThocWQ2bHFvZ2hpMXBxOGszOHYyOGFoczRlYzZkLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwKICAgICAgICAgICJjbGllbnRfdHlwZSI6IDMKICAgICAgICB9CiAgICAgIF0sCiAgICAgICJhcGlfa2V5IjogWwogICAgICAgIHsKICAgICAgICAgICJjdXJyZW50X2tleSI6ICJBSXphU3lBRmV6X1JtYUd2Mm1QbGZBd1dmMW92V1loLWNtUU1Xb3ciCiAgICAgICAgfQogICAgICBdLAogICAgICAic2VydmljZXMiOiB7CiAgICAgICAgImFwcGludml0ZV9zZXJ2aWNlIjogewogICAgICAgICAgIm90aGVyX3BsYXRmb3JtX29hdXRoX2NsaWVudCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJjbGllbnRfaWQiOiAiNzk2NzQ4NTAwMzA0LTV1YThocWQ2bHFvZ2hpMXBxOGszOHYyOGFoczRlYzZkLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwKICAgICAgICAgICAgICAiY2xpZW50X3R5cGUiOiAzCiAgICAgICAgICAgIH0KICAgICAgICAgIF0KICAgICAgICB9CiAgICAgIH0KICAgIH0KICBdLAogICJjb25maWd1cmF0aW9uX3ZlcnNpb24iOiAiMSIKfQ==
```

## 🚀 Step 2: Build Your APK

Once the secret is added, run:

```bash
cd mobile
eas build --platform android --profile preview
```

## 📋 What Happens During Build:

1. **EAS receives your code** from git
2. **Pre-install hook runs** (`eas-hooks/eas-build-pre-install.sh`)
3. **Hook decodes** the `GOOGLE_SERVICES_JSON` secret
4. **File is created** at `android/app/google-services.json`
5. **Build proceeds** with Firebase configuration
6. **APK is generated** and ready for download

## ✅ Verification

After adding the secret, you can verify it's set:

```bash
eas env:list
```

You should see:
```
GOOGLE_SERVICES_JSON (Secret) - All environments
```

## 🎯 Build Commands

### Preview Build (Testing)
```bash
eas build --platform android --profile preview
```

### Development Build (Debugging)
```bash
eas build --platform android --profile development
```

### Production Build (Play Store)
```bash
eas build --platform android --profile production
```

## 📱 After Build Completes

1. **Download APK** from the link provided
2. **Transfer to Android device**
3. **Enable "Install from Unknown Sources"**
4. **Install and test**

## 🔧 Troubleshooting

### Secret Not Found Error
- Make sure you set the visibility to "Secret"
- Verify the variable name is exactly: `GOOGLE_SERVICES_JSON`
- Check it's enabled for the correct environment

### Build Still Fails
- Check build logs in Expo dashboard
- Verify the base64 string is complete
- Try re-creating the secret

### Hook Not Running
- Ensure `eas-hooks/eas-build-pre-install.sh` is committed to git
- Check the file has execute permissions (should be automatic)

## 📚 Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Environment Variables](https://docs.expo.dev/eas/environment-variables/)
- [File Environment Variables](https://docs.expo.dev/eas/environment-variables/#file-environment-variables)

## 🎉 You're All Set!

Once you add the secret to EAS, your build will work perfectly. The google-services.json file will be securely injected during the build process without being committed to your repository.
