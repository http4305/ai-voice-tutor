/**
 * AI-Voice-Agent 前端全双工语音通信与智能教学中枢
 * 1. 离线/在线双模课件库秒级加载（内置 + 动态扩展）
 * 2. 严谨精准的语义核验（非胡乱说英文也能对）
 * 3. 完整的学-练-测-评-错题复习-7天AI儿歌闭环
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
  currentDialogueStep: 0,
  
  // 错题库与复习数据（本地持久化）
  mistakes: [],
  quizScore: 0,

  // 本地配置
  config: {
    preset: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelName: 'deepseek-chat',
    voiceURI: '',
    speechRate: 0.85,
    vadTimeout: 1.2,
    recognitionLang: 'zh-CN', // zh-CN: 中英双语都能识别
    teachMode: 'adaptive',   // adaptive: 动态双轨自适应
    showZhSubtitle: true
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  loadMistakes();
  initVoices();
  bindUIEvents();
  initCoursewaresImmediate();
  setAppState('IDLE');
});

// 1. 本地存储配置与错题本
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

function loadMistakes() {
  try {
    const saved = localStorage.getItem('ai_voice_mistakes');
    if (saved) {
      App.mistakes = JSON.parse(saved);
    }
  } catch (e) {
    App.mistakes = [];
  }
}

function saveMistakes() {
  try {
    localStorage.setItem('ai_voice_mistakes', JSON.stringify(App.mistakes));
  } catch (e) {}
}

function addMistake(question, correctAns, userAns, reason) {
  App.mistakes.unshift({
    q: question,
    correct: correctAns,
    user: userAns,
    reason: reason,
    date: new Date().toLocaleDateString(),
    reviewCount: 0
  });
  if (App.mistakes.length > 30) App.mistakes.pop();
  saveMistakes();
  renderMistakesBoard();
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
  if (modeSel) modeSel.value = App.config.teachMode || 'adaptive';
  
  document.getElementById('cfgShowZhSubtitle').checked = App.config.showZhSubtitle;
}

// 2. 课件库秒级离线渲染（彻底解决 iPad 画面空白问题）
function initCoursewaresImmediate() {
  const select = document.getElementById('coursewareSelect');
  select.innerHTML = '';

  // 1) 优先使用内置课件立即 100% 渲染，无网络延迟
  if (window.BUILTIN_COURSEWARES && window.BUILTIN_COURSEWARES.length > 0) {
    App.coursewares = window.BUILTIN_COURSEWARES.map(c => ({
      id: c.id,
      title: c.title,
      grade: c.grade,
      data: c
    }));
  }

  App.coursewares.forEach(cw => {
    const opt = document.createElement('option');
    opt.value = cw.id;
    opt.textContent = `[${cw.grade}] ${cw.title}`;
    select.appendChild(opt);
  });

  if (App.coursewares.length > 0) {
    App.activeCourseware = App.coursewares[0].data;
    renderCoursewareBoard(App.activeCourseware);
  }

  // 2) 异步尝试从本地服务热扩充
  fetch('/api/courseware')
    .then(r => r.json())
    .then(json => {
      if (json.code === 0 && json.data.length > 0) {
        // 如果后端有更新的课件，追加进去
        json.data.forEach(extCw => {
          if (!App.coursewares.some(c => c.id === extCw.id)) {
            App.coursewares.push(extCw);
            const opt = document.createElement('option');
            opt.value = extCw.id;
            opt.textContent = `[${extCw.grade}] ${extCw.title}`;
            select.appendChild(opt);
          }
        });
      }
    })
    .catch(() => {});

  select.addEventListener('change', (e) => {
    const found = App.coursewares.find(c => c.id === e.target.value);
    if (found) {
      App.activeCourseware = found.data;
      renderCoursewareBoard(App.activeCourseware);
      appendTranscript('system', `📚 已切换课件：${found.title}`);
      if (App.isCalling) {
        resetConversation();
      }
    }
  });
}

// 3. 渲染左侧大屏图文课件中心
function renderCoursewareBoard(cw) {
  if (!cw) return;

  // 横幅
  const iconEl = document.getElementById('cwBannerIcon');
  if (iconEl) iconEl.textContent = cw.bannerEmoji || '🎒';
  
  const titleEl = document.getElementById('cwTitle');
  if (titleEl) titleEl.textContent = cw.title || '英语同步课件';
  
  const descEl = document.getElementById('cwThemeDesc');
  if (descEl) descEl.textContent = cw.themeDescription || '【情境导读】跟着课本核心句型，开始你的真实对练之旅！';

  // 1. 课本核心情景对话 (Let's talk)
  const dList = document.getElementById('dialogueList');
  if (dList) {
    dList.innerHTML = '';
    const dialogues = cw.targetDialogue || [];
    dialogues.forEach(item => {
      const row = document.createElement('div');
      row.className = `dialogue-item ${item.role === 'You' ? 'user' : 'bot'}`;
      row.innerHTML = `
        <span class="dialogue-role">${item.role}</span>
        <div class="dialogue-text">
          <div class="dialogue-en">${item.text}</div>
          <div class="dialogue-zh">${item.zh || ''}</div>
        </div>
        <span class="play-icon-btn" title="点击听示范发音">🔊</span>
      `;
      row.addEventListener('click', () => {
        playSingleVoice(item.text);
      });
      dList.appendChild(row);
    });
  }

  // 2. 🔤 自然拼读法与核心音标 (Let's spell)
  const pCard = document.getElementById('phonicsFocusCard');
  if (pCard) {
    const pf = cw.phonicsFocus;
    if (pf) {
      pCard.style.display = 'flex';
      let exChips = '';
      if (pf.wordExamples) {
        pf.wordExamples.forEach(ex => {
          exChips += `
            <div class="phonics-example-chip" onclick="playSingleVoice('${ex.word}')">
              <span class="phonics-chip-word">${ex.word}</span>
              <span class="phonics-chip-sound">${ex.phonetic}</span>
            </div>
          `;
        });
      }

      pCard.innerHTML = `
        <div class="phonics-header">
          <span class="phonics-title-text">${pf.ruleTitle}</span>
          <div class="phonics-big-sound-badge" onclick="playSingleVoice('${pf.sound}')" title="点击听大音标发音">
            <span>${pf.sound}</span>
            <small style="font-size:12px;">🔊</small>
          </div>
        </div>
        <div class="phonics-mouth-tip">${pf.mouthTip}</div>
        <div class="phonics-examples-row">${exChips}</div>
      `;
    } else {
      pCard.style.display = 'none';
    }
  }

  // 3. 单元重点图文生词 (Word Bank) 与超清晰大音标
  const vGrid = document.getElementById('vocabCardsGrid');
  if (vGrid) {
    vGrid.innerHTML = '';
    const vocab = cw.targetVocab || [];
    vocab.forEach(v => {
      const card = document.createElement('div');
      card.className = 'vocab-card';
      const blendHtml = v.blend ? `<span class="vocab-blend-tag">拼读: ${v.blend}</span>` : '';
      card.innerHTML = `
        <div class="vocab-emoji">${v.emoji || '📝'}</div>
        <div class="vocab-word">${v.word}</div>
        <div class="vocab-phonetic-badge">${v.phonetic || ''}</div>
        ${blendHtml}
        <div class="vocab-zh">${v.zh}</div>
      `;
      card.addEventListener('click', () => {
        // 先慢速读音标/单词，再读例句
        playSingleVoice(v.word + (v.sent ? `. ${v.sent}` : ''));
      });
      vGrid.appendChild(card);
    });
  }

  // 3. 开口小锦囊 (Quick Prompts)
  const pGrid = document.getElementById('promptsGrid');
  if (pGrid) {
    pGrid.innerHTML = '';
    const prompts = cw.quickPrompts || [];
    prompts.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'prompt-pill';
      btn.innerHTML = `<span>${p.text}</span> <small>${p.zh || ''}</small>`;
      btn.addEventListener('click', () => {
        if (!App.isCalling) startCall();
        commitUserSpeech(p.text);
      });
      pGrid.appendChild(btn);
    });
  }

  // 4. 渲染单元测验与考核打分
  renderQuizBoard(cw);

  // 5. 渲染错题与7天儿歌
  renderMistakesBoard();
  renderChantBoard(cw);
}

// 4. 单元考核小测与分阶打分系统 (Part 1 单词考核 50分 + Part 2 短句考核 50分)
function renderQuizBoard(cw) {
  const box = document.getElementById('quizQuestionBox');
  const scoreEl = document.getElementById('quizScoreText');
  if (!box) return;

  const wordQuiz = cw.wordQuiz || [];
  const sentenceQuiz = cw.sentenceQuiz || [];
  
  if (wordQuiz.length === 0 && sentenceQuiz.length === 0) {
    box.innerHTML = '<div class="empty-tip">本单元暂未配置分阶考核题！</div>';
    scoreEl.textContent = '100';
    return;
  }

  box.innerHTML = '';
  App.quizScore = 0;
  scoreEl.textContent = '0';
  let totalPoints = 0;

  // 1. 渲染【Part 1: 核心单词考核 (50分)】
  if (wordQuiz.length > 0) {
    const part1Title = document.createElement('div');
    part1Title.className = 'quiz-part-title';
    part1Title.innerHTML = `<span>🔤 第一阶段：核心单词听音与认读考核 (共 50 分)</span>`;
    box.appendChild(part1Title);

    const eachWordScore = Math.floor(50 / wordQuiz.length);
    wordQuiz.forEach((qObj, idx) => {
      box.appendChild(createQuestionCard(qObj, idx + 1, eachWordScore, "word", () => {
        scoreEl.textContent = App.quizScore;
      }));
    });
  }

  // 2. 渲染【Part 2: 重点短句情景考核 (50分)】
  if (sentenceQuiz.length > 0) {
    const part2Title = document.createElement('div');
    part2Title.className = 'quiz-part-title';
    part2Title.style.marginTop = '20px';
    part2Title.innerHTML = `<span>💬 第二阶段：核心短句情境交际考核 (共 50 分)</span>`;
    box.appendChild(part2Title);

    const eachSentScore = Math.floor(50 / sentenceQuiz.length);
    sentenceQuiz.forEach((qObj, idx) => {
      box.appendChild(createQuestionCard(qObj, idx + 1, eachSentScore, "sentence", () => {
        scoreEl.textContent = App.quizScore;
      }));
    });
  }
}

function createQuestionCard(qObj, num, scoreValue, category, onScored) {
  const card = document.createElement('div');
  card.className = 'quiz-item-card';
  card.innerHTML = `
    <div class="quiz-question-title">第 ${num} 题 (${scoreValue}分)：${qObj.q}</div>
    <div class="quiz-opts-list"></div>
    <div class="quiz-feedback-text" style="font-size:12px;margin-top:4px;"></div>
  `;

  const optContainer = card.querySelector('.quiz-opts-list');
  qObj.options.forEach((optStr, optIdx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-choice-btn';
    btn.textContent = `${String.fromCharCode(65 + optIdx)}. ${optStr}`;
    btn.addEventListener('click', () => {
      if (card.dataset.answered) return;
      card.dataset.answered = 'true';

      if (optIdx === qObj.answer) {
        btn.classList.add('correct');
        App.quizScore += scoreValue;
        if (App.quizScore > 100) App.quizScore = 100;
        onScored();
        card.querySelector('.quiz-feedback-text').innerHTML = `<span style="color:#6ee7b7;">✔ 答对啦！(+${scoreValue}分) ${qObj.explain}</span>`;
        playSingleVoice("Bingo! Correct!");
      } else {
        btn.classList.add('wrong');
        onScored();
        card.querySelector('.quiz-feedback-text').innerHTML = `<span style="color:#fca5a5;">❌ 答错啦！正确答案是: ${qObj.options[qObj.answer]} (${qObj.explain})</span>`;
        playSingleVoice("Oh no! Let's review!");
        // 自动将错误项存入错题本
        addMistake(qObj.q, qObj.options[qObj.answer], optStr, qObj.explain);
      }
    });
    optContainer.appendChild(btn);
  });

  return card;
}

// 5. 渲染错题复习本
function renderMistakesBoard() {
  const container = document.getElementById('mistakesList');
  if (!container) return;

  if (App.mistakes.length === 0) {
    container.innerHTML = '<div class="empty-tip">暂无错题记录，孩子掌握得非常扎实！⭐</div>';
    return;
  }

  container.innerHTML = '';
  App.mistakes.slice(0, 8).forEach(item => {
    const row = document.createElement('div');
    row.className = 'mistake-item';
    row.innerHTML = `
      <div class="mistake-content">
        <strong>${item.q}</strong>
        <p>正确答案：<span style="color:#38bdf8;">${item.correct}</span> | 你的选择：<span style="color:#f87171;">${item.user}</span></p>
      </div>
      <button class="pill-mini-btn" onclick="playSingleVoice('${item.correct}')">听正音 🔊</button>
    `;
    container.appendChild(row);
  });
}

// 6. 渲染 7 天 AI 创编儿歌
function renderChantBoard(cw) {
  const chant = cw?.sevenDayChant;
  const titleEl = document.getElementById('chantTitle');
  const lyricsEl = document.getElementById('chantLyrics');
  const playBtn = document.getElementById('playChantBtn');

  if (!chant) {
    if (titleEl) titleEl.textContent = "7天词汇趣味儿歌 (AI 即兴创编)";
    if (lyricsEl) lyricsEl.innerHTML = '<div class="empty-tip">正在根据本单元词汇量融合生成中...</div>';
    return;
  }

  if (titleEl) titleEl.textContent = chant.title;
  if (lyricsEl) {
    lyricsEl.innerHTML = '';
    chant.lines.forEach(line => {
      const p = document.createElement('div');
      p.style.cursor = 'pointer';
      p.innerHTML = `<div class="chant-line-en">${line.en} 🔊</div><div class="chant-line-zh">${line.zh}</div>`;
      p.addEventListener('click', () => {
        playSingleVoice(line.en);
      });
      lyricsEl.appendChild(p);
    });
  }

  if (playBtn) {
    playBtn.onclick = () => {
      const fullSong = chant.lines.map(l => l.en).join(". ");
      playSingleVoice(fullSong, 0.8);
    };
  }
}

// 7. 单句/单词发音工具
function playSingleVoice(text, rate = null) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  utter.lang = hasChinese ? 'zh-CN' : 'en-US';
  utter.rate = rate || (parseFloat(App.config.speechRate) || 0.85);

  const voices = window.speechSynthesis.getVoices();
  if (App.config.voiceURI) {
    const v = voices.find(x => x.voiceURI === App.config.voiceURI);
    if (v) utter.voice = v;
  }
  window.speechSynthesis.speak(utter);
}

// 8. 语音音色初始化
function initVoices() {
  const voiceSelect = document.getElementById('cfgVoiceSelect');
  function populate() {
    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
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

// 9. 状态机控制
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
      subStatus.textContent = App.isCalling ? `随时开口说话即可 · ${modeTag}` : '双手免提 · 看着左侧课件像打语音电话一样自然对练';
      icon.textContent = '🎙️';
      break;

    case 'LISTENING':
      orb.classList.add('state-listening');
      indicator.textContent = '正在倾听您说话...';
      subStatus.textContent = '请大声说英语（不会可说中文），说完停顿 1 秒即可自动接话';
      icon.textContent = '👂';
      break;

    case 'THINKING':
      orb.classList.add('state-thinking');
      indicator.textContent = '正在思考回复中...';
      subStatus.textContent = `${modeTag}，正在组织课标对练回复...`;
      icon.textContent = '✨';
      break;

    case 'SPEAKING':
      orb.classList.add('state-speaking');
      indicator.textContent = `${App.activeCourseware?.persona?.name || 'AI'} 正在说话...`;
      subStatus.textContent = '注意听纯正发音，听完即可直接接话（也可轻点声波球打断）';
      icon.textContent = '🗣️';
      break;
  }
}

// 10. 通话开关
function toggleCall() {
  if (App.isCalling) {
    endCall();
  } else {
    startCall();
  }
}

function startCall() {
  App.isCalling = true;
  App.currentDialogueStep = 0;
  const btn = document.getElementById('callToggleBtn');
  btn.className = 'call-btn end-call';
  btn.querySelector('.btn-text').textContent = '挂断通话';
  btn.querySelector('.btn-icon').textContent = '📵';

  document.getElementById('muteBtn').disabled = false;
  const hasKey = Boolean(App.config.apiKey && App.config.apiKey.trim());
  appendTranscript('system', `🟢 通话已接通！[模式: ${hasKey ? '大模型实时生成' : '课标严格考核模式(免Key)'}]`);
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
  App.currentDialogueStep = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  const cw = App.activeCourseware;
  const greeting = cw?.initialGreeting || "Hello! I am Bingo. What is your name?";

  if (cw?.persona?.systemPrompt) {
    let prompt = cw.persona.systemPrompt;
    prompt += `\n\n### CRITICAL TEACHING RULES:
1. STRICT PEDAGOGY: Do NOT accept random/irrelevant English words as correct answers! If the child answers an irrelevant word (e.g. You asked for name, but child says 'apple'), gently explain in Chinese: '哈哈，apple 是好吃的苹果，但现在 Bingo 问的是你的名字哦！试着对我说：My name is [名字]！'
2. PURE ENGLISH when child speaks English: Keep conversation purely in English (1-2 sentences).
3. CHINESE MENTOR when child speaks Chinese: Warmly explain in Chinese first, then teach the corresponding English sentence, and invite the child to repeat.`;
    App.conversationHistory.push({ role: 'system', content: prompt });
  }

  setTimeout(() => {
    speakAiResponse(greeting);
  }, 400);
}

// 11. 语音合成 (TTS)：中英文无缝发音
function speakAiResponse(fullText) {
  if (!('speechSynthesis' in window)) {
    alert('您的设备暂不支持语音朗读，请使用 Safari、Chrome 或 Edge 浏览器');
    return;
  }

  stopListening();
  if (App.echoGuardTimer) clearTimeout(App.echoGuardTimer);

  App.conversationHistory.push({ role: 'assistant', content: fullText });
  appendTranscript('bot', `${App.activeCourseware?.persona?.name || 'AI'}: ${fullText}`);

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(fullText);
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
    // 防回声缓冲 600ms
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

  utter.onerror = () => {
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

// 12. 语音识别 (STT)：支持中英双语混合识别
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    appendTranscript('system', '⚠️ 当前浏览器暂未开启麦克风或不支持语音录入，请确保在系统设置中允许浏览器访问麦克风。推荐使用 iPad Safari (HTTPS) 或 Chrome！');
    return null;
  }

  const rec = new SpeechRecognition();
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

// 13. 提交孩子所说的话并进行严格语义校验
async function commitUserSpeech(spokenText) {
  if (!spokenText.trim()) return;
  stopListening();

  appendTranscript('user', `🧒 You: ${spokenText.trim()}`);
  App.conversationHistory.push({ role: 'user', content: spokenText.trim() });
  setAppState('THINKING');

  const hasKey = Boolean(App.config.apiKey && App.config.apiKey.trim());

  // 1. 严格模式下的离线对练引擎（精准校验语义是否切题）
  if (!hasKey) {
    setTimeout(() => {
      const reply = generateStrictPedagogyReply(spokenText.trim());
      speakAiResponse(reply);
    }, 700);
    return;
  }

  // 2. 有 Key 时请求大模型，带上严格教学指示
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
    const fallback = generateStrictPedagogyReply(spokenText.trim());
    speakAiResponse(fallback);
  }
}

// 严格教学逻辑：不能乱说英文就算对！必须切题！
function generateStrictPedagogyReply(input) {
  const lower = input.toLowerCase();
  const hasChinese = /[\u4e00-\u9fa5]/.test(input);

  // 分步状态机：Step 0: 问名字 -> Step 1: 挥挥手 -> Step 2: 分享玩具
  if (App.currentDialogueStep === 0) {
    // 目标问：What is your name?
    if (hasChinese) {
      if (/叫|我是|名字/.test(input)) {
        App.currentDialogueStep = 1;
        return "原来是这样呀！很高兴认识你！如果用英文介绍自己可以说：“My name is...” 后面加上名字。试着跟我念：Nice to meet you! 很高兴认识你！我会挥挥手，你会挥手吗？Can you wave your hand?";
      }
      if (/不懂|什么意思|不会/.test(input)) {
        return "别担心哦！Bingo 刚才在问你叫什么名字。试着告诉我：“My name is ...” 后面加上名字，试一次！";
      }
      return "听懂你的意思啦！不过 Bingo 刚才在问你的名字哦，试着对我说：“Hello, I'm ...” 试试看！";
    }

    // 孩子说英文：必须包含名字相关词（name, i am, i'm, hello+人名等），不能乱说别的不相干单词！
    if (/name|i'm|i am|amy|mike|john|sarah|tom/i.test(lower)) {
      App.currentDialogueStep = 1;
      return "Nice to meet you! Look, I can wave my hand. Can you wave your hand?";
    } else {
      // 说了不切题的英文单词（比如乱说 apple, cat, dog 等）
      return `Haha, that's fun! 哈哈，很有趣，但现在 Bingo 问的是你的名字“What is your name”哦！试着回答：“My name is...” 后面加上你的名字！`;
    }
  }

  if (App.currentDialogueStep === 1) {
    // 目标问：Can you wave your hand?
    if (hasChinese) {
      if (/会|可以|手|好/.test(input)) {
        App.currentDialogueStep = 2;
        return "真棒！赞同对方的时候，用英文可以说：“Yes, I can wave my hand.” 跟我大声说：hand！现在我们是好朋友啦，Let's share our toys! 一起分享玩具好吗？";
      }
      return "挥挥手在英语里叫 wave your hand 哦！试着用英文对我说：“Yes, I can!” 试一次！";
    }

    if (/yes|can|hand|wave/i.test(lower)) {
      App.currentDialogueStep = 2;
      return "Super! We are good friends now. Let's share our toys, OK?";
    } else {
      return "Almost! 差一点点哦！Bingo 问的是你会不会挥挥手“Can you wave your hand?”，试着大声说：“Yes, I can wave my hand!”";
    }
  }

  if (App.currentDialogueStep === 2) {
    // 目标问：Let's share our toys, OK?
    if (hasChinese) {
      if (/好|可以|行|分享/.test(input)) {
        App.currentDialogueStep = 0; // 通关
        return "Bingo! 恭喜你！懂得分享的孩子最棒啦！你完成了今天的课文对练，奖励你一颗大金星！⭐ 接下来可以点击左侧的【测验考核打分】做小测验哦！";
      }
      return "分享玩具可以说：“Let's share!” 跟我大声读一次：share！";
    }

    if (/ok|share|good|friend|yes/i.test(lower)) {
      App.currentDialogueStep = 0;
      return "Bingo! You did an amazing job today! You got a golden star! ⭐ Now click on the Quiz tab on the left to test your score!";
    } else {
      return "Good try! 试着大声对我说：“OK! We share.”（好的！我们一起分享。）";
    }
  }

  return "Good try! Let's keep talking!";
}

// 14. 页面日志
function appendTranscript(type, text) {
  const box = document.getElementById('transcriptBox');
  const line = document.createElement('div');
  line.className = `transcript-line ${type}`;
  line.innerHTML = `<span>${text}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// 15. UI 事件监听绑定
function bindUIEvents() {
  // 左侧环节 Tab 切换 (课本内容 / 测验打分 / 错题儿歌)
  const tabs = document.querySelectorAll('.stage-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.tab;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const activePane = document.getElementById(targetId);
      if (activePane) activePane.classList.add('active');
    });
  });

  // 清空错题本
  const clearBtn = document.getElementById('clearMistakesBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      App.mistakes = [];
      saveMistakes();
      renderMistakesBoard();
    });
  }

  // 通话开关
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
    playSingleVoice("Hello! 你好呀！我是你的伴学伙伴 Bingo！Nice to meet you!", rate);
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
    appendTranscript('system', `✅ 设置保存成功！当前模式: ${hasKey ? '大模型实时生成' : '课标严格考核模式(免Key)'}`);
    
    if (App.isCalling) {
      resetConversation();
    }
  });
}
