/**
 * AI-Voice-Agent 前端全双工语音通信与智能中枢
 * 1. 模块化模型中继 (OpenAI / DeepSeek / 通义千问 / Ollama)
 * 2. 模块化课件动态热插拔 (/api/courseware)
 * 3. ChatGPT 高级语音模式 VAD 自动静音感应与自主对练循环
 */

// 预设模型服务商配置
const PRESETS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    placeholder: 'sk-xxxxxxxxxxxxxxxx'
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    placeholder: 'sk-xxxxxxxxxxxxxxxx'
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    placeholder: 'sk-xxxxxxxxxxxxxxxx'
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    placeholder: 'sk-proj-xxxxxxxxxxxx'
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3:latest',
    placeholder: '本地 Ollama 无需填 key'
  },
  custom: {
    baseUrl: '',
    model: '',
    placeholder: '填入你的 API Key'
  }
};

// 全局应用状态
const App = {
  isCalling: false,
  isMuted: false,
  state: 'IDLE', // IDLE | LISTENING | THINKING | SPEAKING
  recognition: null,
  activeCourseware: null,
  coursewares: [],
  conversationHistory: [],
  speechTimer: null,
  currentUtterance: null,
  
  // 本地配置
  config: {
    preset: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelName: 'deepseek-chat',
    voiceURI: '',
    speechRate: 0.85,
    vadTimeout: 1.2,
    recastEnabled: true,
    showZhSubtitle: true
  }
};

// 页面加载入口
document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  initVoices();
  bindUIEvents();
  await loadCoursewares();
  setAppState('IDLE');
});

// 1. 本地存储配置加载与保存
function loadConfig() {
  try {
    const saved = localStorage.getItem('ai_voice_agent_cfg');
    if (saved) {
      App.config = Object.assign(App.config, JSON.parse(saved));
    }
  } catch (e) {
    console.error('加载本地设置失败:', e);
  }
  syncSettingsModal();
}

function saveConfig() {
  try {
    localStorage.setItem('ai_voice_agent_cfg', JSON.stringify(App.config));
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

function syncSettingsModal() {
  document.getElementById('modelPresetSelect').value = App.config.preset;
  document.getElementById('cfgBaseUrl').value = App.config.baseUrl;
  document.getElementById('cfgApiKey').value = App.config.apiKey;
  document.getElementById('cfgModelName').value = App.config.modelName;
  document.getElementById('cfgSpeechRate').value = App.config.speechRate;
  document.getElementById('rateValLabel').textContent = `${App.config.speechRate}x (${App.config.speechRate <= 0.85 ? '推荐小学生' : '进阶语速'})`;
  document.getElementById('cfgVadTimeout').value = App.config.vadTimeout;
  document.getElementById('vadValLabel').textContent = `${App.config.vadTimeout} 秒`;
  document.getElementById('cfgRecastEnabled').checked = App.config.recastEnabled;
  document.getElementById('cfgShowZhSubtitle').checked = App.config.showZhSubtitle;
}

// 2. 动态发现并加载课件插件库
async function loadCoursewares() {
  const select = document.getElementById('coursewareSelect');
  select.innerHTML = '<option value="">正在加载课件库...</option>';
  try {
    const res = await fetch('/api/courseware');
    const json = await res.json();
    if (json.code === 0 && json.data.length > 0) {
      App.coursewares = json.data;
      select.innerHTML = '';
      json.data.forEach((cw, idx) => {
        const opt = document.createElement('option');
        opt.value = cw.id;
        opt.textContent = `[${cw.grade}] ${cw.title}`;
        select.appendChild(opt);
      });
      // 默认选中第一个
      App.activeCourseware = json.data[0].data;
    } else {
      select.innerHTML = '<option value="default">默认自由英语畅聊</option>';
      App.activeCourseware = {
        persona: { name: "Emma", systemPrompt: "You are Emma, a friendly English tutor." },
        initialGreeting: "Hello! Nice to meet you! How are you today?"
      };
    }
  } catch (err) {
    console.warn('获取课件库失败，回退到内置模式:', err);
    select.innerHTML = '<option value="default">默认自由英语畅聊</option>';
  }

  select.addEventListener('change', (e) => {
    const found = App.coursewares.find(c => c.id === e.target.value);
    if (found) {
      App.activeCourseware = found.data;
      appendTranscript('system', `📚 已切换课件：${found.title}`);
      if (App.isCalling) {
        // 重启开场白
        resetConversation();
      }
    }
  });
}

// 3. 语音音色加载与试听
function initVoices() {
  const voiceSelect = document.getElementById('cfgVoiceSelect');
  function populate() {
    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const listToRender = enVoices.length > 0 ? enVoices : voices;

    listToRender.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (App.config.voiceURI && v.voiceURI === App.config.voiceURI) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });

    if (!App.config.voiceURI && enVoices.length > 0) {
      // 优先选自然美音
      const natural = enVoices.find(v => v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha'));
      if (natural) {
        App.config.voiceURI = natural.voiceURI;
        voiceSelect.value = natural.voiceURI;
      }
    }
  }

  populate();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populate;
  }
}

// 4. 状态机控制与 UI 视觉切换
function setAppState(newState) {
  App.state = newState;
  const orb = document.getElementById('orbContainer');
  const indicator = document.getElementById('statusIndicator');
  const subStatus = document.getElementById('subStatus');
  const icon = document.getElementById('orbIcon');

  orb.className = 'voice-orb-container';

  switch (newState) {
    case 'IDLE':
      orb.classList.add('state-idle');
      indicator.textContent = App.isCalling ? '已连接 · 准备倾听' : '点击下方按钮开始语音通话';
      subStatus.textContent = App.isCalling ? '随时开口说话即可' : '双手免提 · 像真人打微信电话一样聊英语';
      icon.textContent = '🎙️';
      break;

    case 'LISTENING':
      orb.classList.add('state-listening');
      indicator.textContent = '正在倾听您说话...';
      subStatus.textContent = '请大声自然说英语，说完停顿 1 秒即可自动接话';
      icon.textContent = '👂';
      break;

    case 'THINKING':
      orb.classList.add('state-thinking');
      indicator.textContent = '正在思考回复中...';
      subStatus.textContent = '正在组织符合小学课标的地道英文...';
      icon.textContent = '✨';
      break;

    case 'SPEAKING':
      orb.classList.add('state-speaking');
      indicator.textContent = `${App.activeCourseware?.persona?.name || 'AI'} 正在说话...`;
      subStatus.textContent = '注意听纯正母语发音，听完即可直接接话';
      icon.textContent = '🗣️';
      break;
  }
}

// 5. 通话开启与结束 (Call Toggle)
function toggleCall() {
  if (App.isCalling) {
    endCall();
  } else {
    startCall();
  }
}

function startCall() {
  App.isCalling = true;
  const btn = document.getElementById('callToggleBtn');
  btn.className = 'call-btn end-call';
  btn.querySelector('.btn-text').textContent = '挂断通话';
  btn.querySelector('.btn-icon').textContent = '📵';

  document.getElementById('muteBtn').disabled = false;

  appendTranscript('system', '🟢 通话已接通！正在呼叫外教伙伴...');
  resetConversation();
}

function endCall() {
  App.isCalling = false;
  const btn = document.getElementById('callToggleBtn');
  btn.className = 'call-btn start-call';
  btn.querySelector('.btn-text').textContent = '开始通话';
  btn.querySelector('.btn-icon').textContent = '📞';

  document.getElementById('muteBtn').disabled = true;

  // 停止语音与识别
  stopListening();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  setAppState('IDLE');
  appendTranscript('system', '🔴 通话已挂断。点击按钮可随时重新拨通！');
}

function resetConversation() {
  App.conversationHistory = [];
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  const cw = App.activeCourseware;
  const greetingEn = cw?.initialGreeting || "Hello! Nice to meet you!";
  const greetingZh = cw?.initialGreetingZh || "你好呀！很高兴认识你！";

  // 添加系统提示词到历史
  if (cw?.persona?.systemPrompt) {
    App.conversationHistory.push({
      role: 'system',
      content: cw.persona.systemPrompt
    });
  }

  // 播放开场白
  setTimeout(() => {
    speakAiResponse(greetingEn, greetingZh);
  }, 400);
}

// 6. 核心：语音合成 (TTS) 与自主循环驱动
function speakAiResponse(textEn, textZh = "") {
  if (!('speechSynthesis' in window)) {
    alert('您的浏览器不支持语音朗读，请使用 Chrome 或 Edge 浏览器');
    return;
  }

  // 先把 AI 的发言记入上下文
  App.conversationHistory.push({ role: 'assistant', content: textEn });
  appendTranscript('bot', `${App.activeCourseware?.persona?.name || 'AI'}: ${textEn}`, textZh);

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(textEn);
  utter.lang = 'en-US';
  utter.rate = parseFloat(App.config.speechRate) || 0.85;

  const voices = window.speechSynthesis.getVoices();
  if (App.config.voiceURI) {
    const v = voices.find(x => x.voiceURI === App.config.voiceURI);
    if (v) utter.voice = v;
  }

  utter.onstart = () => {
    setAppState('SPEAKING');
    stopListening(); // 说话时暂停麦克风，防止啸叫回音
  };

  utter.onend = () => {
    // 关键：AI 说完之后，立刻自主进入倾听状态，等待孩子下一句！
    if (App.isCalling && !App.isMuted) {
      setAppState('LISTENING');
      startListening();
    } else {
      setAppState('IDLE');
    }
  };

  utter.onerror = (e) => {
    console.warn('TTS 发音被中断或出错:', e);
    if (App.isCalling && !App.isMuted) {
      setAppState('LISTENING');
      startListening();
    }
  };

  App.currentUtterance = utter;
  window.speechSynthesis.speak(utter);
}

// 7. 核心：语音识别 (STT) 与 VAD 自动静音感应
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      const httpsUrl = `https://${location.hostname}:3443`;
      appendTranscript('system', `⚠️ iPad / 手机端需通过 HTTPS 才能调用麦克风！请点击切换到安全通道：<a href="${httpsUrl}" style="color:#38bdf8;text-decoration:underline;">${httpsUrl}</a>（点击后选择“显示详细信息➔继续访问”即可完全解锁语音对练！）`);
    } else {
      appendTranscript('system', '⚠️ 当前浏览器暂未开启麦克风或不支持语音录入，请确保在系统设置中允许浏览器访问麦克风。推荐使用 Chrome、Edge 或 iPad Safari (HTTPS)！');
    }
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalTranscript = '';

  rec.onstart = () => {
    if (App.state !== 'SPEAKING' && App.state !== 'THINKING') {
      setAppState('LISTENING');
    }
  };

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += ' ' + event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const currentText = (finalTranscript + ' ' + interim).trim();
    if (currentText) {
      setAppState('LISTENING');
      // 重置静音计时器（VAD 机制：孩子停止发音达到预设时间后自动提交！）
      if (App.speechTimer) clearTimeout(App.speechTimer);
      const timeoutMs = (parseFloat(App.config.vadTimeout) || 1.2) * 1000;
      App.speechTimer = setTimeout(() => {
        if (currentText) {
          commitUserSpeech(currentText);
          finalTranscript = '';
        }
      }, timeoutMs);
    }
  };

  rec.onerror = (event) => {
    if (event.error === 'no-speech') return;
    console.warn('语音识别事件:', event.error);
  };

  rec.onend = () => {
    // 如果仍在通话中且处于倾听状态，自动重启监听保持永不掉线
    if (App.isCalling && !App.isMuted && App.state === 'LISTENING') {
      try { rec.start(); } catch (e) {}
    }
  };

  return rec;
}

function startListening() {
  if (!App.recognition) {
    App.recognition = initSpeechRecognition();
  }
  if (!App.recognition) return;
  try {
    App.recognition.start();
  } catch (e) {
    // 已经在运行
  }
}

function stopListening() {
  if (App.speechTimer) clearTimeout(App.speechTimer);
  if (App.recognition) {
    try {
      App.recognition.stop();
    } catch (e) {}
  }
}

// 8. 提交孩子所说的话并请求大模型大脑
async function commitUserSpeech(spokenText) {
  if (!spokenText.trim()) return;
  stopListening();

  appendTranscript('user', `🧒 You: ${spokenText.trim()}`);
  App.conversationHistory.push({ role: 'user', content: spokenText.trim() });
  setAppState('THINKING');

  try {
    const payload = {
      baseUrl: App.config.baseUrl,
      apiKey: App.config.apiKey,
      model: App.config.modelName,
      messages: App.conversationHistory,
      temperature: 0.7
    };

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.reply) {
      speakAiResponse(data.reply, data.replyZh || "");
    } else {
      speakAiResponse("I heard you, let's keep talking!");
    }
  } catch (err) {
    console.error('通信失败:', err);
    speakAiResponse("Sorry, my internet had a hiccup. Can you say that again?");
  }
}

// 9. 字幕卡片与辅助 UI
function appendTranscript(type, text, subtext = '') {
  const box = document.getElementById('transcriptBox');
  const line = document.createElement('div');
  line.className = `transcript-line ${type}`;
  line.innerHTML = `<span>${text}</span>${subtext && App.config.showZhSubtitle ? `<div class="translation">${subtext}</div>` : ''}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// 10. 事件绑定
function bindUIEvents() {
  // 通话开关
  document.getElementById('callToggleBtn').addEventListener('click', toggleCall);
  document.getElementById('orbContainer').addEventListener('click', () => {
    if (!App.isCalling) {
      startCall();
    } else if (App.state === 'SPEAKING') {
      // 允许孩子点击球打断 AI 说话
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setAppState('LISTENING');
      startListening();
    }
  });

  // 麦克风静音开关
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.addEventListener('click', () => {
    App.isMuted = !App.isMuted;
    if (App.isMuted) {
      muteBtn.classList.add('active');
      muteBtn.querySelector('.btn-icon').textContent = '🔇';
      muteBtn.querySelector('.btn-text').textContent = '已静音';
      stopListening();
      setAppState('IDLE');
    } else {
      muteBtn.classList.remove('active');
      muteBtn.querySelector('.btn-icon').textContent = '🎤';
      muteBtn.querySelector('.btn-text').textContent = '正常听音';
      if (App.isCalling && App.state !== 'SPEAKING') {
        setAppState('LISTENING');
        startListening();
      }
    }
  });

  // 文字抽屉输入辅助
  const textToggleBtn = document.getElementById('textInputToggleBtn');
  const textDrawer = document.getElementById('textDrawer');
  textToggleBtn.addEventListener('click', () => {
    textDrawer.classList.toggle('active');
  });

  const manualInput = document.getElementById('manualTextInput');
  const manualSend = () => {
    const val = manualInput.value.trim();
    if (!val) return;
    manualInput.value = '';
    if (!App.isCalling) startCall();
    commitUserSpeech(val);
  };
  document.getElementById('manualSendBtn').addEventListener('click', manualSend);
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manualSend();
  });

  // ⚙️ 设置弹窗逻辑
  const modal = document.getElementById('settingsModal');
  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    syncSettingsModal();
    modal.classList.add('active');
  });
  document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    modal.classList.remove('active');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  // 预设切换联动
  document.getElementById('modelPresetSelect').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    if (p) {
      document.getElementById('cfgBaseUrl').value = p.baseUrl;
      document.getElementById('cfgModelName').value = p.model;
      document.getElementById('cfgApiKey').placeholder = p.placeholder;
    }
  });

  // 滑块显示联动
  document.getElementById('cfgSpeechRate').addEventListener('input', (e) => {
    document.getElementById('rateValLabel').textContent = `${e.target.value}x (${e.target.value <= 0.85 ? '推荐小学生' : '进阶语速'})`;
  });
  document.getElementById('cfgVadTimeout').addEventListener('input', (e) => {
    document.getElementById('vadValLabel').textContent = `${e.target.value} 秒`;
  });

  // 发音试听
  document.getElementById('testVoiceBtn').addEventListener('click', () => {
    const selectedVoiceURI = document.getElementById('cfgVoiceSelect').value;
    const rate = parseFloat(document.getElementById('cfgSpeechRate').value) || 0.85;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Hello! I am your AI English speaking tutor. Nice to meet you!");
      u.lang = 'en-US';
      u.rate = rate;
      const v = window.speechSynthesis.getVoices().find(x => x.voiceURI === selectedVoiceURI);
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
  });

  // 保存设置
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    App.config.preset = document.getElementById('modelPresetSelect').value;
    App.config.baseUrl = document.getElementById('cfgBaseUrl').value.trim();
    App.config.apiKey = document.getElementById('cfgApiKey').value.trim();
    App.config.modelName = document.getElementById('cfgModelName').value.trim();
    App.config.voiceURI = document.getElementById('cfgVoiceSelect').value;
    App.config.speechRate = parseFloat(document.getElementById('cfgSpeechRate').value);
    App.config.vadTimeout = parseFloat(document.getElementById('cfgVadTimeout').value);
    App.config.recastEnabled = document.getElementById('cfgRecastEnabled').checked;
    App.config.showZhSubtitle = document.getElementById('cfgShowZhSubtitle').checked;

    saveConfig();
    modal.classList.remove('active');
    appendTranscript('system', '✅ 设置已保存成功！');
  });
}
