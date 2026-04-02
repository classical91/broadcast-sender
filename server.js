const express = require('express');
const path = require('path');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

async function tgSendText(token, chatId, threadId, text) {
  const body = { chat_id: chatId, text };
  if (threadId) body.message_thread_id = parseInt(threadId);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const d = await r.json();
  console.log('[tg text]', chatId, threadId || 'main', d.ok ? 'OK' : d.description);
  if (!d.ok) throw new Error(d.description || 'Telegram error');
  return d;
}

async function tgSendPhoto(token, chatId, threadId, buffer, filename, mimetype, caption) {
  const form = new FormData();
  form.append('chat_id', chatId);
  if (threadId) form.append('message_thread_id', String(parseInt(threadId)));
  const blob = new Blob([buffer], { type: mimetype || 'image/jpeg' });
  form.append('photo', blob, filename || 'photo.jpg');
  if (caption) form.append('caption', caption);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
  const d = await r.json();
  console.log('[tg photo]', chatId, threadId || 'main', d.ok ? 'OK' : d.description);
  if (!d.ok) throw new Error(d.description || 'Telegram error');
  return d;
}

app.post('/send', async (req, res) => {
  try {
    const { token, targets, message } = req.body || {};
    if (!token)   return res.json({ sent: 0, total: 0, errors: ['Missing bot token'] });
    if (!message) return res.json({ sent: 0, total: 0, errors: ['Missing message'] });
    const list = Array.isArray(targets) ? targets.filter(t => t.chatId) : [];
    if (!list.length) return res.json({ sent: 0, total: 0, errors: ['No targets'] });

    const results = await Promise.allSettled(list.map(t => tgSendText(token, t.chatId, t.threadId || '', message)));
    res.json({
      sent: results.filter(r => r.status === 'fulfilled').length, total: list.length,
      errors: results.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'error')
    });
  } catch (e) { res.json({ sent: 0, total: 0, errors: [e.message] }); }
});

app.post('/send-photo', upload.single('photo'), async (req, res) => {
  try {
    const token   = req.body.token;
    const caption = req.body.caption || '';
    let targets = [];
    try { targets = JSON.parse(req.body.targets || '[]').filter(t => t.chatId); } catch {}

    if (!token)    return res.json({ sent: 0, total: 0, errors: ['Missing bot token'] });
    if (!req.file) return res.json({ sent: 0, total: 0, errors: ['No photo received'] });
    if (!targets.length) return res.json({ sent: 0, total: 0, errors: ['No targets'] });

    const results = await Promise.allSettled(
      targets.map(t => tgSendPhoto(token, t.chatId, t.threadId || '', req.file.buffer, req.file.originalname, req.file.mimetype, caption))
    );
    res.json({
      sent: results.filter(r => r.status === 'fulfilled').length, total: targets.length,
      errors: results.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'error')
    });
  } catch (e) { res.json({ sent: 0, total: 0, errors: [e.message] }); }
});

app.post('/share-target', upload.single('photo'), async (req, res) => {
  try {
    const { title, text, url } = req.body || {};
    const message = [text, url].filter(Boolean).join('\n') || title || '';
    if (req.file) {
      const key = Date.now().toString(36);
      app._shared = app._shared || {};
      app._shared[key] = { buffer: req.file.buffer, filename: req.file.originalname, mimetype: req.file.mimetype, caption: message };
      setTimeout(() => { if (app._shared) delete app._shared[key]; }, 5 * 60 * 1000);
      return res.redirect('/?shared=photo&key=' + key + '&caption=' + encodeURIComponent(message));
    }
    res.redirect('/?shared=text&text=' + encodeURIComponent(message));
  } catch (e) { res.redirect('/'); }
});

app.get('/shared-file/:key', (req, res) => {
  const file = (app._shared || {})[req.params.key];
  if (!file) return res.status(404).json({ error: 'Not found or expired' });
  res.json({ filename: file.filename, mimetype: file.mimetype, caption: file.caption, data: file.buffer.toString('base64') });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Broadcast running on port ' + PORT));
