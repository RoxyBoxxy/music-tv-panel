import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import dbPromise from "./db.js";


const UDP_TARGET = "udp://127.0.0.1:554?pkt_size=1316";
const NP_FILE = "./overlay/nowplaying.txt";
const ISNEW_FILE = "./overlay/isnew.txt";
const NP_TITLE_FILE = "./overlay/title.txt";
const NP_ARTIST_FILE = "./overlay/artist.txt";
const MEDIA_ROOT = "./media";
// settings cache
let settingsCache = {};

async function loadSettings() {
  const db = await dbPromise;
  const rows = await db.all("SELECT key, value FROM settings");
  settingsCache = {};
  for (const r of rows) {
    settingsCache[r.key] = r.value;
  }
}

//loadSettings()

//let MEDIA_ROOT = settingsCache.media_dir

let normalSinceIdent = 0;
let mainFfmpeg = null;
let schedulerPaused = false;
let schedulerStarted = false;
let currentPusher = null;

let ffmpegStats = {
  running: false,
  fps: null,
  bitrate: null,
  speed: null,
  frame: null,
  dropped_frames: null,
  out_time: null,
  lastUpdate: null
};
const rtmp_enabled = settingsCache.rtmp_enabled === 'true';

export function getFfmpegStats() {
  return ffmpegStats;
}

export function isFfmpegRunning() {
  return !!mainFfmpeg;
}

export function stopMainFfmpeg() {
  console.log("Stopping all FFmpeg processes...");
  schedulerPaused = true;

  if (currentPusher) {
    try {
      currentPusher.kill("SIGTERM");
    } catch { }
    currentPusher = null;
  }

  if (mainFfmpeg) {
    mainFfmpeg.kill("SIGTERM");
    mainFfmpeg = null;
  }

  ffmpegStats.running = false;
  return true;
}

export function startMainFfmpegManually() {
  schedulerPaused = false;
  if (!mainFfmpeg) startMainFfmpeg();
  return true;
}

export async function startAll() {
  await startScheduler();
}

export function stopAll() {
  stopMainFfmpeg();
}

async function detectGpuEncoder() {
  const platform = process.platform;
  let encoder = null;

  function hasEncoder(name) {
    try {
      const out = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {
        encoding: "utf8",
      });
      return out.stdout.includes(name);
    } catch {
      return false;
    }
  }

  if (platform === "darwin") {
    if (hasEncoder("videotoolbox")) encoder = "h264_videotoolbox";
  } else if (platform === "win32") {
    if (hasEncoder("h264_nvenc")) encoder = "h264_nvenc";
    else if (hasEncoder("h264_amf")) encoder = "h264_amf";
    else if (hasEncoder("h264_qsv")) encoder = "h264_qsv";
  } else if (platform === "linux") {
    if (hasEncoder("h264_nvenc")) encoder = "h264_nvenc";
    else if (hasEncoder("h264_qsv")) encoder = "h264_qsv";
    else if (hasEncoder("h264_vaapi")) encoder = "h264_vaapi";
  }

  console.log("GPU detection:", { platform, encoder });
  return encoder;
}

function getVideoEncoder() {
  // Single place to decide encoder so all ffmpeg calls are consistent
  return settingsCache.gpu_encoder || "libx264";
}

function ensureDirsAndFifo() {
  // required directories
  ["engine", "overlay", MEDIA_ROOT].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  if (!fs.existsSync("public/hls")) fs.mkdirSync("public/hls", { recursive: true });
}

async function pickNextTrack(allowedGenres = null, forceIdent = false) {
  const db = await dbPromise;
  const useIdent = forceIdent;
  const noRepeatMinutes = parseInt(settingsCache.no_repeat_minutes || "240", 10); // default 4 hours

  if (useIdent) {
    const ident = await db.get(`
      SELECT id, path, title, artist, year, genre, duration
      FROM videos
      WHERE is_ident = 1
      ORDER BY RANDOM() LIMIT 1
    `);
    if (ident) {
      normalSinceIdent = 0;
      return ident;
    }
  }

  let row;
  if (allowedGenres && allowedGenres.length) {
    const placeholders = allowedGenres.map(() => "?").join(",");
    row = await db.get(
      `
      SELECT id, path, title, artist, year, genre, duration
      FROM videos
      WHERE is_ident = 0
      AND genre IN (${placeholders})
      AND id NOT IN (
        SELECT video_id
        FROM playout_log
        WHERE played_at >= datetime('now', '-' || ? || ' minutes')
      )
      ORDER BY RANDOM() LIMIT 1
      `,
      [...allowedGenres, noRepeatMinutes]
    );
  } else {
    row = await db.get(
      `
      SELECT id, path, title, artist, year, genre, duration
      FROM videos
      WHERE is_ident = 0
      AND id NOT IN (
        SELECT video_id
        FROM playout_log
        WHERE played_at >= datetime('now', '-' || ? || ' minutes')
      )
      ORDER BY RANDOM() LIMIT 1
      `,
      noRepeatMinutes
    );
  }

  if (row) {
    normalSinceIdent++;
  }

  return row;
}

function writeNowPlaying(meta) {
  let full = `${meta.artist || ""} - ${meta.title || ""}`;
  if (meta.year) full += ` (${meta.year})`;
  fs.writeFileSync(NP_FILE, full || "");

  // Split at first hyphen for B1 logic
  let artist = "";
  let title = "";

  const idx = full.indexOf(" - ");
  if (idx !== -1) {
    artist = full.slice(0, idx).trim();
    title = full.slice(idx + 3).trim();
  } else {
    artist = full.trim();
    title = "";
  }

  fs.writeFileSync(NP_ARTIST_FILE, artist);
  fs.writeFileSync(NP_TITLE_FILE, title);

  const currentYear = new Date().getFullYear();
  if (meta.year && String(meta.year).startsWith(String(currentYear))) {
    fs.writeFileSync(ISNEW_FILE, "NEW Music");
  } else {
    fs.writeFileSync(ISNEW_FILE, "");
  }
}

function startMainFfmpeg() {
  // Do not start if manually stopped
  if (schedulerPaused) return;
  if (mainFfmpeg) return;

  const inputUrl = "udp://127.0.0.1:554?fifo_size=5000000&overrun_nonfatal=1&timeout=0";
  if (rtmp_enabled) {
    const args = [
      "-fflags", "+genpts+nobuffer",
      "-analyzeduration", "0",
      "-probesize", "32k",
      "-i", inputUrl,

      "-progress", "pipe:1",
      "-stats_period", "1",

      "-c:v", "copy",
      "-c:a", "copy",
      "-f", "flv",
      settingsCache.output_rtmp_url,

      "-c:v", "copy",
      "-c:a", "copy",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "8",
      "-hls_flags", "delete_segments+append_list",
      "-hls_segment_filename", "public/hls/segment_%03d.ts",
      "public/hls/index.m3u8"
    ];
  }
  else {
    const args = [
      "-fflags", "+genpts+nobuffer",
      "-analyzeduration", "0",
      "-probesize", "32k",
      "-i", inputUrl,

      "-progress", "pipe:1",
      "-stats_period", "1",

      "-c:v", "copy",
      "-c:a", "copy",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "8",
      "-hls_flags", "delete_segments+append_list",
      "-hls_segment_filename", "public/hls/segment_%03d.ts",
      "public/hls/index.m3u8"
    ];
  }
  const args = [
    "-fflags", "+genpts+nobuffer",
    "-analyzeduration", "0",
    "-probesize", "32k",
    "-i", inputUrl,

    "-progress", "pipe:1",
    "-stats_period", "1",

    //"-c:v", "copy",
    //"-c:a", "copy",
    //"-f", "flv",
    //settingsCache.output_rtmp_url,

    "-c:v", "copy",
    "-c:a", "copy",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "8",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", "public/hls/segment_%03d.ts",
    "public/hls/index.m3u8"
  ];

  console.log("Starting main FFmpeg playout pipeline (UDP -> RTMP)...");
  mainFfmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "inherit"] });

  ffmpegStats.running = true;
  let buffer = "";

  mainFfmpeg.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const [key, value] = line.trim().split("=");
      if (!key) continue;
      ffmpegStats[key] = value;
      ffmpegStats.lastUpdate = Date.now();
    }
  });

  mainFfmpeg.on("close", (code) => {
    console.log("Main FFmpeg exited with code", code);
    mainFfmpeg = null;
    ffmpegStats.running = false;
    setTimeout(() => {
      if (!mainFfmpeg) {
        console.log("Restarting main FFmpeg after exit...");
        startMainFfmpeg();
      }
    }, 1000);
  });
}

function pushTrackToFifo(fullPath, durationSeconds) {
  console.log("Pushing track to FIFO:", fullPath);
  const baseAlpha =
    "if(lt(t,0.7),t/0.7, if(lt(t,5),1, if(lt(t,5.7),(5.7-t)/0.7,0)))";
  let alphaExpr = baseAlpha;
  const dur = Number(durationSeconds);
  if (Number.isFinite(dur) && dur > 12) {
    const d = dur.toFixed(2);
    const d57 = (dur - 5.7).toFixed(2);
    const d5 = (dur - 5).toFixed(2);
    const d07 = (dur - 0.7).toFixed(2);
    alphaExpr =
      `if(lt(t,0.7),t/0.7,` +
      ` if(lt(t,5),1,` +
      ` if(lt(t,5.7),(5.7-t)/0.7,` +
      ` if(lt(t,${d57}),0,` +
      ` if(lt(t,${d5}),(t-${d57})/0.7,` +
      ` if(lt(t,${d07}),1,` +
      ` if(lt(t,${d}),(${d}-t)/0.7,0)` +
      ` ))))))`;
  }
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-re",
      "-i",
      fullPath,
      "-i",
      "logo.png",
      "-filter_complex",
      " [0:v]scale=1280:720:force_original_aspect_ratio=decrease," +
      " pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black," +
      " fps=" + settingsCache.default_fps + ",format=yuv420p,setsar=1[vmain];" +

      " [1:v]scale=140:-1[logo];" +
      " [vmain][logo]overlay=x=W-w-20:y=20[with_logo];" +

      " [with_logo]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:" +
      " textfile=overlay/title.txt:reload=1:fontsize=42:fontcolor=white:" +
      " x=40:y=H-140:alpha='" + alphaExpr + "'[t1];" +

      " [t1]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:" +
      " textfile=overlay/artist.txt:reload=1:fontsize=30:fontcolor=white:" +
      " x=40:y=H-95:alpha='" + alphaExpr + "'[t2];" +

      " [t2]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:" +
      " textfile=overlay/isnew.txt:reload=1:fontsize=28:fontcolor=0xff3300ff:" +
      " x=W-tw-40:y=H-140:alpha='" + alphaExpr + "'[outv]",
      "-map",
      "[outv]",
      "-map",
      "0:a",
      "-c:v",
      getVideoEncoder(),
      "-s",
      settingsCache.default_resolution,
      "-preset",
      "veryfast",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-maxrate",
      settingsCache.bitrate_video,
      "-bufsize",
      "10000k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      settingsCache.bitrate_audio,

      "-f",
      "mpegts",
      UDP_TARGET,
    ];
    const pusher = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    currentPusher = pusher;

    // Mirror ffmpeg output for logging
    pusher.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    pusher.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    pusher.on("close", (code) => {
      currentPusher = null;
      if (code === 0) {
        console.log("Finished pushing track:", fullPath);
        resolve();
      } else {
        console.error("Track pusher ffmpeg exited with code", code);
        reject(new Error("Track pusher ffmpeg failed with code " + code));
      }
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startScheduler() {
  if (schedulerStarted) {
    console.log("Scheduler already running, resuming playback");
    schedulerPaused = false;
    if (!mainFfmpeg) startMainFfmpeg();
    return;
  }

  schedulerStarted = true;

  ensureDirsAndFifo();
  console.log("TV scheduler started (yt-dlp + UDP RTMP mode)");

  await loadSettings();
  const gpu = await detectGpuEncoder();
  if (gpu) settingsCache.gpu_encoder = gpu;
  setInterval(loadSettings, 60000); // refresh settings every 60s

  const db = await dbPromise;
  const allowedGenres = null;

  // start continuous encoder (UDP -> RTMP)
  startMainFfmpeg();

  while (true) {
    if (schedulerPaused) {
      await wait(500);
      continue;
    }
    // Ensure main playout FFmpeg is always running before pushing into UDP
    if (!mainFfmpeg && !schedulerPaused) {
      console.log("Main FFmpeg not running, restarting playout pipeline...");
      startMainFfmpeg();
      // Give FFmpeg a moment to open the UDP socket before we write to it again
      await wait(1000);
    }

    const identInterval =
      parseInt(settingsCache.ident_interval_minutes || "10", 10) *
      60 *
      1000;
    const now = Date.now();
    if (!global.lastIdentTime) global.lastIdentTime = 0;

    let forceIdent = false;
    if (now - global.lastIdentTime >= identInterval) {
      forceIdent = true;
      global.lastIdentTime = now;
    }

    const next = await pickNextTrack(allowedGenres, forceIdent);
    if (!next) {
      console.log("No tracks in DB yet, sleeping 10s.");
      await wait(10000);
      continue;
    }

    const fullPath = path.join(MEDIA_ROOT, next.path);
    writeNowPlaying(next);

    // Insert row with played_at timestamp
    const logRes = await db.run(
      `INSERT INTO playout_log (video_id, played_at)
       VALUES (?, datetime('now'))`,
      next.id
    );
    const logId = logRes.lastID;

    try {
      // this will block until ffmpeg finishes pushing the file
      await pushTrackToFifo(fullPath, next.duration);

      // Update ended_at when playback has ended
      await db.run(
        `UPDATE playout_log
         SET ended_at = datetime('now')
         WHERE id = ?`,
        logId
      );
    } catch (e) {
      console.error("Error while pushing track to UDP:", e);
      await wait(2000);
    }
  }
}