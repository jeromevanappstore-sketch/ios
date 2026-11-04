import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface NativeBackDetail {
  /** The native WebView reports a previous browser-history entry. */
  canGoBack: boolean;
}

export interface TFGBCNativeBridge {
  readonly native: true;
  readonly platform: 'ios' | 'android';
  /** Native reports are shared as HTML files; this is not a native print API. */
  readonly printMode: 'share-html';
  download(name: string, text: string, mime: string): Promise<void>;
  print(html: string): Promise<void>;
}

export interface NativeBridgeOptions {
  /** At the root screen, Android Back can minimize only when explicitly enabled. */
  minimizeOnRootBack?: boolean;
}

declare global {
  interface Window {
    /** Absent in the browser, so the app retains its normal web download/print path. */
    TFGBCNative?: TFGBCNativeBridge;
  }
  interface WindowEventMap {
    /** Call preventDefault() synchronously when the app handles Back itself. */
    'tfgbc:native-back': CustomEvent<NativeBackDetail>;
  }
}

let installation: Promise<void> | undefined;
let exportNumber = 0;

function safeFilename(name: string, mime: string): string {
  const extensions: Record<string, string> = {
    'application/json': '.json',
    'text/csv': '.csv',
    'text/html': '.html',
    'text/plain': '.txt',
  };
  const extension = extensions[mime.split(';', 1)[0].trim().toLowerCase()] ?? '.txt';
  let filename = String(name)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '-')
    .replace(/^\.+|[. ]+$/g, '')
    .trim()
    .slice(0, 180);
  if (!filename) filename = 'tfgbc-export';
  if (!filename.toLowerCase().endsWith(extension)) filename += extension;
  return filename;
}

async function shareTextFile(name: string, text: string, mime: string): Promise<void> {
  if (typeof text !== 'string') throw new TypeError('Export content must be text.');
  const available = await Share.canShare();
  if (!available.value) throw new Error('File sharing is unavailable on this device.');

  const filename = safeFilename(name, mime);
  const path = `tfgbc-exports/${Date.now()}-${++exportNumber}/${filename}`;
  const result = await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({
    title: filename,
    dialogTitle: 'Save or share the TFGBC file',
    files: [result.uri],
  });
  // Do not delete immediately: the selected receiving app may read the URI later.
  // These files stay in the app's OS-managed cache, not public device storage.
}

/**
 * Install before the app's boot function. Browser calls are intentionally a no-op.
 * The app can close a modal or change views on tfgbc:native-back and preventDefault.
 * Unhandled Back navigates actual WebView history, then stays at the app root unless
 * the caller explicitly opts into minimizing. The bridge never force-exits the app.
 *
 * Filesystem on iOS requires the documented FileTimestamp privacy-manifest reason
 * C617.1. Cache files are shareable on Android without widening FileProvider paths.
 */
export function installNativeBridge(options: NativeBridgeOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
    return Promise.resolve();
  }
  if (installation) return installation;
  if (window.TFGBCNative) return Promise.resolve();

  installation = (async () => {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    if (platform === 'android') {
      await App.addListener('backButton', ({ canGoBack }) => {
        const event = new CustomEvent<NativeBackDetail>('tfgbc:native-back', {
          cancelable: true,
          detail: { canGoBack },
        });
        if (!window.dispatchEvent(event)) return;
        if (canGoBack) {
          window.history.back();
        } else if (options.minimizeOnRootBack === true) {
          void App.minimizeApp().catch((error: unknown) => {
            window.dispatchEvent(new CustomEvent('tfgbc:native-error', { detail: error }));
          });
        }
      });
    }

    window.TFGBCNative = Object.freeze({
      native: true as const,
      platform,
      printMode: 'share-html' as const,
      download: shareTextFile,
      async print(html: string): Promise<void> {
        const document = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/i.test(html)
          ? html
          : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TFGBC report</title></head><body>${html}</body></html>`;
        await shareTextFile('tfgbc-report.html', document, 'text/html');
      },
    });
  })();

  installation = installation.catch((error: unknown) => {
    installation = undefined;
    throw error;
  });
  return installation;
}
