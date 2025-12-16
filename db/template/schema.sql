PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  artist TEXT,
  year INTEGER,
  genre TEXT,
  duration REAL,
  is_ident INTEGER DEFAULT 0,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_videos_is_ident ON videos(is_ident);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playout_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  played_at DATETIME,
  ended_at DATETIME,
  FOREIGN KEY (video_id) REFERENCES videos(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('channelName', 'FluxTV'),
  ('channelOwner', 'FluxTV'),
  ('channelURL', 'http://localhost:4456'),
  ('channelPublish', 'true'),
  ('ident_interval_minutes', '10'),
  ('ad_interval_minutes', '0'),
  ('default_fps', '24'),
  ('default_resolution', '1280x720'),
  ('bitrate_video', '2500k'),
  ('bitrate_audio', '128k'),
  ('buffer_size', '10000k'),
  ('ffmpeg_profile', 'main'),
  ('output_rtmp_url', null),
  ('ident_playlist', 'idents'),
  ('ad_playlist', 'ads'),
  ('no_repeat_minutes', '20'),
  ('media_dir', './media'),
  ('ytd_cookies_path', NULL),
  ('lastFMKey', null),
  ('rtmp_enabled', 'false');

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
