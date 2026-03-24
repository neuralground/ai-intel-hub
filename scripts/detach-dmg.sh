#!/bin/bash
# Force-detach any mounted "AI Intelligence Hub" DMG volumes.
# Handles Finder locks, multiple mount points, and stale volumes.

VOL_NAME="AI Intelligence Hub"

# Find all matching mount points
for vol in /Volumes/"$VOL_NAME"*; do
  [ -d "$vol" ] || continue
  echo "[DMG] Detaching: $vol"
  # Try gentle detach first
  hdiutil detach "$vol" -quiet 2>/dev/null && continue
  # Force detach if gentle fails
  hdiutil detach "$vol" -force -quiet 2>/dev/null && continue
  # Nuclear option: find the device and force-eject
  dev=$(hdiutil info | grep -B 20 "$vol" | grep '/dev/disk' | tail -1 | awk '{print $1}')
  if [ -n "$dev" ]; then
    echo "[DMG] Force-ejecting device $dev for $vol"
    diskutil eject "$dev" 2>/dev/null
  fi
done

# Also clean up any orphaned dist-electron temp files that might hold locks
rm -rf /private/var/folders/*/*/t-*/[0-9]*.dmg 2>/dev/null

exit 0
