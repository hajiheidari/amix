# ساخت اپ‌ها با GitHub (بدون نیاز به مک یا لینوکس)

همهٔ بیلدها روی سرورهای GitHub انجام می‌شوند. از ویندوز فقط به مرورگر نیاز دارید.
مسیر: مخزن `hajiheidari/amix` ← زبانهٔ **Actions**.

| Workflow | کار | اجرا |
|---|---|---|
| **CI** | تایپ‌چک، lint، تست‌ها و بیلد وب | خودکار با هر push |
| **Android APK** | ساخت APK اندروید | دستی (Run workflow) یا با تگ `v0.1.0` |
| **iOS** | کامپایل iOS روی مک ابری؛ با گزینهٔ upload، امضا و ارسال به TestFlight | فقط دستی |

> **هزینه:** در مخزن خصوصی، هر دقیقهٔ مک ۱۰ دقیقه از سهمیهٔ ماهانهٔ رایگان GitHub کم می‌کند. هر بیلد iOS حدود ۱۰ تا ۲۰ دقیقه طول می‌کشد، یعنی ۱۰۰ تا ۲۰۰ دقیقه از سهمیه. وضعیت را در Settings → Billing ببینید. اگر روش پرداخت ثبت نکرده باشید، با تمام شدن سهمیه بیلدها فقط متوقف می‌شوند.

## اندروید
### نسخهٔ تستی (بدون تنظیمات)
Actions → **Android APK** → **Run workflow**. بعد از اتمام، در صفحهٔ همان اجرا بخش **Artifacts** ← `amix-android` را دانلود کنید. داخلش فایل APK و چک‌سام SHA‑256 هست.

### نسخهٔ امضاشده برای انتشار (یک بار تنظیم)
1. روی ویندوز JDK نصب کنید (مثلاً Temurin 21 از adoptium.net). سپس در PowerShell:
   ```powershell
   keytool -genkeypair -v -keystore amix-release.jks -alias amix -keyalg RSA -keysize 4096 -validity 10000
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("amix-release.jks")) | Set-Content amix-release.b64.txt
   ```
   **فایل `amix-release.jks` و رمزش را چند جای امن نگه دارید.** بدون آن هیچ‌وقت نمی‌توانید نسخهٔ بعدی را منتشر کنید.
2. در مخزن: Settings → Secrets and variables → Actions → **New repository secret**. این چهار مورد را اضافه کنید:
   - `ANDROID_KEYSTORE_BASE64`: کل محتوای `amix-release.b64.txt`
   - `ANDROID_KEYSTORE_PASSWORD`: رمز keystore
   - `ANDROID_KEY_ALIAS`: `amix`
   - `ANDROID_KEY_PASSWORD`: رمز کلید (اگر جدا تعیین نکردید، همان رمز keystore)
3. از این به بعد، Android APK خودکار نسخهٔ **release امضاشده** می‌سازد.

## iOS و TestFlight
### یک بار تنظیم (همه از مرورگر)
1. **ثبت شناسه:** developer.apple.com → Certificates, IDs & Profiles → **Identifiers** → **+** → App IDs → App. در Bundle ID گزینهٔ Explicit را بزنید و `com.espadna.amix` را وارد کنید.
2. **ساخت اپ:** appstoreconnect.apple.com → Apps → **+ New App**. پلتفرم iOS، نام Amix و Bundle ID `com.espadna.amix` را بگذارید. برای SKU هم یک متن یکتا مثل `amix-001`.
3. **کلید API:** App Store Connect → Users and Access → **Integrations** → App Store Connect API → **Team Keys** → **+**. نقش را **Admin** بگذارید، چون امضای خودکار ابری به آن نیاز دارد. فایل `.p8` را دانلود کنید (فقط یک بار قابل دانلود است). **Key ID** و **Issuer ID** را هم یادداشت کنید.
4. **Team ID:** developer.apple.com → Account → Membership details → Team ID.
5. در GitHub، Settings → Secrets and variables → Actions این چهار secret را اضافه کنید:
   - `APPLE_TEAM_ID`
   - `ASC_KEY_ID`
   - `ASC_ISSUER_ID`
   - `ASC_KEY_P8`: کل متن فایل `.p8` را با Notepad باز کنید و همه را کپی کنید، از خط `-----BEGIN PRIVATE KEY-----` تا `-----END PRIVATE KEY-----`

### اجرا
- **بررسی بیلد (بدون امضا):** Actions → **iOS** → Run workflow، با گزینهٔ upload خاموش.
- **ارسال به TestFlight:** همان مسیر، با تیک **Sign and upload to TestFlight**. شمارهٔ Build خودکار با هر اجرا بالا می‌رود. بعد از ۱۰ تا ۳۰ دقیقه پردازش، بیلد در App Store Connect → TestFlight دیده می‌شود. خودتان را تستر داخلی کنید و با اپ TestFlight روی آیفون نصب کنید.

ارسال نهایی برای بررسی اپل (Submit for Review) را خودتان در App Store Connect انجام می‌دهید. نکات لازم (سیاست حریم خصوصی، اسکرین‌شات‌ها، متن Review Notes) در بخش ۷ فایل `ios-guide-fa.md` آمده است.

## امنیت
- secretها هرگز در لاگ‌ها نمایش داده نمی‌شوند و فایل‌های کلید بعد از بیلد پاک می‌شوند.
- فایل keystore و کلید `.p8` را هرگز داخل مخزن commit نکنید.
