#!/usr/bin/env node
/**
 * Generate app icons for Electron packaging.
 *
 * Creates a 1024x1024 PNG icon using an SVG template, then converts it to:
 *   - build/icon.png    (1024x1024 PNG — Linux, electron-builder source)
 *   - build/icon.icns   (macOS icon bundle)
 *
 * Requirements:
 *   - rsvg-convert (via `brew install librsvg` on macOS) for SVG→PNG
 *   - macOS: `sips` (built-in) + `iconutil` (built-in) for .icns
 *
 * This script does NOT generate icon.ico (Windows). The .ico is generated
 * separately using `sharp` and committed to the repo. See ELECTRON.md for
 * regeneration instructions.
 *
 * If conversion tools are unavailable, the script creates the PNG only.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, "..", "build");

// SVG icon template — the Δ logo with gradient background
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F8EF7"/>
      <stop offset="100%" style="stop-color:#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <text x="512" y="620" font-family="Helvetica, Arial, sans-serif" font-size="560"
        font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">Δ</text>
</svg>`;

fs.mkdirSync(BUILD_DIR, { recursive: true });

// Write SVG
const svgPath = path.join(BUILD_DIR, "icon.svg");
fs.writeFileSync(svgPath, SVG);
console.log("Created build/icon.svg");

// Try to convert SVG to PNG using sips (macOS) or rsvg-convert
try {
  // macOS: use sips to convert (needs PNG input, so we'll try a different approach)
  // Use `rsvg-convert` if available, otherwise try `sips`
  try {
    execSync(`which rsvg-convert`, { stdio: "ignore" });
    execSync(`rsvg-convert -w 1024 -h 1024 "${svgPath}" -o "${path.join(BUILD_DIR, "icon.png")}"`, { stdio: "inherit" });
    console.log("Created build/icon.png (via rsvg-convert)");
  } catch {
    // Fallback: write a note that manual conversion is needed
    console.log("Note: Install librsvg (`brew install librsvg`) for automatic SVG→PNG conversion.");
    console.log("Alternatively, open build/icon.svg in a browser and export as 1024x1024 PNG to build/icon.png");
    console.log("electron-builder will auto-convert icon.png to .icns and .ico during builds.");
  }

  // macOS .icns generation from PNG
  const pngPath = path.join(BUILD_DIR, "icon.png");
  if (fs.existsSync(pngPath) && process.platform === "darwin") {
    const iconsetDir = path.join(BUILD_DIR, "icon.iconset");
    fs.mkdirSync(iconsetDir, { recursive: true });

    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    for (const size of sizes) {
      execSync(`sips -z ${size} ${size} "${pngPath}" --out "${path.join(iconsetDir, `icon_${size}x${size}.png`)}"`, { stdio: "ignore" });
      if (size <= 512) {
        execSync(`sips -z ${size * 2} ${size * 2} "${pngPath}" --out "${path.join(iconsetDir, `icon_${size}x${size}@2x.png`)}"`, { stdio: "ignore" });
      }
    }

    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(BUILD_DIR, "icon.icns")}"`, { stdio: "inherit" });
    fs.rmSync(iconsetDir, { recursive: true });
    console.log("Created build/icon.icns");
  }
} catch (err) {
  console.error("Icon conversion error:", err.message);
  console.log("You can manually create icon.png (1024x1024) from icon.svg");
}

console.log("\nIcon generation complete. Files in build/:");
fs.readdirSync(BUILD_DIR).filter(f => f.startsWith("icon")).forEach(f => console.log(`  ${f}`));
