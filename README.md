# Music TV Panel (yt-dlp + sqlite3)

Node.js panel + scheduler for a 24/7 music video TV channel with:

- HLS output via ffmpeg
- Now playing text embedded in video
- Logo overlay (PNG)
- Idents every N tracks
- Playlists with drag-and-drop ordering
- Simple login protection (single admin user)
- Uses `sqlite` + `sqlite3` (async/await)
- **Imports videos with `yt-dlp` from YouTube URLs**
- Saves files as `media/Artist/Track.mp4`

## Requirements

- Node.js 18+
- ffmpeg installed and on PATH
- `yt-dlp` installed and on PATH (or configure `YTDLP_BIN` in `.env`)
- A `logo.png` file in project root

## Setup

```bash
cp .env.example .env
# edit .env with your settings (MEDIA_ROOT, admin user/pass, etc.)
npm install
mkdir -p media hls engine overlay
```

Place your assets:

- `logo.png` in project root (transparent PNG logo)

## Import videos (yt-dlp)

Run the panel:

```bash
npm start
```

Then:

1. Go to `http://localhost:4456/login`
2. Log in with the credentials from `.env`
3. Click **Add Video** in the top bar
4. Paste a YouTube URL and submit

The app will:

- Call `yt-dlp` to fetch metadata
- Derive:
  - `artist` (yt-dlp artist / channel / from title)
  - `title` (track/title)
  - `year` from upload date
  - `genre` from categories/tags
  - `duration` from metadata
- Download the video into:
  - `media/Artist/Track.mp4`
- Insert a row into `panel.sqlite`

## Playout

The scheduler:

- Picks videos from the DB
- Writes a concat playlist and nowplaying.txt
- Spawns ffmpeg to output HLS segments + `stream.m3u8` into `./hls`

Access stream at:

```
http://your-server:4456/hls/stream.m3u8
```

## Notes

- Current scheduler is simple rotation with idents every 4 tracks.
- To mark a video as an ident, toggle the **Ident?** checkbox in the dashboard.
- For production, consider:
  - Strong `SESSION_SECRET`
  - Reverse proxy (nginx) in front
  - IP/VPN restriction for admin access
