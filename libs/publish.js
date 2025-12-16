import axios from 'axios';
import qs from 'qs';
import dbPromise from "./db.js";

let settingsCache = {};



async function loadSettings() {
    const db = await dbPromise;
    const rows = await db.all("SELECT key, value FROM settings");
    settingsCache = {};
    for (const r of rows) {
        settingsCache[r.key] = r.value;
    }
}

export async function publishChannel() {
    await loadSettings();
    const db = await dbPromise;
    const row = await db.get(
        "SELECT v.id, v.title, v.artist, v.year, v.genre, v.path " +
        "FROM playout_log p JOIN videos v ON v.id = p.video_id " +
        "ORDER BY p.id DESC LIMIT 1"
    );
    let data = qs.stringify({
        'nowPlaying': row.title + ' - ' + row.artist,
        'channelName': settingsCache.channelName,
        'channelURL': settingsCache.channelURL,
        'channelOwner': settingsCache.channelOwner,
        'channelLogo': '/public/logo_nav.png'
    });
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://fluxtv.dev/api/channels',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };
    const publishEnabled = settingsCache.channelPublish === 'true';
    if (publishEnabled) {
        axios.request(config)
            .then((response) => {
                console.log(JSON.stringify(response.data));
            })
            .catch((error) => {
                console.log(error);
            });
    }
    else {
        console.log("Publishing Disabled")
    }

}

