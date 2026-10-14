# راهنمای ساخت و انتشار نسخهٔ iOS روی مک

شناسهٔ اپ (Bundle ID): **`com.espadna.amix`** · نام: **Amix** · نسخه: 0.1.0

> این مراحل روی مک خودتان انجام می‌شود. هر جا خطایی دیدید، متن کامل خطا را برایم بفرستید.

## ۱. پیش‌نیازها (یک بار)
1. **Xcode** را از App Store نصب کنید (آخرین نسخه). یک بار بازش کنید تا اجزای اضافه نصب شوند.
2. در ترمینال: `xcode-select --install`
3. **Node.js 22** یا جدیدتر را از nodejs.org نصب کنید، سپس در ترمینال:
   ```bash
   corepack enable
   corepack prepare pnpm@10.28.0 --activate
   ```
4. در Xcode → Settings → Accounts، اپل‌آیدی حساب Developer خود را اضافه کنید.

## ۲. دریافت کد و ساخت
```bash
git clone https://github.com/hajiheidari/amix.git
cd amix
git checkout claude/practical-wozniak-4lnmhs
pnpm install
pnpm build:native          # ساخت نسخهٔ وب برای اپ + همگام‌سازی با پروژهٔ iOS
cd apps/client && npx cap open ios
```
پروژه در Xcode باز می‌شود. به CocoaPods نیازی نیست، چون Capacitor 8 از Swift Package Manager استفاده می‌کند. بار اول چند دقیقه طول می‌کشد تا پکیج‌ها دانلود شوند.

## ۳. امضا (Signing)
1. در ستون چپ روی **App** (آیکون آبی) کلیک کنید. سپس Target **App** → زبانهٔ **Signing & Capabilities** را باز کنید.
2. گزینهٔ **Automatically manage signing** را روشن کنید و **Team** را حساب Developer خودتان انتخاب کنید.
3. مطمئن شوید Bundle Identifier برابر `com.espadna.amix` است. Xcode شناسه را خودکار در حساب شما ثبت می‌کند.

## ۴. اجرا روی آیفون
1. آیفون را با کابل وصل کنید و در گوشی **Trust** را بزنید.
2. در آیفون **Developer Mode** را روشن کنید: Settings → Privacy & Security → Developer Mode. گوشی یک بار ری‌استارت می‌شود.
3. در نوار بالای Xcode، آیفون خود را انتخاب کنید و ▶︎ (Run) را بزنید.

### چک‌لیست تست روی گوشی
- [ ] انتخاب فارسی و عربی، و درست بودن راست‌به‌چپ و ارقام
- [ ] ساخت حساب، محاسبهٔ حجم، ثبت معامله با خروج، و صفحهٔ تحلیل عملکرد
- [ ] بستن کامل اپ و باز کردن دوباره: داده‌ها باید باقی مانده باشند
- [ ] گرفتن پشتیبان: باید Share Sheet باز شود. فایل را در Files ذخیره کنید و بازیابی را تست کنید
- [ ] بزرگ کردن متن گوشی (Settings → Display & Brightness → Text Size)
- [ ] حالت تیره (Dark Mode)

## ۵. ساخت اپ در App Store Connect
appstoreconnect.apple.com → **Apps** → **+** → **New App**
- Platform: iOS
- Name: «Amix» (اگر گرفته شده بود، مثلاً «Amix Trading Journal»)
- Primary Language: به انتخاب خودتان
- Bundle ID: `com.espadna.amix`
- SKU: هر متن یکتا، مثلاً `amix-001`

## ۶. آپلود برای TestFlight
1. در Xcode، مقصد را **Any iOS Device (arm64)** بگذارید.
2. Product → **Archive** را بزنید.
3. در پنجرهٔ Organizer: **Distribute App** → **App Store Connect** → **Upload**.
4. بعد از پردازش (۱۰ تا ۳۰ دقیقه)، در App Store Connect → TestFlight خودتان را تستر داخلی اضافه کنید و اپ TestFlight را روی آیفون نصب کنید.
5. برای هر آپلود بعدی باید **Build** را یکی بالا ببرید: Target App → General → Identity → Build.

## ۷. پیش از ارسال برای بررسی اپل (فقط با تصمیم خودتان)
- **Privacy Policy URL**: اپل برای همهٔ اپ‌ها لینک سیاست حریم خصوصی می‌خواهد. متن آماده در `docs/privacy-policy.md` است و باید آن را در یک آدرس عمومی بگذارید.
- **App Privacy**: گزینهٔ «Data Not Collected» را بزنید. اپ هیچ داده‌ای جمع نمی‌کند و همه‌چیز روی گوشی می‌ماند.
- **Category**: Finance (یا Productivity).
- **اسکرین‌شات**: حداقل برای آیفون ۶٫۹ اینچ. از Simulator در Xcode می‌توانید بگیرید.
- **توضیحات** به سه زبان (متن پیشنهادی را می‌توانم آماده کنم).
- **Review Notes** (متن پیشنهادی):
  > Amix is an offline calculator and personal trading journal. It does not provide brokerage, investment advice, trading signals, order execution or any financial service, and requires no login. All data stays on the device. Built-in instrument examples are labeled illustrative.
- نکته: اپل اپ‌هایی را که «خدمات مالی تنظیم‌شده» ارائه می‌دهند فقط از حساب شرکتی می‌پذیرد (Guideline 5.1.1). Amix چنین خدمتی ارائه نمی‌دهد، و متن بالا همین را برای بازبین روشن می‌کند.

## ۸. به‌روزرسانی‌های بعدی
```bash
git pull
pnpm install
pnpm build:native
```
بعد در Xcode، Build را بالا ببرید و دوباره Archive و Upload کنید.

## نکتهٔ مهم دربارهٔ داده‌ها
داده‌ها در حافظهٔ داخلی اپ روی همان گوشی است. حذف اپ یعنی حذف همهٔ داده‌ها، پس به کاربران یادآوری کنید پشتیبان بگیرند.
