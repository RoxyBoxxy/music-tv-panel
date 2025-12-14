import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import dbPromise from "./db.js";

async function getYtdlpCookieArgs() {
  try {
    const db = await dbPromise;
    const row = await db.get(
      "SELECT value FROM settings WHERE key = ?",
      "ytd_cookies_path"
    );

    if (row && row.value && fs.existsSync(row.value)) {
      return ["--cookies", row.value];
    }
  } catch (e) {
    console.warn("yt-dlp cookie lookup failed:", e.message);
  }
  return [];
}

import { fetchYearAndGenre } from "./metaFetch.js";

const MEDIA_ROOT = process.env.MEDIA_ROOT || "./media";
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";

const YTDLP_HARDEN_ARGS = [
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "--sleep-interval", "1",
  "--max-sleep-interval", "5"
];

function runYtDlp(args) {
  return new Promise(async (resolve, reject) => {
    const cookieArgs = await getYtdlpCookieArgs();
    const proc = spawn(
      YTDLP_BIN,
      [...YTDLP_HARDEN_ARGS, ...cookieArgs, ...args],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
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

export async function addVideoFromUrl(url, callbacks = {}) {
  const {
    onLog = () => {},
    onMeta = () => {},
    onProgress = () => {},
    onPlaylist = () => {},
    onVideoComplete = () => {}
  } = callbacks;

  function streamYtDlp(args) {
    return new Promise(async (resolve, reject) => {
      const cookieArgs = await getYtdlpCookieArgs();
      const proc = spawn(
        YTDLP_BIN,
        [...YTDLP_HARDEN_ARGS, ...cookieArgs, ...args],
        {
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      proc.stdout.on("data", (d) => {
        const text = d.toString();
        onLog(text.trim());
      });

      proc.stderr.on("data", (d) => {
        const text = d.toString();
        onLog(text.trim());

        // Match yt-dlp download progress lines with speed and ETA
        const dlMatch = text.match(/\[download\]\s+([\d.]+)%.*?at\s+([^\s]+).*?ETA\s+([0-9:]+)/i);
        if (dlMatch) {
          const percent = Math.min(100, parseFloat(dlMatch[1]));
          const speed = dlMatch[2];
          const eta = dlMatch[3];
          onProgress({ percent, speed, eta });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Ensure progress completes even if yt-dlp was silent
          onProgress({ percent: 100 });
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });
  }

  onLog("🔍 Inspecting URL…");

  // First pass: detect playlist or single video
  const metaRes = await runYtDlp([
    "-J",
    "--no-warnings",
    "--flat-playlist",
    url
  ]);

  const info = JSON.parse(metaRes.stdout);

  const isPlaylist =
    Array.isArray(info.entries) ||
    (typeof info.title === "string" && /playlist/i.test(info.title)) ||
    /playlist/i.test(url);

  const entries = Array.isArray(info.entries) ? info.entries : [info];

  if (isPlaylist && entries.length > 1) {
    onPlaylist({ title: info.title || "Playlist", count: entries.length });
  }

  const db = await dbPromise;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];

    onProgress({ percent: 0 });

    // Full metadata for each entry
    const fullRes = await runYtDlp([
      "-J",
      "--no-warnings",
      entry.url || entry.id
    ]);

    const v = JSON.parse(fullRes.stdout);

    let artist = v.artist || null;
    let track = v.track || null;

    const fromTitle = parseArtistTrackFromTitle(v.title);
    if (!artist) artist = fromTitle.artist || v.channel || v.uploader || "Unknown";
    if (!track) track = fromTitle.track || v.title || "Unknown";

    const year = v.upload_date ? parseInt(v.upload_date.slice(0, 4), 10) : null;
    const duration = v.duration || null;

    const thumbnail = Array.isArray(v.thumbnails) && v.thumbnails.length
      ? v.thumbnails[v.thumbnails.length - 1].url
      : null;

    onMeta({
      artist,
      track,
      title: `${artist} - ${track}`,
      thumbnail,
      duration
    });

    const artistSafe = safeName(artist);
    const trackSafe = safeName(track);
    const relPath = path.join(artistSafe, `${trackSafe}.mp4`);
    const fullDir = path.join(MEDIA_ROOT, artistSafe);
    const fullPath = path.join(MEDIA_ROOT, relPath);

    fs.mkdirSync(fullDir, { recursive: true });

    onMeta({
      artist,
      track,
      index: index + 1,
      total: entries.length
    });

    onLog(`🎬 Downloading (${index + 1}/${entries.length}): ${artist} - ${track}`);

    await streamYtDlp([
      "--no-playlist",
      "-f",
      "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]",
      "-o",
      fullPath,
      "--no-warnings",
      entry.url || entry.id
    ]);

    onLog("✅ Download complete");

    const meta = await fetchYearAndGenre(artist, track, year);

    const result = await db.run(
      `INSERT INTO videos (path, title, artist, year, genre, duration, is_ident, source_url)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      relPath,
      track,
      artist,
      meta.year,
      meta.genre,
      duration,
      entry.url || url
    );

    const row = await db.get("SELECT * FROM videos WHERE id = ?", result.lastID);

    onVideoComplete(row);
  }

  onLog("🎉 All imports finished");
}
