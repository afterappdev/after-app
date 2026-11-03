#!/bin/sh
# Copy injected GoogleService-Info.plist into the Runner.app resource bundle.
# Requires inject-firebase-plist.sh (or pre-build) to have created the source file.

set -eu

SRC="${SRCROOT}/Runner/GoogleService-Info.plist"
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"

if [ ! -f "$SRC" ]; then
  echo "copy-firebase-plist-to-bundle: Runner/GoogleService-Info.plist ausente; execute inject-firebase-plist.sh antes do build" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp -f "$SRC" "$DEST"
