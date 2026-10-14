# Native builds: Android (direct APK) and iOS (App Store)

Both apps are Capacitor 8 shells around the same web build (`apps/client/dist`). Native builds disable the service worker (`TC_TARGET=native`). Exports use the system share sheet.

App id: `com.espadna.amix` · name: **Amix** · version 0.1.0.

## Android — direct APK download (outside Cafe Bazaar / Play)
Requirements: JDK 21, Android SDK (platform 36, build-tools 36, platform-tools), `ANDROID_HOME` set. Gradle is downloaded by the wrapper.

```bash
export ANDROID_HOME=/path/to/android-sdk
pnpm install
pnpm android:debug        # → apps/client/android/app/build/outputs/apk/debug/app-debug.apk
```

### Signed release APK (for distribution)
1. The **owner** creates a keystore once and keeps it safe (losing it makes future updates impossible; never commit it):
   ```bash
   keytool -genkeypair -v -keystore amix-release.jks -alias amix -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Create `apps/client/android/keystore.properties` (git-ignored):
   ```properties
   storeFile=/absolute/path/amix-release.jks
   storePassword=…
   keyAlias=amix
   keyPassword=…
   ```
3. `pnpm android:release` → `app/build/outputs/apk/release/app-release.apk`.
4. Publish the APK with its SHA‑256 (`sha256sum app-release.apk`) and short install notes in fa/ar/en ("Allow installs from this source"). Every update must be signed with the same key and have a higher `versionCode` (`android/app/build.gradle`).

Debug APKs are signed with a throwaway debug key: fine for testing, **not** for public distribution.

## iOS — App Store

Step-by-step guide in Persian: [`ios-guide-fa.md`](ios-guide-fa.md).
Requires macOS with an Xcode version supported by Capacitor 8, an Apple Developer account (owner decision; paid), and CocoaPods is **not** needed (Capacitor 8 uses Swift Package Manager).

```bash
pnpm install
pnpm build:native          # builds web assets with TC_TARGET=native and runs cap sync
cd apps/client && npx cap open ios
```
In Xcode: select the team, confirm the bundle id, run on a device, then Product → Archive → distribute via TestFlight/App Store Connect. `Info.plist` declares en/fa/ar localizations and `ITSAppUsesNonExemptEncryption = false`.

## Status in this environment
See `docs/status.md` for what was actually built and tested here.
