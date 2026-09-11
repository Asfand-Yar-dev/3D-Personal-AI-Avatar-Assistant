import { createServer } from 'node:http';
import { readFile, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const root = resolve('dist');
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

try {
  readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* A .env file is optional. */ }

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes = 4_000_000) {
  return new Promise((resolveBody, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('Request is too large.')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeContext(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 3).map(item => ({
    title: String(item?.title || 'Untitled source').slice(0, 100),
    text: String(item?.text || '').slice(0, 6000)
  })).filter(item => item.text);
}

async function handleChat(req, res) {
  if (!process.env.MINIMAX_API_KEY) return json(res, 503, { error: 'MiniMax is not configured. Add MINIMAX_API_KEY to a local .env file and restart the server.' });
  try {
    const body = JSON.parse(await readBody(req));
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!message) return json(res, 400, { error: 'A message is required.' });
    const sources = safeContext(body.context);
    const grounding = sources.length ? sources.map(source => `SOURCE: ${source.title}\n${source.text}`).join('\n\n') : 'No local documents were selected.';
    const history = Array.isArray(body.history) ? body.history.slice(-8).map(item => ({ role: item?.role === 'assistant' ? 'assistant' : 'user', content: String(item?.content || '').slice(0, 2500) })).filter(item => item.content) : [];
    const apiResponse = await fetch(`${(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || 'MiniMax-M2.7',
        messages: [
          { role: 'system', name: 'Aiden', content: 'You are Aiden, a warm, concise personal avatar assistant. Use the supplied local context when relevant. Do not claim that a source says something it does not. Keep replies under 170 words unless the user asks for more.' },
          ...history,
          { role: 'user', name: 'User', content: `User request: ${message}\n\nSelected local context:\n${grounding}` }
        ],
        max_completion_tokens: 500
      })
    });
    const payload = await apiResponse.json();
    if (!apiResponse.ok) return json(res, apiResponse.status, { error: payload?.error?.message || 'The AI request could not be completed.' });
    const reply = payload.choices?.[0]?.message?.content;
    return json(res, 200, { reply: reply || 'I could not produce a reply just now.', sourceTitles: sources.map(source => source.title) });
  } catch (error) { return json(res, 500, { error: error.message === 'Request is too large.' ? error.message : 'The assistant service encountered an error.' }); }
}

async function handleSpeech(req, res) {
  if (!process.env.MINIMAX_API_KEY) return json(res, 503, { error: 'MiniMax speech is not configured.' });
  try {
    const body = JSON.parse(await readBody(req));
    const text = String(body.text || '').trim().slice(0, 9000);
    if (!text) return json(res, 400, { error: 'Text is required.' });
    const apiResponse = await fetch(`${(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/$/, '')}/t2a_v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: process.env.MINIMAX_TTS_MODEL || 'speech-2.8-turbo', text, stream: false, language_boost: 'auto', output_format: 'hex',
        voice_setting: { voice_id: process.env.MINIMAX_VOICE_ID || 'English_expressive_narrator', speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
      })
    });
    const payload = await apiResponse.json();
    const encoded = payload?.data?.audio;
    if (!apiResponse.ok || !encoded) return json(res, apiResponse.status || 502, { error: payload?.base_resp?.status_msg || 'MiniMax speech could not be generated.' });
    const audio = Buffer.from(encoded, 'hex');
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
    res.end(audio);
  } catch { return json(res, 500, { error: 'The speech service encountered an error.' }); }
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'POST' && req.url === '/api/speech') return handleSpeech(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(root, requested);
  if (!filePath.startsWith(root)) return json(res, 403, { error: 'Forbidden.' });
  readFile(filePath, (error, data) => {
    if (error) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});

server.listen(port, () => console.log(`Aiden is running locally at http://localhost:${port}`));
