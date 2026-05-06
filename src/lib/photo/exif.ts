// Minimal EXIF extractor for JPEG photos. We only need GPS + timestamp
// + camera model — a 30-line walker beats pulling an EXIF library
// (most are CommonJS-only or tree-shake poorly with Next 16/Turbopack).
//
// Supports the JPEG container only (PNG/HEIC fall through with no
// EXIF; that's fine — Claude vision still runs and the verdict
// captures intent). Returns null for missing fields.

export interface ExifData {
  lat: number | null;
  lng: number | null;
  timestamp: string | null;
  camera_model: string | null;
}

const EMPTY: ExifData = { lat: null, lng: null, timestamp: null, camera_model: null };

// EXIF tag IDs we care about.
const TAG_GPS_IFD = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;

export function extractExif(buf: Buffer): ExifData {
  if (buf.length < 4) return EMPTY;
  // SOI marker
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return EMPTY;

  // Walk markers to APP1 (EXIF).
  let offset = 2;
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) return EMPTY;
    const marker = buf[offset + 1];
    if (marker === 0xda || marker === 0xd9) return EMPTY; // SOS / EOI
    const segLen = buf.readUInt16BE(offset + 2);
    if (marker === 0xe1 && buf.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
      return parseTiff(buf, offset + 10);
    }
    offset += 2 + segLen;
  }
  return EMPTY;
}

function parseTiff(buf: Buffer, base: number): ExifData {
  const byteOrder = buf.toString("ascii", base, base + 2);
  const little = byteOrder === "II";
  const r16 = (off: number) => (little ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const r32 = (off: number) => (little ? buf.readUInt32LE(off) : buf.readUInt32BE(off));

  const ifd0Offset = base + r32(base + 4);
  const ifd0Tags = readIfd(buf, ifd0Offset, base, r16, r32);

  let cameraModel: string | null = null;
  if (ifd0Tags.has(TAG_MODEL)) {
    cameraModel = readAsciiTag(buf, ifd0Tags.get(TAG_MODEL)!, base, r32);
  }

  // Locate GPS IFD via tag 0x8825 in IFD0.
  let lat: number | null = null;
  let lng: number | null = null;
  if (ifd0Tags.has(TAG_GPS_IFD)) {
    const gpsOffset = base + (ifd0Tags.get(TAG_GPS_IFD)!.valueOffset ?? 0);
    const gpsTags = readIfd(buf, gpsOffset, base, r16, r32);
    const latRef = gpsTags.has(TAG_GPS_LAT_REF) ? readAsciiTag(buf, gpsTags.get(TAG_GPS_LAT_REF)!, base, r32) : null;
    const lngRef = gpsTags.has(TAG_GPS_LNG_REF) ? readAsciiTag(buf, gpsTags.get(TAG_GPS_LNG_REF)!, base, r32) : null;
    if (gpsTags.has(TAG_GPS_LAT)) {
      lat = readRationalDms(buf, gpsTags.get(TAG_GPS_LAT)!, base, little);
      if (lat != null && latRef && latRef.startsWith("S")) lat = -lat;
    }
    if (gpsTags.has(TAG_GPS_LNG)) {
      lng = readRationalDms(buf, gpsTags.get(TAG_GPS_LNG)!, base, little);
      if (lng != null && lngRef && lngRef.startsWith("W")) lng = -lng;
    }
  }

  // EXIF sub-IFD has the original-datetime tag.
  let timestamp: string | null = null;
  if (ifd0Tags.has(TAG_EXIF_IFD)) {
    const exifOffset = base + (ifd0Tags.get(TAG_EXIF_IFD)!.valueOffset ?? 0);
    const exifTags = readIfd(buf, exifOffset, base, r16, r32);
    if (exifTags.has(TAG_DATETIME_ORIGINAL)) {
      const dtRaw = readAsciiTag(buf, exifTags.get(TAG_DATETIME_ORIGINAL)!, base, r32);
      // EXIF format: "YYYY:MM:DD HH:MM:SS"
      if (dtRaw && dtRaw.length >= 19) {
        const m = dtRaw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          timestamp = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
        }
      }
    }
  }

  return { lat, lng, timestamp, camera_model: cameraModel };
}

interface IfdEntry {
  type: number;
  count: number;
  valueOffset: number;
  rawOffset: number;
}

function readIfd(
  buf: Buffer,
  offset: number,
  base: number,
  r16: (o: number) => number,
  r32: (o: number) => number,
): Map<number, IfdEntry> {
  const tags = new Map<number, IfdEntry>();
  if (offset >= buf.length) return tags;
  const numEntries = r16(offset);
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = offset + 2 + i * 12;
    if (entryOffset + 12 > buf.length) break;
    const tag = r16(entryOffset);
    const type = r16(entryOffset + 2);
    const count = r32(entryOffset + 4);
    const valueOffset = r32(entryOffset + 8);
    tags.set(tag, { type, count, valueOffset, rawOffset: entryOffset + 8 });
  }
  return tags;
}

function readAsciiTag(buf: Buffer, entry: IfdEntry, base: number, _r32: (o: number) => number): string | null {
  const total = entry.count;
  if (total <= 4) {
    return buf.toString("ascii", entry.rawOffset, entry.rawOffset + Math.min(total - 1, 4)).replace(/\0+$/, "");
  }
  const start = base + entry.valueOffset;
  if (start + total > buf.length) return null;
  return buf.toString("ascii", start, start + total - 1).replace(/\0+$/, "");
}

function readRationalDms(
  buf: Buffer,
  entry: IfdEntry,
  base: number,
  little: boolean,
): number | null {
  const start = base + entry.valueOffset;
  if (start + 24 > buf.length) return null;
  const r32 = (off: number) => (little ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  const num1 = r32(start);
  const den1 = r32(start + 4);
  const num2 = r32(start + 8);
  const den2 = r32(start + 12);
  const num3 = r32(start + 16);
  const den3 = r32(start + 20);
  if (den1 === 0 || den2 === 0 || den3 === 0) return null;
  const deg = num1 / den1;
  const min = num2 / den2;
  const sec = num3 / den3;
  return deg + min / 60 + sec / 3600;
}

// Haversine — distance in meters between two lat/lng pairs.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
