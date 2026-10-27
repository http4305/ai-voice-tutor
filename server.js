/**
 * AI-Voice-Agent 智能单端口双模服务 (HTTP/HTTPS Multiplexer on Port 3000)
 * 1. 同一端口 3000 同时支持 HTTP 与 HTTPS 自动识别分发，无需开放新防火墙端口
 * 2. 证书内置 Apple iOS 13+ 严苛标准（2048位 RSA、SHA-256、SubjectAltName IP 扩展、365天有效期）
 * 3. 彻底解锁 iPadOS / iOS Safari 麦克风与语音识别 (Secure Context) 权限
 */

const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const PORT = 3000;
const ROOT = __dirname;
const CW_DIR = path.join(ROOT, 'courseware');
const CERT_FILE = path.join(ROOT, 'cert.pem');
const KEY_FILE = path.join(ROOT, 'key.pem');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

// 请求处理
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const isEncrypted = Boolean(req.socket.encrypted);
  const host = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;

  // 1. API: 获取课件列表
  if (pathname === '/api/courseware' && req.method === 'GET') {
    try {
      if (!fs.existsSync(CW_DIR)) fs.mkdirSync(CW_DIR, { recursive: true });
      const files = fs.readdirSync(CW_DIR).filter(f => f.endsWith('.json'));
      const list = [];
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(CW_DIR, f), 'utf-8');
          const data = JSON.parse(content);
          list.push({
            id: data.id || path.basename(f, '.json'),
            file: f,
            title: data.title || f,
            grade: data.grade || '通用',
            stage: data.stage || 'primary',
            data: data
          });
        } catch (e) {
          console.error(`解析课件失败 ${f}:`, e.message);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ code: 0, data: list }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ code: 1, message: err.message }));
    }
  }

  // 2. API: 转发 LLM 请求
  if (pathname === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        let { baseUrl, apiKey, model, messages, temperature = 0.7 } = payload;

        if (!baseUrl) {
          baseUrl = 'https://api.deepseek.com/v1';
        }
        baseUrl = baseUrl.replace(/\/+$/, '');
        const targetUrl = baseUrl.endsWith('/chat/completions') 
          ? baseUrl 
          : `${baseUrl}/chat/completions`;

        if (!apiKey && !targetUrl.includes('localhost') && !targetUrl.includes('127.0.0.1')) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            reply: "Hello! Please tap the Settings button (⚙️) on the top right to enter your API Key!",
            replyZh: "你好！请点击右上角设置 (⚙️) 填入你的大模型 API Key（如 DeepSeek 或 通义千问），即可开始畅聊！"
          }));
        }

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }

        const llmReq = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: messages,
            temperature: temperature,
            max_tokens: 300
          })
        });

        if (!llmReq.ok) {
          const errText = await llmReq.text();
          console.error(`LLM 上游错误 [${llmReq.status}]:`, errText);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            reply: `I heard you, but my brain provider returned an error (${llmReq.status}). Please check your API Key in Settings.`,
            replyZh: `我听到你的声音了，但模型服务商返回了错误（代码 ${llmReq.status}）。请检查右上角设置中的 API Key 是否正确。`
          }));
        }

        const llmData = await llmReq.json();
        const reply = llmData.choices && llmData.choices[0] && llmData.choices[0].message
          ? llmData.choices[0].message.content
          : "I'm listening!";

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ reply }));
      } catch (err) {
        console.error('Chat API 错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. 静态文件响应
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, reqPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function main() {
  console.log('正在生成符合 Apple iOS 13+ 严苛标准的 SSL 证书...');
  const attrs = [{ name: 'commonName', value: localIP }];
  const options = {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: localIP },
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' }
        ]
      }
    ]
  };

  const pems = await selfsigned.generate(attrs, options);
  fs.writeFileSync(CERT_FILE, pems.cert, 'utf-8');
  fs.writeFileSync(KEY_FILE, pems.private, 'utf-8');
  console.log('Apple 兼容 SSL 证书生成完毕。');

  // 实例化 HTTP 与 HTTPS 引擎
  const httpApp = http.createServer(handleRequest);
  const httpsApp = https.createServer({ key: pems.private, cert: pems.cert }, handleRequest);

  // 核心：单端口 TCP 多路复用器（根据客户端握手首字节自动识别 HTTP 或 HTTPS）
  const tcpServer = net.createServer(socket => {
    socket.once('data', buffer => {
      socket.pause();
      // 0x16 (22) 代表 TLS 握手 ClientHello，自动导流给 HTTPS，否则导流给 HTTP
      const isTLS = buffer[0] === 22;
      const targetApp = isTLS ? httpsApp : httpApp;
      socket.unshift(buffer);
      targetApp.emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });

  tcpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 AI 语音对练 Agent 单端口双模服务启动成功！`);
    console.log(`💻 电脑本地访问: http://localhost:${PORT}`);
    console.log(`📱 iPad Pro 语音通话访问 (强烈推荐 HTTPS):`);
    console.log(`👉 https://${localIP}:${PORT}`);
    console.log(`   (iPad 访问 https 时提示“非私人连接”，点击“显示详细信息 ➔ 访问此网站”即可彻底解锁麦克风！)`);
    console.log(`====================================================`);
  });
}

main().catch(err => {
  console.error('服务启动失败:', err);
});
