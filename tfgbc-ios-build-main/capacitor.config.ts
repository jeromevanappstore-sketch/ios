import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.tfgbc.churchmanagement',
  appName: 'TFGBC',
  webDir: 'www',
  backgroundColor: '#060D24',
  loggingBehavior: 'none',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Explicit CapacitorHttp requests work without globally patching fetch/XHR.
    CapacitorHttp: { enabled: false },
    // Server auth cookies travel through explicit native HTTP requests.
    CapacitorCookies: { enabled: false },
  },
};

// There is deliberately no server.url: application UI is bundled in each binary.
export default config;
