import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.espadna.amix',
  appName: 'Amix',
  webDir: 'dist',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
};

export default config;
