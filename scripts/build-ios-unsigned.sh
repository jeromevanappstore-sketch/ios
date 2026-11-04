#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

fail() { printf 'TFGBC iOS build: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "Use a Mac or a macOS build runner with Xcode 26+. Windows cannot compile the iOS device binary."
for tool in node npm xcodebuild xcrun ditto; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required tool is unavailable: $tool"
done

XCODE_VERSION="$(xcodebuild -version | awk 'NR == 1 { print $2 }')"
XCODE_MAJOR="${XCODE_VERSION%%.*}"
[[ "$XCODE_MAJOR" =~ ^[0-9]+$ ]] || fail "Could not determine the selected Xcode version."
[[ "$XCODE_MAJOR" -ge 26 ]] || fail "Xcode 26+ is required. Select it with DEVELOPER_DIR or xcode-select before retrying."
xcrun --sdk iphoneos --show-sdk-path >/dev/null
[[ -f node_modules/@capacitor/cli/bin/capacitor ]] || fail "Dependencies are missing. Run npm ci first."
[[ -d ios/App/App.xcodeproj ]] || fail "The native Xcode project is missing from this source package."

# Build only application assets. This script does not deploy the website, modify
# staff accounts, or require any Apple credentials or signing secrets.
npm run build
node node_modules/@capacitor/cli/bin/capacitor sync ios
node scripts/postprocess-platforms.mjs

# Keep intermediate files under the existing ignored iOS build directory. A
# unique directory avoids deleting or reusing any previous archive/staging tree.
mkdir -p ios/App/build downloads
BUILD_ROOT="$(mktemp -d "$PROJECT_ROOT/ios/App/build/tfgbc-unsigned.XXXXXX")"
ARCHIVE_PATH="$BUILD_ROOT/TFGBC.xcarchive"

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD_ROOT/DerivedData" \
  -archivePath "$ARCHIVE_PATH" \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  'CODE_SIGN_IDENTITY=' \
  'DEVELOPMENT_TEAM=' \
  archive

shopt -s nullglob
APP_BUNDLES=("$ARCHIVE_PATH"/Products/Applications/*.app)
[[ "${#APP_BUNDLES[@]}" -eq 1 ]] || fail "The archive must contain exactly one compiled iOS app."
APP_BUNDLE="${APP_BUNDLES[0]}"
[[ -f "$APP_BUNDLE/Info.plist" ]] || fail "The archived app has no Info.plist."
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_BUNDLE/Info.plist")"
[[ -n "$EXECUTABLE" && -f "$APP_BUNDLE/$EXECUTABLE" ]] || fail "The archived app has no compiled executable."
xcrun lipo "$APP_BUNDLE/$EXECUTABLE" -verify_arch arm64

STAGING_PATH="$BUILD_ROOT/package"
mkdir -p "$STAGING_PATH/Payload"
ditto "$APP_BUNDLE" "$STAGING_PATH/Payload/$(basename "$APP_BUNDLE")"
ditto -c -k --norsrc --keepParent "$STAGING_PATH/Payload" "$BUILD_ROOT/TFGBC-ios-unsigned.ipa"
mv -f "$BUILD_ROOT/TFGBC-ios-unsigned.ipa" "$PROJECT_ROOT/downloads/TFGBC-ios-unsigned.ipa"
(
  cd "$PROJECT_ROOT/downloads"
  shasum -a 256 TFGBC-ios-unsigned.ipa > TFGBC-ios-unsigned.ipa.sha256
)

printf '\nCreated a compiled ARM64 device package: downloads/TFGBC-ios-unsigned.ipa\n'
printf 'This IPA is unsigned. It still needs personal-device signing before installation.\n'
printf 'Free Apple Personal Team provisioning expires after 7 days and needs renewal.\n'
