#!/usr/bin/env node
/**
 * Patches neutralino-installer/src/platforms/mac.js to:
 * 1. Look for appIcon.icns in icons/ (not just buildAssets/)
 * 2. Copy .icns instead of .png so macOS shows the correct app icon
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const macFile = resolve(ROOT, 'node_modules/neutralino-installer/src/platforms/mac.js')

let src = readFileSync(macFile, 'utf-8')

const OLD = `  if (existsSync(join(cfg.projectRoot, 'buildAssets', 'appIcon.png'))) {
    cpSync(join(cfg.projectRoot, 'buildAssets', 'appIcon.png'), join(resourcesDir, 'AppIcon.png'));
  }`

const NEW = `  const icnsCandidates = [
    join(cfg.projectRoot, 'buildAssets', 'appIcon.icns'),
    join(cfg.projectRoot, 'icons', 'appIcon.icns'),
  ]
  const icnsFile = icnsCandidates.find(p => existsSync(p))
  if (icnsFile) {
    cpSync(icnsFile, join(resourcesDir, 'AppIcon.icns'))
  } else {
    const pngCandidates = [
      join(cfg.projectRoot, 'buildAssets', 'appIcon.png'),
      join(cfg.projectRoot, 'icons', 'appIcon.png'),
    ]
    const pngFile = pngCandidates.find(p => existsSync(p))
    if (pngFile) {
      cpSync(pngFile, join(resourcesDir, 'AppIcon.png'))
    }
  }`

if (src.includes(OLD)) {
  writeFileSync(macFile, src.replace(OLD, NEW), 'utf-8')
  console.log('[patch] neutralino-installer mac.js patched: icns icon support added')
} else if (src.includes('icnsCandidates')) {
  console.log('[patch] neutralino-installer mac.js already patched, skip')
} else {
  console.warn('[patch] WARNING: could not find patch target in mac.js — manual check needed')
}
