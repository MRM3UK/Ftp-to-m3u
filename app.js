const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');
const path = require('path');

const app = express();

// Allowed video extensions
const VIDEO_EXTS = ['.mp4', '.mkv', '.m3u8', '.webm', '.avi', '.mov', '.flv', '.ts', '.wmv'];

// Helper: check extension
function looksLikeVideo(href) {
  try {
    const parsed = new URL(href, 'http://example.com');
    const ext = path.extname(parsed.pathname).toLowerCase();
    return VIDEO_EXTS.includes(ext);
  } catch (e) {
    return false;
  }
}

// Fetch all video links from a folder page
async function fetchFolderLinks(folderUrl) {
  const response = await axios.get(folderUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'FTP-to-M3U/1.0' }
  });

  const $ = cheerio.load(response.data);
  const links = [];

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!href || href === '../' || href === '/') return;
    const full = url.resolve(folderUrl, href);
    if (looksLikeVideo(full)) {
      const name = decodeURIComponent(path.basename(full));
      links.push({ href: full, name });
    }
  });

  // remove duplicates + sort
  const seen = new Set();
  const uniq = [];
  for (const l of links) {
    if (!seen.has(l.href)) {
      seen.add(l.href);
      uniq.push(l);
    }
  }
  uniq.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return uniq;
}

// Build M3U
function buildM3U(entries) {
  const lines = ['#EXTM3U'];
  for (const e of entries) {
    lines.push(`#EXTINF:-1,${e.name}`);
    lines.push(e.href);
  }
  return lines.join('\n');
}

// Web UI
const INDEX_HTML = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>FTP → M3U Generator</title>
</head>
<body style="font-family:Arial;max-width:700px;margin:40px auto">
  <h1>FTP → M3U Playlist Generator</h1>
  <form onsubmit="return false;">
    <input id="url" type="text" style="width:100%;padding:8px"
      placeholder="Paste FTP folder link here"
      value="http://ftp15.circleftp.net/FILE/English%20%26%20Foreign%20Anime%20Series/Naruto%20Shippuden%20%28TV%20Series%202007-2017%29%20Anime%20%5BDual%20Audio%5D%20%5BEng%2BJap%5D/Season%2014%20%28296-320%29/" />
    <button id="gen" style="margin-top:10px;padding:8px 14px">Generate</button>
    <button id="dl" style="margin-top:10px;padding:8px 14px">Download .m3u</button>
  </form>
  <textarea id="out" style="width:100%;height:400px;margin-top:15px"></textarea>

  <script>
    document.getElementById('gen').onclick = async () => {
      const u = document.getElementById('url').value.trim();
      if (!u) return alert('Enter folder URL');
      const res = await fetch('/generate?url=' + encodeURIComponent(u));
      const text = await res.text();
      document.getElementById('out').value = text;
    }
    document.getElementById('dl').onclick = () => {
      const u = document.getElementById('url').value.trim();
      if (!u) return alert('Enter folder URL');
      window.location = '/download?url=' + encodeURIComponent(u);
    }
  </script>
</body>
</html>
`;

// Routes
app.get('/', (req, res) => res.send(INDEX_HTML));

app.get('/generate', async (req, res) => {
  try {
    const folderUrl = req.query.url;
    if (!folderUrl) return res.status(400).send('Missing url parameter');
    const entries = await fetchFolderLinks(folderUrl);
    if (!entries.length) return res.status(404).send('No video files found.');
    const m3u = buildM3U(entries);
    res.type('text/plain').send(m3u);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

app.get('/download', async (req, res) => {
  try {
    const folderUrl = req.query.url;
    if (!folderUrl) return res.status(400).send('Missing url parameter');
    const entries = await fetchFolderLinks(folderUrl);
    if (!entries.length) return res.status(404).send('No video files found.');
    const m3u = buildM3U(entries);
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
    res.type('audio/x-mpegurl').send(m3u);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Export for Vercel
module.exports = app;
