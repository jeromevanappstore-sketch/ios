import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const backupDomains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];

async function exists(filename) {
  try { await fs.access(filename); return true; } catch { return false; }
}

async function write(filename, contents) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, contents);
}

function xmlAttribute(tag, name, value) {
  const expression = new RegExp(`\\s${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(["']).*?\\1`, 's');
  const replacement = ` ${name}="${value}"`;
  return expression.test(tag) ? tag.replace(expression, replacement) : tag.replace(/\s*\/?>(?=$)/, ending => replacement + ending);
}

function excludeRules(indent) {
  return backupDomains.map(domain => `${indent}<exclude domain="${domain}" path="." />`).join('\n');
}

async function androidSetup(root, svg, sharp) {
  const app = path.join(root, 'android/app/src/main');
  const manifestFile = path.join(app, 'AndroidManifest.xml');
  let manifest = await fs.readFile(manifestFile, 'utf8');
  if (!/<application\b[^>]*>/s.test(manifest)) throw new Error('Android application element was not found.');
  manifest = manifest.replace(/<application\b[^>]*>/s, tag => {
    for (const [name, value] of Object.entries({
      'android:allowBackup': 'false',
      'android:fullBackupContent': '@xml/tfgbc_backup_rules',
      'android:dataExtractionRules': '@xml/tfgbc_data_extraction_rules',
      'android:usesCleartextTraffic': 'false',
      'android:icon': '@mipmap/ic_launcher',
      'android:roundIcon': '@mipmap/ic_launcher_round',
    })) tag = xmlAttribute(tag, name, value);
    return tag;
  });
  await write(manifestFile, manifest);
  await write(path.join(app, 'res/xml/tfgbc_backup_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${excludeRules('  ')}
</full-backup-content>
`);
  await write(path.join(app, 'res/xml/tfgbc_data_extraction_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${excludeRules('    ')}
  </cloud-backup>
  <device-transfer>
${excludeRules('    ')}
  </device-transfer>
</data-extraction-rules>
`);
  // Android already excludes its Cache directory. Rules also exclude persistent
  // WebView databases/preferences so staff sessions and local records are not backed up.

  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(sizes)) {
    const destination = path.join(app, `res/mipmap-${density}`);
    await fs.mkdir(destination, { recursive: true });
    await sharp(svg).resize(size, size).png().toFile(path.join(destination, 'ic_launcher.png'));
    const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
    await sharp(svg).resize(size, size).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(path.join(destination, 'ic_launcher_round.png'));
  }
  const foreground = path.join(app, 'res/drawable-nodpi/tfgbc_icon_foreground.png');
  await fs.mkdir(path.dirname(foreground), { recursive: true });
  await sharp(svg).resize(198, 198).extend({ top: 63, bottom: 63, left: 63, right: 63, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(foreground);
  await write(path.join(app, 'res/values/tfgbc_icon_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="tfgbc_icon_background">#FFFFFF</color></resources>\n');
  const adaptiveIcon = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/tfgbc_icon_background"/><foreground android:drawable="@drawable/tfgbc_icon_foreground"/></adaptive-icon>\n';
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    await write(path.join(app, 'res/mipmap-anydpi-v26', name), adaptiveIcon);
  }
}

export async function postprocessIosMetadata(root = projectRoot) {
  // plist/xcode are the installed Capacitor CLI's own tooling dependencies.
  const cliRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
  const plist = cliRequire('plist');
  const xcode = cliRequire('xcode');
  const app = path.join(root, 'ios/App/App');
  const manifestFile = path.join(app, 'PrivacyInfo.xcprivacy');
  const privacy = await exists(manifestFile) ? plist.parse(await fs.readFile(manifestFile, 'utf8')) : {};
  privacy.NSPrivacyTracking ??= false;
  privacy.NSPrivacyTrackingDomains ??= [];
  privacy.NSPrivacyAccessedAPITypes ??= [];
  if (!Array.isArray(privacy.NSPrivacyAccessedAPITypes)) throw new Error('Unexpected iOS privacy manifest structure.');
  let timestamp = privacy.NSPrivacyAccessedAPITypes.find(entry => entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryFileTimestamp');
  if (!timestamp) {
    timestamp = { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: [] };
    privacy.NSPrivacyAccessedAPITypes.push(timestamp);
  }
  timestamp.NSPrivacyAccessedAPITypeReasons ??= [];
  if (!timestamp.NSPrivacyAccessedAPITypeReasons.includes('C617.1')) timestamp.NSPrivacyAccessedAPITypeReasons.push('C617.1');
  await write(manifestFile, plist.build(privacy) + '\n');

  const projectFile = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  const project = xcode.project(projectFile);
  project.parseSync();
  let projectChanged = false;
  if (!project.hasFile('PrivacyInfo.xcprivacy') && !project.hasFile('App/PrivacyInfo.xcprivacy')) {
    const group = project.findPBXGroupKey({ path: 'App' }) ?? project.findPBXGroupKey({ name: 'App' });
    if (!group) throw new Error('Could not locate the iOS App resource group.');
    project.addResourceFile('PrivacyInfo.xcprivacy', { target: project.getFirstTarget().uuid, lastKnownFileType: 'text.xml' }, group);
    projectChanged = true;
  }
  // xcode's PBXFile writer retains optional keys with undefined values. Remove
  // those keys before serialization, and repair earlier generated references.
  for (const reference of Object.values(project.pbxFileReferenceSection())) {
    if (!reference || typeof reference !== 'object') continue;
    for (const [key, value] of Object.entries(reference)) {
      if (value === undefined || value === 'undefined') {
        delete reference[key];
        projectChanged = true;
      }
    }
  }
  if (projectChanged) await write(projectFile, project.writeSync());
}

async function iosSetup(root, svg, sharp) {
  await postprocessIosMetadata(root);
  const app = path.join(root, 'ios/App/App');
  // No camera or full photo-library permission is requested by this application.
  // Its file inputs use the system document/photo selection UI. Add usage descriptions
  // alongside a native camera plugin only if that feature is explicitly introduced.
  const iconDir = path.join(app, 'Assets.xcassets/AppIcon.appiconset');
  await fs.mkdir(iconDir, { recursive: true });
  const entries = [
    ['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3],
    ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
    ['ipad', 20, 1], ['ipad', 20, 2], ['ipad', 29, 1], ['ipad', 29, 2],
    ['ipad', 40, 1], ['ipad', 40, 2], ['ipad', 76, 1], ['ipad', 76, 2],
    ['ipad', 83.5, 2], ['ios-marketing', 1024, 1],
  ];
  const pixels = new Set(entries.map(([, size, scale]) => size * scale));
  for (const size of pixels) {
    // App Store icons must be opaque. Fill the vector's rounded outside corners
    // with its own red border color; the OS applies the final icon mask.
    await sharp(svg).resize(size, size).flatten({ background: '#FFFFFF' }).png().toFile(path.join(iconDir, `AppIcon-${size}.png`));
  }
  await write(path.join(iconDir, 'Contents.json'), JSON.stringify({
    images: entries.map(([idiom, size, scale]) => ({ idiom, size: `${size}x${size}`, scale: `${scale}x`, filename: `AppIcon-${size * scale}.png` })),
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');
}

export async function postprocessPlatforms(root = projectRoot) {
  root = path.resolve(root);
  const android = await exists(path.join(root, 'android/app/src/main/AndroidManifest.xml'));
  const ios = await exists(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'));
  if (!android && !ios) return { android: false, ios: false };

  const iconSource = path.join(root, 'assets/icon.svg');
  if (!await exists(iconSource)) {
    const builtIcon = path.join(root, 'www/favicon.svg');
    if (!await exists(builtIcon)) throw new Error('Build www first; www/favicon.svg is required to prepare the native icons.');
    await write(iconSource, await fs.readFile(builtIcon));
  }
  const svg = await fs.readFile(iconSource);
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { throw new Error('Native icon generation needs the sharp development dependency. Run npm install before postprocessing.'); }

  if (android) await androidSetup(root, svg, sharp);
  if (ios) await iosSetup(root, svg, sharp);
  return { android, ios };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await postprocessPlatforms();
  console.log(JSON.stringify({ nativePlatformPostprocess: result }));
}

