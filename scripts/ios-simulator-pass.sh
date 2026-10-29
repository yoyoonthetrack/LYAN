#!/usr/bin/env bash
# Drive the LYANN app inside an iOS simulator: build the web artifact, build the
# native shell, install it and capture the screen. The simulator is the only
# surface that shows the system pickers, the keyboard accessory bar and the safe
# areas, none of which exist in a desktop browser.
#
#   scripts/ios-simulator-pass.sh                 # full pass
#   scripts/ios-simulator-pass.sh --skip-build    # reinstall the last build
#   SIM_NAME="iPhone 17e" scripts/ios-simulator-pass.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_NAME="${SIM_NAME:-iPhone 17 Pro}"
APP_ID="app.lyann.mobile"
DERIVED="${DERIVED:-/tmp/lyann-sim-dd}"
SHOTS="$ROOT/artifacts/sim"

UDID="$(xcrun simctl list devices available | awk -v name="$SIM_NAME" -F '[()]' '$0 ~ "    " name " \\(" { print $2; exit }')"
[ -n "$UDID" ] || { echo "Simulateur introuvable : $SIM_NAME"; exit 1; }

echo "== Simulateur $SIM_NAME ($UDID)"
xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$UDID" 2>/dev/null || true

if [ "${1:-}" != "--skip-build" ]; then
    echo "== Artefact web partagé"
    (cd "$ROOT" && npm run build:mobile >/dev/null && npx cap sync ios >/dev/null)
    echo "== Coque native (quelques minutes)"
    (cd "$ROOT/ios/App" && xcodebuild -project App.xcodeproj -scheme App \
        -configuration Debug -sdk iphonesimulator \
        -destination "platform=iOS Simulator,id=$UDID" \
        -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO build \
        > /tmp/lyann-sim-build.log 2>&1) \
        || { echo "Build échoué, voir /tmp/lyann-sim-build.log"; tail -20 /tmp/lyann-sim-build.log; exit 1; }
fi

APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
[ -d "$APP" ] || { echo "Build absent : $APP"; exit 1; }

echo "== Installation"
xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$APP_ID" >/dev/null

mkdir -p "$SHOTS"
sleep 6
STAMP="$(date +%H%M%S)"
xcrun simctl io "$UDID" screenshot "$SHOTS/$STAMP-launch.png" >/dev/null 2>&1
echo "== Capture : artifacts/sim/$STAMP-launch.png"
echo "Journal de la WebView : xcrun simctl spawn $UDID log stream --predicate 'process == \"App\"'"
