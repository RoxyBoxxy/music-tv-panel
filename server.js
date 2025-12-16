import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import dbPromise from "./libs/db.js";
import {
  startMainFfmpegManually,
  stopMainFfmpeg,
  isFfmpegRunning,
  getFfmpegStats,
  startScheduler
} from "./libs/scheduler.js";
import { addVideoFromUrl } from "./libs/ytdl.js";
import multer from "multer";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { requireAuth, checkUserSetup } from "./libs/auth.js";
import { fetchYearAndGenre } from "./libs/metaFetch.js";
import { publishChannel } from "./libs/publish.js";
import fs from 'fs'
import os from "os";
import { spawn } from "child_process";

const app = express();

const PORT = process.env.PORT || 4456;
const SESSION_SECRET = process.env.SESSION_SECRET || "changeme";
const MEDIA_ROOT = process.env.MEDIA_ROOT
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(SESSION_SECRET));

app.use("/public", express.static("public"));
app.use("/hls", express.static("hls"));


app.use(checkUserSetup);

// --- Search index (SQLite FTS5) ---
async function ensureAndRebuildVideoFts({ rebuild = false } = {}) {
  const db = await dbPromise;

  // Create FTS table (keeps a searchable index of videos)
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts
    USING fts5(
      title,
      artist,
      genre,
      content='videos',
      content_rowid='id'
    );
  `);

  // Triggers to keep FTS in sync with videos table
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS videos_ai AFTER INSERT ON videos BEGIN
      INSERT INTO videos_fts(rowid, title, artist, genre)
      VALUES (new.id, COALESCE(new.title,''), COALESCE(new.artist,''), COALESCE(new.genre,''));
    END;
  `);
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS videos_ad AFTER DELETE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, title, artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.genre);
    END;
  `);
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS videos_au AFTER UPDATE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, title, artist, genre)
      VALUES('delete', old.id, old.title, old.artist, old.genre);
      INSERT INTO videos_fts(rowid, title, artist, genre)
      VALUES (new.id, COALESCE(new.title,''), COALESCE(new.artist,''), COALESCE(new.genre,''));
    END;
  `);

  // Initial population (idempotent)
  await db.exec(`
    INSERT INTO videos_fts(rowid, title, artist, genre)
    SELECT id, COALESCE(title,''), COALESCE(artist,''), COALESCE(genre,'')
    FROM videos
    WHERE id NOT IN (SELECT rowid FROM videos_fts);
  `);

  // Daily maintenance: REBUILD (optional) + OPTIMIZE
  if (rebuild) {
    await db.exec(`INSERT INTO videos_fts(videos_fts) VALUES('rebuild');`);
  }
  await db.exec(`INSERT INTO videos_fts(videos_fts) VALUES('optimize');`);
}


const COOKIES_DIR = path.join(process.cwd(), "cookies");
if (!fs.existsSync(COOKIES_DIR)) {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Initial user setup (runs only if no users exist)
app.get("/setup-user", async (req, res) => {
  const db = await dbPromise;
  const row = await db.get("SELECT COUNT(*) AS cnt FROM users");
  if (row.cnt > 0) return res.redirect("/login");
  res.render("setup-user", { error: null });
});

app.post("/setup-user/create", async (req, res) => {
  const { username, password } = req.body;
  const db = await dbPromise;
  const row = await db.get("SELECT COUNT(*) AS cnt FROM users");
  if (row.cnt > 0) return res.redirect("/login");

  if (!username || !password) {
    return res.render("setup-user", { error: "Username and password required" });
  }

  const hash = await bcrypt.hash(password, 10);
  await db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", username, hash);

  res.redirect("/login");
});

// Adding User Endpoint

app.post("/api/add-user", requireAuth, async (req, res) => {
  const { username, password } = req.body;

  const db = await dbPromise;

  // Check if user already exists
  const existing = await db.get("SELECT * FROM users WHERE username = ?", username);

  if (existing) {
    // user already exists
    return res.json({ ok: false, error: "User already exists" });
  }
  const hash = await bcrypt.hash(password, 10);
  // create user
  db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", username, hash);
  res.json({ ok: true });
});

// login
app.get("/login", (req, res) => {
  if (req.cookies.auth) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const db = await dbPromise;
  const user = await db.get("SELECT * FROM users WHERE username = ?", username);

  if (!user) {
    res.status(401);
    return res.render("login", { error: "Invalid username or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401);
    return res.render("login", { error: "Invalid username or password" });
  }

  const token = jwt.sign({ user_id: user.id, username: user.username }, SESSION_SECRET, { expiresIn: "7d" });
  res.cookie("auth", token, { httpOnly: true, sameSite: "strict" });
  res.redirect("/");
});

app.post("/logout", (req, res) => {
  res.clearCookie("auth");
  res.redirect("/login");
});

// dashboard
app.get("/", requireAuth, (req, res) => {
  res.render("index", { user: req.user });
});

// add video page
app.get("/add", requireAuth, (req, res) => {
  res.render("add", { user: req.user });
});

// edit video page
app.get("/videos/:id/edit", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const video = await db.get("SELECT * FROM videos WHERE id = ?", req.params.id);
  if (!video) return res.status(404).send("Video not found");
  res.render("edit-video", { user: req.user, video });
});

app.post("/api/grab", requireAuth, async (req, res) => {
  const { artist, track } = req.body;
  const result = await fetchYearAndGenre(artist, track);
  res.json(result)
});

// settings page
app.get("/settings", requireAuth, (req, res) => {
  res.render("settings", { user: req.user });
});

// media page
app.get("/media", requireAuth, (req, res) => {
  res.render("media", { user: req.user });
});
app.get("/users", requireAuth, (req, res) => {
  res.render("users", { user: req.user });
});

// playlist editor
app.get("/playlists/:id", requireAuth, (req, res) => {
  res.render("playlist", { user: req.user, playlistId: req.params.id });
});

// API: add URL via yt-dlp
app.post("/api/add-url", requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ ok: false, error: "URL required" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const send = (type, data) => {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  send("status", { message: "Starting yt-dlp import", url });

  try {
    await addVideoFromUrl(url, {
      onLog: (line) => send("log", { line }),
      onMeta: (meta) => send("meta", meta),
      onProgress: (progress) => send("progress", progress),
      onPlaylist: (info) => send("playlist", info),
      onVideoComplete: (video) => send("video", video)
    });

    send("done", { ok: true });
    res.end();
  } catch (e) {
    console.error("add-url error", e);
    send("error", { message: e.message });
    res.end();
  }
});

// API: add URL via yt-dlp (SSE stream)
app.get("/api/add-url/stream", requireAuth, async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).end();
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const send = (type, data) => {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // keep-alive ping so proxies don’t close the stream
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  send("status", { message: "Starting yt-dlp import", url });

  try {
    await addVideoFromUrl(url, {
      onLog: (line) => send("log", { line }),
      onMeta: (meta) => send("meta", meta),
      onProgress: (progress) => send("progress", progress),
      onPlaylist: (info) => send("playlist", info),
      onVideoComplete: (video) => send("video", video)
    });

    send("done", { ok: true });
  } catch (e) {
    console.error("add-url stream error", e);
    send("error", { message: e.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// API: videos
app.get("/api/videos", requireAuth, async (req, res) => {
  const db = await dbPromise;

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(parseInt(req.query.limit || "25", 10), 100);
  const offset = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const source = (req.query.source || "").trim();

  const where = [];
  const params = [];

  if (q) {
    // Prefer FTS (fast + ranked). Fallback to LIKE if FTS isn't available.
    try {
      where.push(`id IN (SELECT rowid FROM videos_fts WHERE videos_fts MATCH ?)`);
      // Basic MATCH query; add a trailing * for prefix matches
      const ftsQuery = q
        .split(/\s+/)
        .filter(Boolean)
        .map(t => (t.includes('"') ? t : `${t}*`))
        .join(" ");
      params.push(ftsQuery);
    } catch {
      where.push("(title LIKE ? OR artist LIKE ? OR genre LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
  }

  if (source) {
    if (source === "YouTube") {
      where.push("source_url IS NOT NULL");
    } else if (source === "Local") {
      where.push("source_url IS NULL");
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = await db.get(
    `SELECT COUNT(*) AS cnt FROM videos ${whereSql}`,
    params
  );

  const total = totalRow.cnt;

  const rows = await db.all(
    `
    SELECT id, path, title, artist, year, genre, duration, is_ident, source_url
    FROM videos
    ${whereSql}
    ORDER BY artist, title
    LIMIT ? OFFSET ?
    `,
    ...params,
    limit,
    offset
  );

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    rows
  });
});

app.get("/api/users", async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all(`
    SELECT id, username
    FROM users
  `);
  res.json(rows);
});

app.post("/api/videos/:id/ident", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;
  const { is_ident } = req.body;
  await db.run("UPDATE videos SET is_ident = ? WHERE id = ?", is_ident ? 1 : 0, id);
  res.json({ ok: true });
});

// update video metadata
app.post("/api/videos/:id/edit", requireAuth, async (req, res) => {
  const { title, artist, year, genre, is_ident } = req.body;
  const db = await dbPromise;

  await db.run(
    "UPDATE videos SET title = ?, artist = ?, year = ?, genre = ?, is_ident = ? WHERE id = ?",
    title || null,
    artist || null,
    year || null,
    genre || null,
    is_ident ? 1 : 0,
    req.params.id
  );

  res.json({ ok: true });
});

// delete video
app.delete("/api/videos/:id", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const media = await db.get("SELECT * FROM videos WHERE id = ?", req.params.id)
  fs.unlinkSync(MEDIA_ROOT + '/' + media.path);
  await db.run("DELETE FROM playlist_items WHERE video_id = ?", req.params.id);
  await db.run("DELETE FROM videos WHERE id = ?", req.params.id);

  res.json({ ok: true });
});

// playlists
app.get("/api/playlists", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const pl = await db.all("SELECT * FROM playlists ORDER BY id");
  res.json(pl);
});

app.post("/api/playlists", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { name, description } = req.body;
  const result = await db.run(
    "INSERT INTO playlists (name, description) VALUES (?, ?)",
    name,
    description || null
  );
  res.json({ ok: true, id: result.lastID });
});

app.post("/api/playlists/:id/activate", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;
  await db.exec("BEGIN");
  try {
    await db.run("UPDATE playlists SET is_active = 0");
    await db.run("UPDATE playlists SET is_active = 1 WHERE id = ?", id);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  res.json({ ok: true });
});

// playlist items
app.get("/api/playlists/:id/items", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all(`
    SELECT pi.id, pi.video_id, pi.position, v.title, v.artist, v.genre
    FROM playlist_items pi
    JOIN videos v ON v.id = pi.video_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.position ASC
  `, req.params.id);
  res.json(rows);
});

app.post("/api/playlists/:id/add", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;
  const { video_id } = req.body;
  const posRow = await db.get(
    "SELECT COALESCE(MAX(position), 0) AS max_pos FROM playlist_items WHERE playlist_id = ?",
    id
  );
  const pos = (posRow?.max_pos || 0) + 1;

  await db.run(`
    INSERT INTO playlist_items (playlist_id, video_id, position)
    VALUES (?, ?, ?)
  `, id, video_id, pos);

  res.json({ ok: true });
});

app.patch("/api/playlists/:id/order", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { order } = req.body;
  await db.exec("BEGIN");
  try {
    for (let i = 0; i < order.length; i++) {
      const itemId = order[i];
      await db.run("UPDATE playlist_items SET position = ? WHERE id = ?", i + 1, itemId);
    }
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  res.json({ ok: true });
});

// now playing
app.get("/api/now-playing", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = await db.get(
    "SELECT v.id, v.title, v.artist, v.year, v.genre, v.path " +
    "FROM playout_log p JOIN videos v ON v.id = p.video_id " +
    "ORDER BY p.id DESC LIMIT 1"
  );
  res.json(row || {});
});
// API: get all settings
app.get("/api/settings", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all("SELECT key, value FROM settings");
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  res.json({ ok: true, settings: result });
});

app.post("/api/settings", requireAuth, upload.single("logo"), async (req, res) => {
  const db = await dbPromise;
  const body = req.body;

  await db.exec("BEGIN");
  try {
    for (const key of Object.keys(body)) {
      await db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        String(body[key])
      );
    }

    if (req.file) {
      const fs = await import("fs");
      fs.renameSync(req.file.path, "./logo.png");
      await db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        "logo_path",
        "logo.png"
      );
    }

    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    console.error("settings update error", e);
    return res.status(500).json({ ok: false, error: e.message });
  }

  res.json({ ok: true });
});

// API: upload yt-dlp cookies.txt
app.post("/api/ytdlp/cookies", requireAuth, upload.single("cookies"), async (req, res) => {
  if (!req.file) {
    return res.json({ ok: false, error: "No cookies file uploaded" });
  }

  const targetPath = path.join(COOKIES_DIR, "youtube.txt");

  try {
    fs.renameSync(req.file.path, targetPath);
    fs.chmodSync(targetPath, 0o600);

    const db = await dbPromise;
    await db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "ytd_cookies_path",
      targetPath
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("cookies upload error", e);
    res.json({ ok: false, error: e.message });
  }
});

// API: test yt-dlp cookies authentication
app.get("/api/ytdlp/test", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = await db.get(
    "SELECT value FROM settings WHERE key = ?",
    "ytd_cookies_path"
  );

  if (!row || !row.value || !fs.existsSync(row.value)) {
    return res.json({ ok: false, error: "No cookies file configured" });
  }

  const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  const args = [
    "--cookies", row.value,
    "--skip-download",
    "--no-warnings",
    testUrl
  ];

  const proc = spawn("yt-dlp", args);

  let stderr = "";

  proc.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  proc.on("close", (code) => {
    if (code === 0) {
      res.json({ ok: true });
    } else {
      res.json({
        ok: false,
        error: stderr.trim() || `yt-dlp exited with code ${code}`
      });
    }
  });
});

app.post("/api/ffmpeg/start",  (req, res) => {
  res.json({ ok: true, started: startMainFfmpegManually() });
});

app.post("/api/ffmpeg/stop",  (req, res) => {
  res.json({ ok: true, stopped: stopMainFfmpeg() });
});


const server = app.listen(PORT, () => {
  console.log(`
███████╗██╗     ██╗   ██╗██╗  ██╗████████╗██╗   ██╗
██╔════╝██║     ██║   ██║╚██╗██╔╝╚══██╔══╝██║   ██║
█████╗  ██║     ██║   ██║ ╚███╔╝    ██║   ██║   ██║
██╔══╝  ██║     ██║   ██║ ██╔██╗    ██║   ╚██╗ ██╔╝
██║     ███████╗╚██████╔╝██╔╝ ██╗   ██║    ╚████╔╝ 
╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝     ╚═══╝  
`);
  console.log("Running and listening on port", PORT);
  startScheduler();
  const triggerPublish = () => {
    publishChannel().catch((err) => console.error("publishChannel error", err));
  };
  triggerPublish();
  setInterval(triggerPublish, 30 * 1000);

  // Build/maintain the search index now, then daily at 04:00 (UK time)
  ensureAndRebuildVideoFts({ rebuild: true })
    .then(() => console.log("✅ videos_fts indexed"))
    .catch((e) => console.error("❌ videos_fts index error", e));

  const scheduleDailyIndex = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(4, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };

  setTimeout(function runDailyIndex() {
    ensureAndRebuildVideoFts({ rebuild: true })
      .then(() => console.log("✅ videos_fts rebuilt"))
      .catch((e) => console.error("❌ videos_fts rebuild error", e));

    setTimeout(runDailyIndex, 24 * 60 * 60 * 1000);
  }, scheduleDailyIndex());
});

const wss = new WebSocketServer({ server, path: "/api/ffmpeg/stats" });

wss.on("connection", (ws) => {
  // Send initial snapshot
  ws.send(JSON.stringify(getFfmpegStats()));

  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(getFfmpegStats()));
    }
  }, 100);

  ws.on("close", () => {
    clearInterval(interval);
  });
});
