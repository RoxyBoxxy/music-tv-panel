import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import dbPromise from "./db.js";

const MEDIA_ROOT = process.env.MEDIA_ROOT || "./media";
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`yt-dlp exited with ${code}: ${stderr}`));
    });
  });
}

function safeName(str) {
  if (!str) return "Unknown";
  return str.replace(/[\/:*?"<>|]/g, "").trim() || "Unknown";
}

function cleanTitle(raw) {
  if (!raw) return raw;

  const junkPatterns = [
    /\(.*official.*video.*\)/gi,
    /\[.*official.*video.*\]/gi,
    /\(.*official.*audio.*\)/gi,
    /\[.*official.*audio.*\]/gi,
    /\(.*music.*video.*\)/gi,
    /\[.*music.*video.*\]/gi,
    /\(.*lyric.*video.*\)/gi,
    /\[.*lyric.*video.*\]/gi,
    /\(.*lyrics.*\)/gi,
    /\[.*lyrics.*\]/gi,
    /\(.*remaster.*\)/gi,
    /\[.*remaster.*\]/gi,
    /\(.*4k.*\)/gi,
    /\[.*4k.*\]/gi,
    /\(.*8k.*\)/gi,
    /\[.*8k.*\]/gi,
    /\(.*hd.*\)/gi,
    /\[.*hd.*\]/gi,
    /\(.*live.*\)/gi,
    /\[.*live.*\]/gi,
    /\(.*visualizer.*\)/gi,
    /\[.*visualizer.*\]/gi,
    /\(.*audio.*\)/gi,
    /\[.*audio.*\]/gi
  ];

  let cleaned = raw;
  for (const pattern of junkPatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  cleaned = cleaned.replace(/\[\s*\]$/, "").trim();
  cleaned = cleaned.replace(/\(\s*\)$/, "").trim();
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned.trim();
}

function parseArtistTrackFromTitle(title) {
  title = cleanTitle(title);
  if (!title) return { artist: null, track: null };
  const parts = title.split(" - ");
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      track: parts.slice(1).join(" - ").trim()
    };
  }
  return { artist: null, track: title.trim() };
}

export async function addVideoFromUrl(url, logCallback = () => {}) {
function streamYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.on("data", (d) => {
      const text = d.toString();
      logCallback(text.trim()); // raw
      // Hybrid: highlight useful parts
      if (/download/i.test(text)) logCallback("➡ Downloading video…");
      if (/Merging formats/i.test(text)) logCallback("➡ Merging audio & video…");
    });

    proc.stderr.on("data", (d) => {
      const text = d.toString();
      logCallback(text.trim()); // ytdlp prints progress here
      if (/ETA/i.test(text)) logCallback("➡ " + text.trim());
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });
}
  logCallback("🔍 Extracting metadata…");
  const metaRes = await runYtDlp(["-J", "--no-warnings", "--skip-download", url]);
  const info = JSON.parse(metaRes.stdout);

  let artist = info.artist || null;
  let track = info.track || null;

  const fromTitle = parseArtistTrackFromTitle(info.title);
  if (!artist) artist = fromTitle.artist || info.channel || info.uploader || "Unknown";
  if (!track) track = fromTitle.track || info.title || "Unknown";

  const year = info.upload_date ? parseInt(info.upload_date.slice(0, 4), 10) : null;
  let genre = null;
  if (Array.isArray(info.categories) && info.categories.length) {
    genre = info.categories[0];
  } else if (Array.isArray(info.tags) && info.tags.length) {
    genre = info.tags[0];
  }

  const duration = info.duration || null;

  const artistSafe = safeName(artist);
  const trackSafe = safeName(track);
  const ext = "mp4";

  const relPath = path.join(artistSafe,`${trackSafe}.${ext}`);
  const fullDir = path.join(MEDIA_ROOT, artistSafe);
  const fullPath = path.join(MEDIA_ROOT, relPath);

  fs.mkdirSync(fullDir, { recursive: true });

  const outTemplate = fullPath;
  logCallback(`🎬 Downloading: ${artist} - ${track}`);
  await streamYtDlp([
    "-f",
    "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]",
    "-o",
    outTemplate,
    "--no-warnings",
    url
  ]);
  logCallback("✅ Download complete");

  logCallback("📝 Saving to database…");
  const db = await dbPromise;
  const result = await db.run(
    `INSERT INTO videos (path, title, artist, year, genre, duration, is_ident, source_url)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    relPath,
    track,
    artist,
    year,
    genre,
    duration,
    url
  );

  const row = await db.get("SELECT * FROM videos WHERE id = ?", result.lastID);
  logCallback("🎉 Import finished!");
  return row;
}
