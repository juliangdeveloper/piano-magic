#!/bin/sh
set -eu
ios=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$ios/.." && pwd)
bundle_id=${1:-}
if [ -z "$bundle_id" ]; then
  bundle_id=$(sed -n 's/^bundleID: *//p' "$ios/xtool.yml")
fi
export IOS_BUNDLE_ID="$bundle_id"
export IOS_TEAM_ID="${2:-}"
export IOS_BUILD="${3:-1}"
export IOS_VERSION=$(tr -d '[:space:]' < "$root/VERSION")
plutil -replace CFBundleShortVersionString -string "$IOS_VERSION" "$ios/Info.plist"
plutil -replace CFBundleVersion -string "$IOS_BUILD" "$ios/Info.plist"
mkdir -p "$ios/.gen"
: > "$ios/.gen/stub.c"
cd "$ios"
xcodegen generate --spec project.yml
echo "$IOS_BUNDLE_ID $IOS_VERSION ($IOS_BUILD)"
