![License](https://img.shields.io/github/license/RoxyBoxxy/FluxTV?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/RoxyBoxxy/FluxTV?style=for-the-badge)
![Node Version](https://img.shields.io/badge/node-18%2B-green?style=for-the-badge&logo=node.js&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-enabled-brightgreen?style=for-the-badge&logo=ffmpeg&logoColor=white)
![Dependencies](https://img.shields.io/librariesio/github/RoxyBoxxy/FluxTV?style=for-the-badge)

# FluxTV (yt-dlp + sqlite3)

FluxTV is a professional-grade, fully automated music-video broadcasting and scheduling system inspired by classic music TV channels like Kerrang!, Scuzz, and MTV2.
It ingests music videos, enriches them with metadata, schedules playback, overlays branding, and streams a continuous 24/7 channel using FFmpeg.

Built entirely in Node.js, SQLite, and FFmpeg, this project is designed for creators who want to run their own music-video channel — whether locally, publicly, or as part of a personal homelab broadcast setup. I created this project because there are no open-source solutions in this space, and most commercial systems require proprietary hardware or expensive licensing. FluxTV aims to bring that capability to everyone.

## Fetures

- Tailwind CSS
- HLS output via ffmpeg
- Now playing text embedded in video
- Logo overlay (PNG)
- Idents every N tracks
- Playlists with drag-and-drop ordering
- Simple login protection (Multi admin user)
- Uses `sqlite` + `sqlite3` (async/await)
- **Imports videos with `yt-dlp` from YouTube URLs**
- Saves files as `media/Artist/Track.mp4`
- Grabs Metadata from MusicBrains and Last.fm (Year and Genre)

## Status Overview

Below is a quick overview of what features are currently **working** and which are **not working / experimental**.

| Feature                           | Status           | Notes |
|----------------------------------|------------------|-------|
| Video import via yt-dlp          | ✅ Working       | Supports YouTube URLs, automatic metadata extraction. |
| Video storage (media/Artist/)    | ✅ Working       | Filename auto‑sanitised. |
| SQLite database integration      | ✅ Working       | Stores title, artist, year, genre, path, ident flag, etc. |
| Media page pagination            | ❌ Not implemented | 25 items per page, server‑side filters. |
| Search + filters                 | ✅ Working       | Search by title/artist/year/genre. |
| Live import log streaming        | ✅ Working       | Uses chunked responses to update modal in real time. |
| Now Playing overlay in ffmpeg    | ✅ Working       | Basic text works; advanced animation Not implemented. |
| Logo overlay (PNG)               | ✅ Working       | Uses ffmpeg filter_complex. |
| Scheduler continuous playback    | ⚠️ Unstable      | Occasional FFmpeg stall depending on input file timing. |
| No‑repeat rule (time‑based)      | ⚠️ Partially Working | Basic repeat‑avoidance works; advanced logic pending. |
| HLS output                       | ✅ Working       | Depends on ffmpeg stability & config. |
| Ident playback                   | ✅ Working       | Plays ident every N tracks. |
| Login system                     | ✅ Working       | Single admin account. |
| Multi User Login system          | 🛠️ In Progress   | Creating User accounts from the api works, UI not implemented yet. |
| Web UI modals                    | ⚠️ Improving     | Add‑modal stable; edit/delete modals still pending. |
| Multi‑playlist support           | ❌ Not implemented | Planned enhancement. |
| Drag‑and‑drop playlist ordering  | ❌ Not implemented | UI stub exists but backend not built. |
| Full scheduling logic (rotation) | ❌ Not implemented | Currently simple sequential rotation only. |
| Last.fm and MusicBrains intergration | ⚠️ Working with fall back | working but will fall back to youtube meta if NA. |

---

## Requirements

- Node.js 18+
- ffmpeg installed and on PATH
- `yt-dlp` installed and on PATH (or configure `YTDLP_BIN` in `.env`)
- A `logo.png` file in project root (Default one included)

## Setup

```bash
cp .env.example .env
# edit .env with your settings (MEDIA_ROOT, etc.)
npm install
```

Place your assets:

- `logo.png` in project root (transparent PNG logo)

## Import videos (yt-dlp)

Run the panel:

```bash
npm start
```

Then:

1. Go to `http://localhost:4456`
2. First setup will create you an account then login
3. Click **Settings** and fill out your last.fm api key and rtmp stream (there will be a option to disable rtmp and just use hls)
4. Click **Media** in the top bar
5. Paste a YouTube URL and submit

The app will:

- Call `yt-dlp` to fetch metadata
- Get `year` and `genre` from last.fm
- Derive:
  - `artist` (yt-dlp artist / channel / from title)
  - `title` (track/title)
  - `year` from last.fm metadata
  - `genre` from last.fm metadata
  - `duration` from metadata
- Download the video into:
  - `media/Artist/Track.mp4`
- Insert a row into `panel.sqlite`

## Playout

The scheduler:

- Picks videos from the DB
- Writes a concat playlist and nowplaying.txt
- Spawns ffmpeg to output HLS segments + `stream.m3u8` into `./public/hls` and stream to external rtmp server

Access stream at:

```
http://your-server:4456/public/hls/stream.m3u8
```

or

```
rtmp://your-server/mount
```

## Notes

- Current scheduler is simple rotation with idents every 4 tracks.
- To mark a video as an ident, toggle the **Ident?** checkbox in the dashboard.
- For production, consider:
  - Strong `SESSION_SECRET`
  - Reverse proxy (nginx) in front
  - IP/VPN restriction for admin access
- Port 554/UDP must be free in order for ffmpeg to pass video


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=RoxyBoxxy/FluxTV&type=date&legend=top-left)](https://www.star-history.com/#RoxyBoxxy/FluxTV&type=date&legend=top-left)