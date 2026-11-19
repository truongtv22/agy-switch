#!/bin/bash
# Stage the release-profile macOS arm64 archives.
# The user zip uses the branded .app name. The updater archive keeps the
# agy-switch.app root that installed 4.9.0 clients expect.
set -euo pipefail

APP_DIR="${1:?app bundle directory}"
VERSION="${2:?version}"
OUT_DIR="${3:?output directory}"

APP_NAME="$(node --input-type=module -e 'import {desktopBrand} from "./scripts/release-brand.mjs"; console.log(desktopBrand(process.argv[1]).app)' "$VERSION")"
if [[ "$APP_NAME" != "agy-switch" ]]; then
  mv "$APP_DIR/agy-switch.app" "$APP_DIR/$APP_NAME.app"
fi
APP="$APP_DIR/$APP_NAME.app"
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
[[ "$EXECUTABLE" == "agy-switch-desktop" ]]
[[ -x "$APP/Contents/MacOS/$EXECUTABLE" ]]
[[ "$(lipo -archs "$APP/Contents/MacOS/agy-switch-desktop")" == "arm64" ]]
node scripts/verify-macos-bundle.mjs "$APP" "$VERSION"
[[ "$("$APP/Contents/MacOS/agy-switch-desktop" --version)" == "agy-switch $VERSION" ]]
node scripts/test-cli.mjs "$APP/Contents/MacOS/agy-switch-desktop"

mkdir -p "$OUT_DIR"
NAME="agy-switch-${VERSION}-macos-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT_DIR/$NAME"
ROUNDTRIP="$(mktemp -d)"
ditto -x -k "$OUT_DIR/$NAME" "$ROUNDTRIP"
node scripts/verify-macos-bundle.mjs "$ROUNDTRIP/$APP_NAME.app" "$VERSION"
UPDATE_STAGE="$(mktemp -d)"
ditto "$APP" "$UPDATE_STAGE/agy-switch.app"
node scripts/verify-macos-bundle.mjs "$UPDATE_STAGE/agy-switch.app" "$VERSION"
tar -czf "$OUT_DIR/agy-switch-${VERSION}-macos-arm64.app.tar.gz" -C "$UPDATE_STAGE" agy-switch.app
node scripts/release-assets.mjs checksum "$OUT_DIR/$NAME"
node --input-type=module -e 'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[1], JSON.stringify({ source_commit: process.env.GITHUB_SHA || null, version: process.argv[2], architecture: "arm64", profile: "release", app: process.argv[3], archive: process.argv[4], distribution: "release-profile macOS arm64 archive; not Developer ID signed or notarized" }, null, 2) + "\n");' \
  "$OUT_DIR/build-info.json" "$VERSION" "$APP_NAME" "$NAME"
rm -rf "$ROUNDTRIP" "$UPDATE_STAGE"
echo "Staged $OUT_DIR/$NAME ($APP_NAME.app)"
