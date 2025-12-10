import "dotenv/config";
import express from "express";
import path from "path";
import dbPromise from "./libs/db.js";
import { startScheduler } from "./libs/scheduler.js";
import { addVideoFromUrl } from "./libs/ytdl.js";
import multer from "multer";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { requireAuth, checkUserSetup } from "./libs/auth.js";
import fs from 'fs'

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

app.use(checkUserSetup);

app.use("/public", express.static("public"));
app.use("/hls", express.static("hls"));

const upload = multer({ dest: "uploads/" });

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

// settings page
app.get("/settings", requireAuth, (req, res) => {
  res.render("settings", { user: req.user });
});

// media page
app.get("/media", requireAuth, (req, res) => {
  res.render("media", { user: req.user });
});

// playlist editor
app.get("/playlists/:id", requireAuth, (req, res) => {
  res.render("playlist", { user: req.user, playlistId: req.params.id });
});

// API: add URL via yt-dlp
app.post("/api/add-url", requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Error: URL required\n");
    return;
  }

  // Streaming headers
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache, no-transform",
  });

  function send(msg) {
    try {
      res.write(msg + "\n");
    } catch {}
  }

  send("Starting yt-dlp import…");
  send(`URL: ${url}`);

  try {
    // Pass a logging callback to addVideoFromUrl so it can stream messages
    const video = await addVideoFromUrl(url, (log) => {
      send(log);
    });

    send("");
    send("=== DONE ===");
    send(`Imported: ${video.artist} - ${video.title}`);

    res.end();
  } catch (e) {
    console.error("add-url error", e);
    send("ERROR: " + e.message);
    res.end();
  }
});

// API: videos
app.get("/api/videos", requireAuth, async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all(`
    SELECT id, path, title, artist, year, genre, duration, is_ident, source_url
    FROM videos
    ORDER BY artist, title
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

app.listen(PORT, () => {
  console.log("Music TV panel (yt-dlp) listening on port", PORT);
  startScheduler().catch((e) => console.error("Scheduler error", e));
});
