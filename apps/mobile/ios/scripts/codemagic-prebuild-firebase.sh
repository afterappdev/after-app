#!/bin/sh
# Codemagic pre-build: decode FIREBASE_IOS_PLIST_BASE64 before flutter build ipa / xcodebuild.
# Working directory: apps/mobile/ios (recommended) or repo root with adjusted paths.

set -eu

IOS_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$IOS_DIR"

chmod +x scripts/inject-firebase-plist.sh
./scripts/inject-firebase-plist.sh

if [ ! -f "Runner/GoogleService-Info.plist" ]; then
  echo "codemagic-prebuild-firebase: Runner/GoogleService-Info.plist não encontrado após injeção" >&2
  exit 1
fi

echo "codemagic-prebuild-firebase: plist pronto em Runner/GoogleService-Info.plist"
