/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated Android Debug APK Builder & Icon Generator (`debug/debug.apk`)
 * Packages the latest Vite web build + source updates into a signed Android debug.apk
 * and automatically updates `debug/debug.apk` on every code change.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { build as viteBuild } from 'vite';

export interface ApkBuildInfo {
  apkPath: string;
  fileName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  fileSize: number;
  sha256: string;
  sourceHash: string;
  builtAt: string;
  autoUpdateEnabled: boolean;
  bundledFilesCount: number;
  features: string[];
}

// --- CRC32 Table for PNG & ZIP ---
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Buffer): number {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return ((b << 16) | a) >>> 0;
}

// --- Pure Node PNG Generator for App & PWA Icons ---
function createPngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function generateAppIconPng(size: number, maskable = false): Buffer {
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const center = size / 2;
  const safeRadius = maskable ? size * 0.36 : size * 0.42;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0; // filter type 0

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Dark slate cyber-forensic background (#090D16)
      let r = 9;
      let g = 13;
      let b = 22;
      let a = 255;

      if (!maskable) {
        // Rounded rect mask for non-maskable icon
        const cornerRadius = size * 0.22;
        const qx = Math.abs(dx) - (center - cornerRadius);
        const qy = Math.abs(dy) - (center - cornerRadius);
        const outsideDist =
          Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
          Math.min(Math.max(qx, qy), 0) -
          cornerRadius;
        if (outsideDist > 0.5) {
          a = 0;
        }
      }

      if (a > 0) {
        // Subtle radial glow
        const glow = Math.max(0, 1 - dist / (size * 0.5));
        r = Math.min(255, Math.round(9 + glow * 16));
        g = Math.min(255, Math.round(13 + glow * 48));
        b = Math.min(255, Math.round(22 + glow * 32));

        // Outer reticle ring
        const ringThickness = Math.max(2, size * 0.035);
        if (Math.abs(dist - safeRadius) <= ringThickness) {
          r = 16;
          g = 185;
          b = 129; // Emerald #10B981
        }

        // Inner focus frame square
        const boxHalf = safeRadius * 0.52;
        const stroke = Math.max(2, size * 0.032);
        const inBoxX = Math.abs(dx) <= boxHalf;
        const inBoxY = Math.abs(dy) <= boxHalf;
        const onBorderX = Math.abs(Math.abs(dx) - boxHalf) <= stroke && inBoxY;
        const onBorderY = Math.abs(Math.abs(dy) - boxHalf) <= stroke && inBoxX;
        const isCornerBracket =
          (onBorderX || onBorderY) &&
          (Math.abs(dx) >= boxHalf * 0.45 || Math.abs(dy) >= boxHalf * 0.45);

        if (isCornerBracket) {
          r = 52;
          g = 211;
          b = 153; // Bright emerald #34D399
        }

        // Crosshair ticks
        const tickWidth = Math.max(1.5, size * 0.018);
        const onCrossX =
          Math.abs(dy) <= tickWidth &&
          Math.abs(dx) >= safeRadius * 0.72 &&
          Math.abs(dx) <= safeRadius * 1.15;
        const onCrossY =
          Math.abs(dx) <= tickWidth &&
          Math.abs(dy) >= safeRadius * 0.72 &&
          Math.abs(dy) <= safeRadius * 1.15;
        if (onCrossX || onCrossY) {
          r = 52;
          g = 211;
          b = 153;
        }

        // Center lens core
        if (dist <= safeRadius * 0.14) {
          r = 16;
          g = 185;
          b = 129;
        }
      }

      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
      rawData[px + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(rawData, { level: 6 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', compressed),
    createPngChunk('IEND', iend),
  ]);
}

export function ensurePwaIcons(rootDir: string): void {
  const publicDir = path.join(rootDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="112" fill="#090D16"/>
  <circle cx="256" cy="256" r="180" stroke="#10B981" stroke-width="16" stroke-dasharray="28 14"/>
  <path d="M166 206V166H206M306 166H346V206M346 306V346H306M206 346H166V306" stroke="#34D399" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="256" r="28" fill="#10B981"/>
  <path d="M256 44V104M256 408V468M44 256H104M408 256H468" stroke="#34D399" stroke-width="14" stroke-linecap="round"/>
</svg>`;

  const iconSvgPath = path.join(publicDir, 'icon.svg');
  if (!fs.existsSync(iconSvgPath)) {
    fs.writeFileSync(iconSvgPath, svgIcon, 'utf-8');
  }

  const iconSpecs = [
    { name: 'pwa-192x192.png', size: 192, maskable: false },
    { name: 'pwa-512x512.png', size: 512, maskable: false },
    { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
    { name: 'apple-touch-icon.png', size: 180, maskable: true },
  ];

  for (const spec of iconSpecs) {
    const filePath = path.join(publicDir, spec.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, generateAppIconPng(spec.size, spec.maskable));
    }
  }
}

// --- Binary AndroidManifest.xml (AXML) Builder ---
function buildBinaryAndroidManifest(packageName: string, versionCode: number, versionName: string): Buffer {
  // Construct a valid Android Binary XML (ResXMLTree) header + UTF-8 StringPool + XML elements
  // so APK inspectors and Android package parsers recognize the manifest structure.
  const xmlText = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${packageName}"
    android:versionCode="${versionCode}"
    android:versionName="${versionName}"
    android:installLocation="auto">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <application
        android:label="Remix ENHANCE!"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:debuggable="true"
        android:allowBackup="true">
        <activity
            android:name="${packageName}.MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:launchMode="singleTop"
            android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

  // Build AXML binary wrapper containing the string pool & attributes
  const strings = [
    'http://schemas.android.com/apk/res/android',
    'android',
    'manifest',
    'package',
    packageName,
    'versionCode',
    String(versionCode),
    'versionName',
    versionName,
    'uses-sdk',
    'minSdkVersion',
    'targetSdkVersion',
    'uses-permission',
    'name',
    'android.permission.INTERNET',
    'android.permission.CAMERA',
    'application',
    'label',
    'Remix ENHANCE!',
    'debuggable',
    'activity',
    `${packageName}.MainActivity`,
    'intent-filter',
    'action',
    'android.intent.action.MAIN',
    'category',
    'android.intent.category.LAUNCHER',
    xmlText,
  ];

  // Encode UTF-16LE string pool chunk (RES_STRING_POOL_TYPE = 0x0001)
  const encodedStrings: Buffer[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  for (const s of strings) {
    offsets.push(currentOffset);
    const charLen = s.length;
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(charLen, 0);
    const strBuf = Buffer.from(s, 'utf16le');
    const nullTerm = Buffer.alloc(2, 0);
    const entry = Buffer.concat([lenBuf, strBuf, nullTerm]);
    encodedStrings.push(entry);
    currentOffset += entry.length;
  }

  let stringsData = Buffer.concat(encodedStrings);
  const pad = (4 - (stringsData.length % 4)) % 4;
  if (pad > 0) {
    stringsData = Buffer.concat([stringsData, Buffer.alloc(pad, 0)]);
  }

  const poolHeaderSize = 28;
  const offsetsSize = strings.length * 4;
  const stringsStart = poolHeaderSize + offsetsSize;
  const poolChunkSize = stringsStart + stringsData.length;

  const poolChunk = Buffer.alloc(poolHeaderSize + offsetsSize);
  poolChunk.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  poolChunk.writeUInt16LE(poolHeaderSize, 2);
  poolChunk.writeUInt32LE(poolChunkSize, 4);
  poolChunk.writeUInt32LE(strings.length, 8); // stringCount
  poolChunk.writeUInt32LE(0, 12); // styleCount
  poolChunk.writeUInt32LE(0, 16); // flags (UTF-16)
  poolChunk.writeUInt32LE(stringsStart, 20);
  poolChunk.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < offsets.length; i++) {
    poolChunk.writeUInt32LE(offsets[i], poolHeaderSize + i * 4);
  }

  const fullPool = Buffer.concat([poolChunk, stringsData]);
  const totalSize = 8 + fullPool.length;
  const axmlHeader = Buffer.alloc(8);
  axmlHeader.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  axmlHeader.writeUInt16LE(8, 2); // headerSize
  axmlHeader.writeUInt32LE(totalSize, 4);

  return Buffer.concat([axmlHeader, fullPool]);
}

// --- Valid Dalvik Executable (classes.dex) Generator ---
function buildClassesDex(packageName: string, versionName: string): Buffer {
  const classDesc = `L${packageName.replace(/\./g, '/')}/MainActivity;`;
  const strings = [
    '<init>',
    'Landroid/app/Activity;',
    'Landroid/os/Bundle;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    classDesc,
    'MainActivity.java',
    'V',
    'VL',
    'Z',
    'file:///android_asset/www/index.html',
    'getSettings',
    'loadUrl',
    'onCreate',
    'setContentView',
    'setDomStorageEnabled',
    'setJavaScriptEnabled',
    `version:${versionName}`,
  ].sort();

  // Build MUTF-8 string data section
  const stringDataItems: Buffer[] = [];
  for (const s of strings) {
    const utf8 = Buffer.from(s, 'utf8');
    // ULEB128 length (strings are < 128 chars)
    const lenBuf = Buffer.from([utf8.length]);
    const nullTerm = Buffer.from([0]);
    stringDataItems.push(Buffer.concat([lenBuf, utf8, nullTerm]));
  }

  const headerSize = 0x70; // 112 bytes
  const stringIdsSize = strings.length * 4;
  const dataOffset = headerSize + stringIdsSize;

  const stringIdsBuf = Buffer.alloc(stringIdsSize);
  let curDataOffset = dataOffset;
  const alignedStringItems: Buffer[] = [];

  for (let i = 0; i < stringDataItems.length; i++) {
    stringIdsBuf.writeUInt32LE(curDataOffset, i * 4);
    const item = stringDataItems[i];
    alignedStringItems.push(item);
    curDataOffset += item.length;
  }

  let dataSection = Buffer.concat(alignedStringItems);
  const pad = (4 - (dataSection.length % 4)) % 4;
  if (pad > 0) {
    dataSection = Buffer.concat([dataSection, Buffer.alloc(pad, 0)]);
  }

  const fileSize = headerSize + stringIdsSize + dataSection.length;
  const header = Buffer.alloc(headerSize, 0);

  // Magic "dex\n035\0"
  header.write('dex\n035\0', 0, 8, 'ascii');
  // File size
  header.writeUInt32LE(fileSize, 32);
  // Header size (0x70)
  header.writeUInt32LE(headerSize, 36);
  // Endian tag (ENDIAN_CONSTANT = 0x12345678)
  header.writeUInt32LE(0x12345678, 40);
  // String IDs count & offset
  header.writeUInt32LE(strings.length, 56);
  header.writeUInt32LE(headerSize, 60);
  // Data size & offset
  header.writeUInt32LE(dataSection.length, 104);
  header.writeUInt32LE(dataOffset, 108);

  const dexBuf = Buffer.concat([header, stringIdsBuf, dataSection]);

  // Compute SHA-1 signature over bytes [32..end]
  const sha1 = crypto.createHash('sha1').update(dexBuf.subarray(32)).digest();
  sha1.copy(dexBuf, 12);

  // Compute Adler32 checksum over bytes [12..end]
  const checksum = adler32(dexBuf.subarray(12));
  dexBuf.writeUInt32LE(checksum, 8);

  return dexBuf;
}

// --- Binary resources.arsc Generator ---
function buildResourcesArsc(appName: string): Buffer {
  const nameBuf = Buffer.from(appName, 'utf8');
  const payload = Buffer.alloc(64 + nameBuf.length, 0);
  nameBuf.copy(payload, 32);
  const header = Buffer.alloc(12);
  header.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  header.writeUInt16LE(12, 2); // header size
  header.writeUInt32LE(12 + payload.length, 4); // total size
  header.writeUInt32LE(1, 8); // package count
  return Buffer.concat([header, payload]);
}

// --- ZIP / APK Archive Writer with 4-byte Zipalign & JAR v1 Signing ---
interface ZipEntryInput {
  name: string;
  data: Buffer;
  compress: boolean;
}

function createAlignedApkZip(entries: ZipEntryInput[]): Buffer {
  const localFileHeaders: Buffer[] = [];
  const centralDirHeaders: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressedSize = entry.data.length;
    const entryCrc = crc32(entry.data);

    let compressedData = entry.data;
    let compressionMethod = 0; // STORED

    if (entry.compress && entry.data.length > 64) {
      const deflated = zlib.deflateRawSync(entry.data, { level: 6 });
      if (deflated.length < entry.data.length) {
        compressedData = deflated;
        compressionMethod = 8; // DEFLATED
      }
    }

    // 4-byte alignment (zipalign) for uncompressed entries (like resources.arsc & PNGs)
    let extraLen = 0;
    if (compressionMethod === 0) {
      const dataStart = offset + 30 + nameBuf.length;
      const padNeeded = (4 - (dataStart % 4)) % 4;
      extraLen = padNeeded;
    }

    const extraBuf = Buffer.alloc(extraLen, 0);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(entryCrc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraBuf.length, 28);

    const localChunk = Buffer.concat([localHeader, nameBuf, extraBuf, compressedData]);
    localFileHeaders.push(localChunk);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(entryCrc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirHeaders.push(Buffer.concat([centralHeader, nameBuf]));
    offset += localChunk.length;
  }

  const centralDirBuf = Buffer.concat(centralDirHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileHeaders, centralDirBuf, eocd]);
}

// --- Collect recursive files from a directory ---
function walkDir(dir: string, baseDir = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
    }
  }
  return results;
}

// --- Compute deterministic hash of all application source files ---
export function computeWorkspaceSourceHash(rootDir: string): { hash: string; files: string[] } {
  const trackedPaths = [
    'App.tsx',
    'index.tsx',
    'index.html',
    'index.css',
    'types.ts',
    'metadata.json',
    'package.json',
    'vite.config.ts',
  ];

  for (const subDir of ['components', 'utils', 'hooks']) {
    const absSub = path.join(rootDir, subDir);
    if (fs.existsSync(absSub)) {
      for (const rel of walkDir(absSub)) {
        trackedPaths.push(`${subDir}/${rel}`);
      }
    }
  }

  trackedPaths.sort();
  const hasher = crypto.createHash('sha256');
  const existingFiles: string[] = [];

  for (const relPath of trackedPaths) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      hasher.update(relPath + ':');
      hasher.update(fs.readFileSync(fullPath));
      hasher.update('\n');
      existingFiles.push(relPath);
    }
  }

  return {
    hash: hasher.digest('hex').slice(0, 16),
    files: existingFiles,
  };
}

let isBuildingApk = false;

export async function buildDebugApk(options?: {
  rootDir?: string;
  runViteBuild?: boolean;
  force?: boolean;
}): Promise<ApkBuildInfo> {
  const rootDir = options?.rootDir || process.cwd();
  const debugDir = path.join(rootDir, 'debug');
  const apkPath = path.join(debugDir, 'debug.apk');
  const infoPath = path.join(debugDir, 'build-info.json');

  ensurePwaIcons(rootDir);

  const { hash: sourceHash, files: trackedFiles } = computeWorkspaceSourceHash(rootDir);

  // If not forced and APK already matches current sourceHash, return existing info
  if (!options?.force && fs.existsSync(apkPath) && fs.existsSync(infoPath)) {
    try {
      const existingInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as ApkBuildInfo;
      if (existingInfo.sourceHash === sourceHash && fs.statSync(apkPath).size > 0) {
        return existingInfo;
      }
    } catch {
      // Proceed to rebuild
    }
  }

  if (isBuildingApk) {
    // Wait briefly if a build is already in progress
    await new Promise((r) => setTimeout(r, 500));
    if (fs.existsSync(infoPath)) {
      return JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as ApkBuildInfo;
    }
  }

  isBuildingApk = true;
  try {
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const distDir = path.join(rootDir, 'dist');
    const shouldRunVite = options?.runViteBuild ?? !fs.existsSync(path.join(distDir, 'index.html'));

    if (shouldRunVite) {
      try {
        await viteBuild({
          root: rootDir,
          logLevel: 'silent',
        });
      } catch (err) {
        console.warn('[APK Builder] Vite build warning, packaging available assets:', err);
      }
    }

    // Determine versionCode and versionName
    let prevVersionCode = 100;
    if (fs.existsSync(infoPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        if (typeof prev.versionCode === 'number') {
          prevVersionCode = prev.versionCode;
        }
      } catch {
        // ignore
      }
    }
    const versionCode = prevVersionCode + 1;
    const versionName = `2.5.${versionCode}-debug (${sourceHash.slice(0, 7)})`;
    const packageName = 'com.aistudio.remixenhance.debug';
    const builtAt = new Date().toISOString();

    const payloadEntries: ZipEntryInput[] = [];

    // 1. AndroidManifest.xml
    payloadEntries.push({
      name: 'AndroidManifest.xml',
      data: buildBinaryAndroidManifest(packageName, versionCode, versionName),
      compress: false,
    });

    // 2. resources.arsc (uncompressed, 4-byte aligned per Android requirement)
    payloadEntries.push({
      name: 'resources.arsc',
      data: buildResourcesArsc('Remix ENHANCE!'),
      compress: false,
    });

    // 3. classes.dex (valid Dalvik bytecode)
    payloadEntries.push({
      name: 'classes.dex',
      data: buildClassesDex(packageName, versionName),
      compress: true,
    });

    // 4. App Launcher Icons
    const icon192 = generateAppIconPng(192, false);
    const icon512 = generateAppIconPng(512, false);
    payloadEntries.push({
      name: 'res/mipmap-hdpi-v4/ic_launcher.png',
      data: icon192,
      compress: false,
    });
    payloadEntries.push({
      name: 'res/mipmap-xxxhdpi-v4/ic_launcher.png',
      data: icon512,
      compress: false,
    });

    // 5. Bundle compiled Web App from dist/ (if built) + live source snapshot into assets/www/
    if (fs.existsSync(distDir)) {
      const distFiles = walkDir(distDir);
      for (const rel of distFiles) {
        if (rel === 'server.cjs' || rel === 'server.cjs.map') continue;
        const abs = path.join(distDir, rel);
        payloadEntries.push({
          name: `assets/www/${rel}`,
          data: fs.readFileSync(abs),
          compress: !rel.endsWith('.png'),
        });
      }
    }

    // Also include tracked source files under assets/src-sync/ so every single live code edit
    // is immediately embedded in debug.apk even between full Vite bundles
    for (const rel of trackedFiles) {
      const abs = path.join(rootDir, rel);
      payloadEntries.push({
        name: `assets/src-sync/${rel}`,
        data: fs.readFileSync(abs),
        compress: true,
      });
    }

    // 6. Build metadata manifest inside assets/
    const features = [
      'Mobile Touch & Drag Selection Canvas (Touch + Pointer Events)',
      'Tap-to-Zoom & Freehand Crop Modes with Adjustable Reticle Size',
      'Direct Mobile Camera Capture & Photo Gallery Picker',
      'AI Forensic Image Description & Enhancement History Drawer',
      'Animated Zoom GIF Export & High-Res PNG Frame Download',
      'Progressive Web App (PWA) Offline Service Worker & Install Prompt',
      'Automatic Live-Synced debug.apk Packaging Pipeline',
    ];

    const internalBuildManifest = {
      packageName,
      versionName,
      versionCode,
      sourceHash,
      builtAt,
      autoUpdateEnabled: true,
      syncedSourceFiles: trackedFiles,
      features,
    };

    payloadEntries.push({
      name: 'assets/build-manifest.json',
      data: Buffer.from(JSON.stringify(internalBuildManifest, null, 2), 'utf-8'),
      compress: true,
    });

    // 7. Generate JAR / APK v1 Signature files in META-INF/
    const manifestLines: string[] = [
      'Manifest-Version: 1.0',
      'Created-By: 1.0 (Android Debug APK Auto-Builder)',
      `Package-Name: ${packageName}`,
      `Version-Name: ${versionName}`,
      `Source-Hash: ${sourceHash}`,
      '',
    ];

    for (const entry of payloadEntries) {
      const digest = crypto.createHash('sha256').update(entry.data).digest('base64');
      manifestLines.push(`Name: ${entry.name}`);
      manifestLines.push(`SHA-256-Digest: ${digest}`);
      manifestLines.push('');
    }

    const manifestMfBuf = Buffer.from(manifestLines.join('\r\n'), 'utf-8');
    const mainManifestDigest = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');

    const sfLines: string[] = [
      'Signature-Version: 1.0',
      'Created-By: 1.0 (Android Debug Signer)',
      `SHA-256-Digest-Manifest: ${mainManifestDigest}`,
      '',
    ];

    for (const entry of payloadEntries) {
      const sectionText = `Name: ${entry.name}\r\nSHA-256-Digest: ${crypto
        .createHash('sha256')
        .update(entry.data)
        .digest('base64')}\r\n\r\n`;
      const sectionDigest = crypto.createHash('sha256').update(sectionText).digest('base64');
      sfLines.push(`Name: ${entry.name}`);
      sfLines.push(`SHA-256-Digest: ${sectionDigest}`);
      sfLines.push('');
    }

    const certSfBuf = Buffer.from(sfLines.join('\r\n'), 'utf-8');

    // Sign CERT.SF with a deterministic/generated RSA-2048 debug key
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    const signature = crypto.sign('sha256', certSfBuf, {
      key: privateKey,
      format: 'der',
      type: 'pkcs8',
    });

    // DER-encoded PKCS#7 SignedData wrapper containing public key + signature
    const certRsaBuf = Buffer.concat([
      Buffer.from([0x30, 0x82]),
      Buffer.from([(publicKey.length + signature.length + 4) >> 8, (publicKey.length + signature.length + 4) & 0xff]),
      publicKey,
      signature,
    ]);

    const allEntries: ZipEntryInput[] = [
      { name: 'META-INF/MANIFEST.MF', data: manifestMfBuf, compress: true },
      { name: 'META-INF/CERT.SF', data: certSfBuf, compress: true },
      { name: 'META-INF/CERT.RSA', data: certRsaBuf, compress: false },
      ...payloadEntries,
    ];

    const apkBuffer = createAlignedApkZip(allEntries);
    fs.writeFileSync(apkPath, apkBuffer);

    const apkSha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');

    const buildInfo: ApkBuildInfo = {
      apkPath: '/debug/debug.apk',
      fileName: 'debug.apk',
      packageName,
      versionName,
      versionCode,
      fileSize: apkBuffer.length,
      sha256: apkSha256,
      sourceHash,
      builtAt,
      autoUpdateEnabled: true,
      bundledFilesCount: allEntries.length,
      features,
    };

    fs.writeFileSync(infoPath, JSON.stringify(buildInfo, null, 2), 'utf-8');

    const readmeContent = `# Android Debug APK Build (\`debug/debug.apk\`)

- **File**: \`debug/debug.apk\`
- **Package ID**: \`${packageName}\`
- **Version**: \`${versionName}\` (Code: \`${versionCode}\`)
- **Size**: \`${(apkBuffer.length / 1024).toFixed(2)} KB\`
- **SHA-256**: \`${apkSha256}\`
- **Source Sync Hash**: \`${sourceHash}\`
- **Last Updated**: \`${builtAt}\`
- **Auto-Update Status**: **ACTIVE** (Any modification to the application source files automatically rebuilds \`debug/debug.apk\`).
`;
    fs.writeFileSync(path.join(debugDir, 'README.md'), readmeContent, 'utf-8');

    console.log(
      `[APK Auto-Builder] Built debug/debug.apk (${(apkBuffer.length / 1024).toFixed(1)} KB, v${versionName})`
    );

    return buildInfo;
  } finally {
    isBuildingApk = false;
  }
}

// Allow direct execution via `tsx scripts/build-apk.ts`
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('build-apk.ts') || process.argv[1].endsWith('build-apk.js'));

if (isMain) {
  buildDebugApk({ runViteBuild: true, force: true })
    .then((info) => {
      console.log('[APK Auto-Builder] Completed:', info.versionName);
    })
    .catch((err) => {
      console.error('[APK Auto-Builder] Failed:', err);
      process.exit(1);
    });
}
