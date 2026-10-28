/**
 * AI-Voice-Agent 前端全双工语音通信与智能中枢
 * 1. 模块化模型中继 (OpenAI / DeepSeek / 通义千问 / Ollama)
 * 2. 模块化课件动态热插拔 (/api/courseware)
 * 3. 中英双语亲切教学 + 内置体验模式（免Key也能玩，填Key自由聊）
 * 4. 防回声自录（Echo Guard）与智能 VAD 自动断句
 */

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

const App = {
  isCalling: false,
  isMuted: false,
  state: 'IDLE', // IDLE | LISTENING | THINKING | SPEAKING
  recognition: null,
  activeCourseware: null,
  coursewares: [],
  conversationHistory: [],
  speechTimer: null,
  echoGuardTimer: null,
  demoStepIndex: 0,
  
  // 本地配置
  config: {
    preset: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelName: 'deepseek-chat',
    voiceURI: '',
    speechRate: 0.85,
    vadTimeout: 1.2,
    recognitionLang: 'zh-CN', // zh-CN: 中英双语都能识别；en-US: 纯英文
    teachMode: 'bilingual', // bilingual: 中英双语带读；english: 纯英文沉浸
    showZhSubtitle: true
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  initVoices();
  bindUIEvents();
  await loadCoursewares();
  setAppState('IDLE');
});

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
  
  const langSel = document.getElementById('cfgRecogLangSelect');
  if (langSel) langSel.value = App.config.recognitionLang || 'zh-CN';
  
  const modeSel = document.getElementById('cfgTeachModeSelect');
  if (modeSel) modeSel.value = App.config.teachMode || 'bilingual';
  
  document.getElementById('cfgShowZhSubtitle').checked = App.config.showZhSubtitle;
}

// 动态发现并加载课件
async function loadCoursewares() {
  const select = document.getElementById('coursewareSelect');
  select.innerHTML = '<option value="">正在加载课件库...</option>';
  try {
    const res = await fetch('/api/courseware');
    const json = await res.json();
    if (json.code === 0 && json.data.length > 0) {
      App.coursewares = json.data;
      select.innerHTML = '';
      json.data.forEach((cw) => {
        const opt = document.createElement('option');
        opt.value = cw.id;
        opt.textContent = `[${cw.grade}] ${cw.title}`;
        select.appendChild(opt);
      });
      App.activeCourseware = json.data[0].data;
    } else {
      fallbackCourseware(select);
    }
  } catch (err) {
    fallbackCourseware(select);
  }

  select.addEventListener('change', (e) => {
    const found = App.coursewares.find(c => c.id === e.target.value);
    if (found) {
      App.activeCourseware = found.data;
      appendTranscript('system', `📚 已切换课件：${found.title}`);
      if (App.isCalling) {
        resetConversation();
      }
    }
  });
}

function fallbackCourseware(select) {
  select.innerHTML = '<option value="pep3a">小学三年级 · Unit 1: Making friends</option>';
  App.activeCourseware = {
    persona: {
      name: "Bingo",
      systemPrompt: "You are Bingo, a friendly puppy and classmate for a Chinese Grade 3 student. Speak in simple English with friendly Chinese explanations. Guide the child to repeat key phrases."
    },
    initialGreeting: "Hello! I am Bingo. What is your name? 你好呀！我是小狗 Bingo。你叫什么名字呢？",
    demoSteps: [
      {
        trigger: ["hello", "hi", "bingo", "name", "名字", "你好", "我是"],
        reply: "Nice to meet you! 很高兴认识你！Look, I can wave my hand. 看，我会挥手哦。Can you wave your hand? 你会挥挥手吗？"
      },
      {
        trigger: ["yes", "can", "hand", "wave", "会", "可以", "手"],
        reply: "Super! 太棒了！We are good friends now. 我们现在是好朋友啦。Let's share our toys! 一起来分享玩具吧！"
      },
      {
        trigger: ["share", "ok", "good", "friend", "好", "分享", "朋友"],
        reply: "Bingo! You did an amazing job today! 恭喜你完成今天的对话关卡，奖励你一颗大金星！⭐"
      }
    ]
  };
}

// 语音音色加载
function initVoices() {
  const voiceSelect = document.getElementById('cfgVoiceSelect');
  function populate() {
    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    
    // 中文和英文语音都收集，供中英双语发音选择
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (App.config.voiceURI && v.voiceURI === App.config.voiceURI) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });

    if (!App.config.voiceURI && voices.length > 0) {
      // 默认优先选自然语音
      const preferred = voices.find(v => v.lang.includes('zh') || v.name.includes('Natural') || v.name.includes('Tingting') || v.name.includes('Zira'));
      if (preferred) {
        App.config.voiceURI = preferred.voiceURI;
        voiceSelect.value = preferred.voiceURI;
      }
    }
  }

  populate();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populate;
  }
}

// 状态机控制与 UI 视觉切换
function setAppState(newState) {
  App.state = newState;
  const orb = document.getElementById('orbContainer');
  const indicator = document.getElementById('statusIndicator');
  const subStatus = document.getElementById('subStatus');
  const icon = document.getElementById('orbIcon');

  orb.className = 'voice-orb-container';

  const hasApiKey = Boolean(App.config.apiKey && App.config.apiKey.trim());
  const modeTag = hasApiKey ? '✨ 大模型实时智能生成中' : '🎮 课标体验模式（免Key畅通）';

  switch (newState) {
    case 'IDLE':
      orb.classList.add('state-idle');
      indicator.textContent = App.isCalling ? '已连接 · 准备倾听' : '点击下方按钮开始语音通话';
      subStatus.textContent = App.isCalling ? `随时开口说话即可 · ${modeTag}` : '双手免提 · 像真人打微信电话一样聊英语';
      icon.textContent = '🎙️';
      break;

    case 'LISTENING':
      orb.classList.add('state-listening');
      indicator.textContent = '正在倾听您说话...';
      subStatus.textContent = '请大声自然说话（支持中英双语），说完停顿 1 秒即可自动接话';
      icon.textContent = '👂';
      break;

    case 'THINKING':
      orb.classList.add('state-thinking');
      indicator.textContent = '正在思考回复中...';
      subStatus.textContent = `${modeTag}，正在组织亲切双语回复...`;
      icon.textContent = '✨';
      break;

    case 'SPEAKING':
      orb.classList.add('state-speaking');
      indicator.textContent = `${App.activeCourseware?.persona?.name || 'AI'} 正在说话...`;
      subStatus.textContent = '注意听双语带读发音，听完即可直接接话（也可轻点声波球打断）';
      icon.textContent = '🗣️';
      break;
  }
}

// 通话开关
function toggleCall() {
  if (App.isCalling) {
    endCall();
  } else {
    startCall();
  }
}

function startCall() {
  App.isCalling = true;
  App.demoStepIndex = 0;
  const btn = document.getElementById('callToggleBtn');
  btn.className = 'call-btn end-call';
  btn.querySelector('.btn-text').textContent = '挂断通话';
  btn.querySelector('.btn-icon').textContent = '📵';

  document.getElementById('muteBtn').disabled = false;

  const hasKey = Boolean(App.config.apiKey && App.config.apiKey.trim());
  appendTranscript('system', `🟢 通话已接通！[模式: ${hasKey ? '大模型实时生成' : '课标内置对练模式(免Key)'}]`);
  resetConversation();
}

function endCall() {
  App.isCalling = false;
  const btn = document.getElementById('callToggleBtn');
  btn.className = 'call-btn start-call';
  btn.querySelector('.btn-text').textContent = '开始通话';
  btn.querySelector('.btn-icon').textContent = '📞';

  document.getElementById('muteBtn').disabled = true;

  stopListening();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  setAppState('IDLE');
  appendTranscript('system', '🔴 通话已挂断。点击按钮可随时重新开始！');
}

function resetConversation() {
  App.conversationHistory = [];
  App.demoStepIndex = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  const cw = App.activeCourseware;
  const greeting = cw?.initialGreeting || "Hello! I am Bingo. What is your name?";

  // 添加自适应大模型提示词
  if (cw?.persona?.systemPrompt) {
    let prompt = cw.persona.systemPrompt;
    prompt += `\n\n### CRITICAL TEACHING POLICY:
1. When student speaks English: Respond in 100% natural, simple English (1-2 short sentences). Do NOT append Chinese translations. Keep the pure English environment!
2. When student speaks Chinese, asks for meaning ('什么意思'/'听不懂'), or expresses hesitation: Immediately use friendly, warm Chinese to explain and comfort the child, then teach the target English sentence, and invite the child to repeat (e.g. '原来你想说...，用英文可以说：“...”，跟我来念一遍好吗？').`;
    App.conversationHistory.push({ role: 'system', content: prompt });
  }

  setTimeout(() => {
    speakAiResponse(greeting);
  }, 400);
}

// 语音合成 (TTS)：中英文无缝发音
function speakAiResponse(fullText) {
  if (!('speechSynthesis' in window)) {
    alert('您的设备暂不支持语音朗读，请使用 Safari、Chrome 或 Edge 浏览器');
    return;
  }

  stopListening(); // 说话前立刻关闭麦克风，杜绝扬声器尾音被自录！
  if (App.echoGuardTimer) clearTimeout(App.echoGuardTimer);

  // 记录到历史
  App.conversationHistory.push({ role: 'assistant', content: fullText });
  appendTranscript('bot', `${App.activeCourseware?.persona?.name || 'AI'}: ${fullText}`);

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(fullText);
  
  // 智能识别语言：如果包含汉字，使用中文语言环境（iOS 和各平台中文语音读英文发音很自然且中英兼备）
  const hasChinese = /[\u4e00-\u9fa5]/.test(fullText);
  utter.lang = hasChinese ? 'zh-CN' : 'en-US';
  utter.rate = parseFloat(App.config.speechRate) || 0.85;

  const voices = window.speechSynthesis.getVoices();
  if (App.config.voiceURI) {
    const v = voices.find(x => x.voiceURI === App.config.voiceURI);
    if (v) utter.voice = v;
  }

  utter.onstart = () => {
    setAppState('SPEAKING');
  };

  utter.onend = () => {
    // 关键防回声机制 (Echo Guard)：语音播完后缓冲 600ms，确保 iPad 扬声器完全停止后再开启麦克风！
    if (App.isCalling && !App.isMuted) {
      App.echoGuardTimer = setTimeout(() => {
        if (App.isCalling && !App.isMuted) {
          setAppState('LISTENING');
          startListening();
        }
      }, 600);
    } else {
      setAppState('IDLE');
    }
  };

  utter.onerror = (e) => {
    console.warn('TTS 发音被中断:', e);
    if (App.isCalling && !App.isMuted) {
      setTimeout(() => {
        if (App.isCalling && !App.isMuted) {
          setAppState('LISTENING');
          startListening();
        }
      }, 500);
    }
  };

  window.speechSynthesis.speak(utter);
}

// 语音识别 (STT)：支持中英双语混合识别
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      const httpsUrl = `https://${location.hostname}:3000`;
      appendTranscript('system', `⚠️ iPad / 手机端需通过 HTTPS 才能调用麦克风！请点击切换到安全通道：<a href="${httpsUrl}" style="color:#38bdf8;text-decoration:underline;">${httpsUrl}</a>（点击后选择“显示详细信息➔访问此网站”即可完全解锁语音对练！）`);
    } else {
      appendTranscript('system', '⚠️ 当前浏览器暂未开启麦克风或不支持语音录入，请确保在系统设置中允许浏览器访问麦克风。推荐使用 iPad Safari (HTTPS) 或 Chrome！');
    }
    return null;
  }

  const rec = new SpeechRecognition();
  // 采用双语混合或用户设定语种（默认 zh-CN 能同时听懂中文和英语词汇）
  rec.lang = App.config.recognitionLang || 'zh-CN';
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
    // 如果处于思考或说话状态，忽略任何声音输入
    if (App.state === 'SPEAKING' || App.state === 'THINKING') return;

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
      // VAD 自动静音感应
      if (App.speechTimer) clearTimeout(App.speechTimer);
      const timeoutMs = (parseFloat(App.config.vadTimeout) || 1.2) * 1000;
      App.speechTimer = setTimeout(() => {
        if (currentText && App.state !== 'SPEAKING' && App.state !== 'THINKING') {
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
  } catch (e) {}
}

function stopListening() {
  if (App.speechTimer) clearTimeout(App.speechTimer);
  if (App.echoGuardTimer) clearTimeout(App.echoGuardTimer);
  if (App.recognition) {
    try {
      App.recognition.stop();
    } catch (e) {}
  }
}

// 智能回复决策中枢：有 Key 走大模型，无 Key 走课标体验对练
async function commitUserSpeech(spokenText) {
  if (!spokenText.trim()) return;
  stopListening();

  appendTranscript('user', `🧒 You: ${spokenText.trim()}`);
  App.conversationHistory.push({ role: 'user', content: spokenText.trim() });
  setAppState('THINKING');

  const hasKey = Boolean(App.config.apiKey && App.config.apiKey.trim());

  // 1. 如果没有配置 API Key，启动课标内置体验对练模式（绝不重复报错英文！）
  if (!hasKey) {
    setTimeout(() => {
      const reply = generateDemoReply(spokenText.trim());
      speakAiResponse(reply);
    }, 700);
    return;
  }

  // 2. 如果配置了 Key，调用大模型真实大脑
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
      speakAiResponse(data.reply);
    } else {
      speakAiResponse("Good job! Keep going! 答得真棒，我们继续吧！");
    }
  } catch (err) {
    console.error('通信失败:', err);
    // 网络降级为演示回复
    const fallback = generateDemoReply(spokenText.trim());
    speakAiResponse(fallback);
  }
}

// 内置免 Key 课标自适应双轨对练逻辑（孩子说英文纯英文接，孩子说中文用中文引导英文辅助）
function generateDemoReply(input) {
  const cw = App.activeCourseware;
  const lower = input.toLowerCase();
  const hasChinese = /[\u4e00-\u9fa5]/.test(input);

  // 【分支一】：孩子说中文、或表示听不懂 / 求助
  if (hasChinese) {
    if (/叫|我是|名字|姓/.test(input)) {
      return "原来是这样呀！很高兴认识你！如果用英文介绍自己，可以说：“My name is...” 后面加上你的名字。试着跟我读一次好吗？";
    }
    if (/不懂|意思|你说什么|听不清|慢点|不会/.test(input)) {
      return "别担心哦！我刚才在问你的名字。你可以试着告诉我：“Hello, my name is...” 后面加上你的名字，大声试一次！";
    }
    if (/手|胳膊|眼睛|耳朵|嘴巴/.test(input)) {
      return "身体部位用英文说很有趣哦！手是 hand，耳朵是 ear。摸摸手可以说：“Touch your hand.” 跟我读一遍：hand！";
    }
    if (/好|可以|行|对|会/.test(input)) {
      return "真棒！赞同对方的时候，用英文可以说：“OK!” 或者 “Great!”。跟我大声说一遍：OK！";
    }
    if (/爸爸|妈妈|哥哥|弟弟|姐姐|妹妹|家人/.test(input)) {
      return "好温馨的家庭呀！用英文介绍爸爸可以说是：“This is my father.” 妈妈是 mother。试着跟我念：father！";
    }
    // 通用中文引导
    return "听懂你的意思啦！那试着用英文跟我打个招呼吧，跟着我大声念：“Hello Bingo!”";
  }

  // 【分支二】：孩子说纯英文（保持 100% 纯英文沉浸交流，绝不插入中文！）
  if (/name|i'm|i am|hello|hi|bingo/i.test(lower)) {
    return "Nice to meet you! Look, I can wave my hand. Can you wave your hand?";
  }
  if (/yes|can|hand|wave|look|arm/i.test(lower)) {
    return "Super! We are good friends now. Let's share our toys, OK?";
  }
  if (/share|ok|good|friend|toy|great/i.test(lower)) {
    return "Bingo! You did an amazing job today! You got a star! ⭐";
  }
  if (/father|mother|brother|sister|family/i.test(lower)) {
    return "Your family looks so happy and sweet! Do you love your family?";
  }
  if (/love|nice|happy/i.test(lower)) {
    return "Wonderful! Loving family and friends is the best thing. You are awesome! ⭐";
  }

  // 纯英文通用接话
  return "Good job! You speak English so nicely! Let's keep talking!";
}

// 字幕卡片
function appendTranscript(type, text) {
  const box = document.getElementById('transcriptBox');
  const line = document.createElement('div');
  line.className = `transcript-line ${type}`;
  line.innerHTML = `<span>${text}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// 事件绑定
function bindUIEvents() {
  document.getElementById('callToggleBtn').addEventListener('click', toggleCall);
  document.getElementById('orbContainer').addEventListener('click', () => {
    if (!App.isCalling) {
      startCall();
    } else if (App.state === 'SPEAKING') {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setAppState('LISTENING');
      startListening();
    }
  });

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

  // ⚙️ 设置弹窗
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

  document.getElementById('modelPresetSelect').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    if (p) {
      document.getElementById('cfgBaseUrl').value = p.baseUrl;
      document.getElementById('cfgModelName').value = p.model;
      document.getElementById('cfgApiKey').placeholder = p.placeholder;
    }
  });

  document.getElementById('cfgSpeechRate').addEventListener('input', (e) => {
    document.getElementById('rateValLabel').textContent = `${e.target.value}x (${e.target.value <= 0.85 ? '推荐小学生' : '进阶语速'})`;
  });
  document.getElementById('cfgVadTimeout').addEventListener('input', (e) => {
    document.getElementById('vadValLabel').textContent = `${e.target.value} 秒`;
  });

  document.getElementById('testVoiceBtn').addEventListener('click', () => {
    const selectedVoiceURI = document.getElementById('cfgVoiceSelect').value;
    const rate = parseFloat(document.getElementById('cfgSpeechRate').value) || 0.85;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Hello! 你好呀！我是你的英语伴学伙伴 Bingo！Nice to meet you!");
      u.lang = 'zh-CN';
      u.rate = rate;
      const v = window.speechSynthesis.getVoices().find(x => x.voiceURI === selectedVoiceURI);
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    App.config.preset = document.getElementById('modelPresetSelect').value;
    App.config.baseUrl = document.getElementById('cfgBaseUrl').value.trim();
    App.config.apiKey = document.getElementById('cfgApiKey').value.trim();
    App.config.modelName = document.getElementById('cfgModelName').value.trim();
    App.config.voiceURI = document.getElementById('cfgVoiceSelect').value;
    App.config.speechRate = parseFloat(document.getElementById('cfgSpeechRate').value);
    App.config.vadTimeout = parseFloat(document.getElementById('cfgVadTimeout').value);
    
    const langSel = document.getElementById('cfgRecogLangSelect');
    if (langSel) App.config.recognitionLang = langSel.value;
    
    const modeSel = document.getElementById('cfgTeachModeSelect');
    if (modeSel) App.config.teachMode = modeSel.value;

    App.config.showZhSubtitle = document.getElementById('cfgShowZhSubtitle').checked;

    saveConfig();
    modal.classList.remove('active');
    
    const hasKey = Boolean(App.config.apiKey);
    appendTranscript('system', `✅ 设置保存成功！当前模式: ${hasKey ? '大模型实时生成' : '课标内置对练模式(免Key)'}`);
    
    if (App.isCalling) {
      resetConversation();
    }
  });
}
