/**
 * 课标同步内置课件库（离线直接秒开，支持 IPA 原生离线与网页双模）
 */
window.BUILTIN_COURSEWARES = [
  {
    id: "pep-3a-u1",
    title: "小学三年级上册 · Unit 1: Making friends",
    grade: "小学三年级",
    stage: "primary",
    bannerEmoji: "🎒",
    themeDescription: "【情景】新学期开学第一天，在校门口互相打招呼、介绍自己并结识新朋友！",
    persona: {
      name: "Bingo",
      role: "小学英语智能伴学校友小狗",
      tone: "生动、亲切、富有耐心、鼓励性强",
      systemPrompt: "You are 'Bingo', a friendly puppy companion and English speaking coach for a Chinese Grade 3 student.\n\n### CRITICAL ADAPTIVE LANGUAGE POLICY:\n1. IF CHILD SPEAKS ENGLISH: Reply in 100% natural, simple English (1-2 sentences). Do NOT append Chinese. Keep pure English immersion.\n2. IF CHILD SPEAKS CHINESE OR ASKS FOR HELP: Switch to gentle Chinese to explain, then teach the corresponding English sentence, and invite the child to repeat."
    },
    initialGreeting: "Hello! I am Bingo. What is your name?",
    targetDialogue: [
      { role: "Bingo", text: "Hello! My name is Bingo.", zh: "你好！我的名字叫 Bingo。" },
      { role: "You", text: "Hi, Bingo! I'm Amy.", zh: "嗨，Bingo！我是艾米。" },
      { role: "Bingo", text: "Nice to meet you! Can you wave your hand?", zh: "很高兴认识你！你会挥挥手吗？" },
      { role: "You", text: "Yes, I can wave my hand!", zh: "是的，我会挥手！" }
    ],
    targetVocab: [
      { word: "name", phonetic: "/neɪm/", zh: "名字", emoji: "🏷️", sent: "My name is Amy." },
      { word: "nice", phonetic: "/naɪs/", zh: "令人愉快的", emoji: "😊", sent: "Nice to meet you." },
      { word: "friend", phonetic: "/frend/", zh: "朋友", emoji: "🧑‍🤝‍🧑", sent: "We are good friends." },
      { word: "hand", phonetic: "/hænd/", zh: "手", emoji: "✋", sent: "Wave your hand." },
      { word: "arm", phonetic: "/ɑːm/", zh: "胳膊", emoji: "💪", sent: "Wave your arms." },
      { word: "ear", phonetic: "/ɪə(r)/", zh: "耳朵", emoji: "👂", sent: "Touch your ear." },
      { word: "eye", phonetic: "/aɪ/", zh: "眼睛", emoji: "👁️", sent: "Close your eyes." },
      { word: "mouth", phonetic: "/maʊθ/", zh: "嘴巴", emoji: "👄", sent: "Open your mouth." },
      { word: "share", phonetic: "/ʃeə(r)/", zh: "分享", emoji: "🤝", sent: "We share toys." }
    ],
    quickPrompts: [
      { text: "Hello, my name is ...", zh: "你好，我的名字是..." },
      { text: "Nice to meet you!", zh: "很高兴认识你！" },
      { text: "Yes, I can wave my hand.", zh: "是的，我会挥手。" },
      { text: "Let's share our toys!", zh: "我们一起分享玩具吧！" }
    ],
    // 单元测验题库
    unitQuiz: [
      {
        q: "当你新认识一个朋友，想表达“很高兴认识你”，应该说：",
        options: ["Goodbye!", "Nice to meet you.", "Open your mouth."],
        answer: 1,
        explain: "Nice to meet you! 意思是很高兴认识你。"
      },
      {
        q: "身体部位：听老师说 'Wave your hand!'，你应该做哪个动作？",
        options: ["摸摸耳朵", "闭上眼睛", "挥挥你的手"],
        answer: 2,
        explain: "hand 是手，Wave your hand 是挥挥手。"
      },
      {
        q: "想向新同学介绍自己的名字叫明明，正确的表达是：",
        options: ["My name is Mingming.", "I am friend.", "Touch your ear."],
        answer: 0,
        explain: "My name is... 意思是我的名字叫..."
      },
      {
        q: "我们一起玩玩具，想要表达“分享”，用哪个英文单词？",
        options: ["share", "listen", "arm"],
        answer: 0,
        explain: "share 意思是分享。"
      }
    ],
    // 7天创编儿歌核心词
    sevenDayChant: {
      title: "Friends Share and Smile (好朋友之歌)",
      lines: [
        { en: "Hello, hello, my new friend!", zh: "你好，你好，我的新朋友！" },
        { en: "Wave your hand and smile again.", zh: "挥挥你的手，再次微微笑。" },
        { en: "Touch your ear and touch your eye,", zh: "摸摸你的小耳朵，摸摸小眼睛，" },
        { en: "Share our toys and never cry!", zh: "一起分享玩具，开心不哭闹！" }
      ]
    }
  },
  {
    id: "pep-3a-u2",
    title: "小学三年级上册 · Unit 2: Different families",
    grade: "小学三年级",
    stage: "primary",
    bannerEmoji: "👨‍👩‍👧‍👦",
    themeDescription: "【情景】邀请好朋友来家里做客，拿出温馨的家庭相册，介绍自己的爸爸妈妈和家人！",
    persona: {
      name: "Bingo",
      role: "做客家访的小伙伴",
      tone: "温馨、亲切、好奇、热心",
      systemPrompt: "You are 'Bingo', visiting a Chinese 3rd grader's home and looking at their family photos.\n\n### CRITICAL ADAPTIVE LANGUAGE POLICY:\n1. IF CHILD SPEAKS ENGLISH: Reply in 100% natural, simple English (1-2 sentences). No Chinese.\n2. IF CHILD SPEAKS CHINESE OR ASKS FOR HELP: Switch to gentle Chinese guidance. First respond in warm Chinese, then teach the English sentence."
    },
    initialGreeting: "Welcome to my home! Look, who is this in your photo?",
    targetDialogue: [
      { role: "Bingo", text: "Who is this tall man?", zh: "这位高高的人是谁呀？" },
      { role: "You", text: "He is my father.", zh: "他是我爸爸。" },
      { role: "Bingo", text: "He looks so kind! And who is she?", zh: "他看起来真亲切！那她是？" },
      { role: "You", text: "She is my mother. I love my family!", zh: "她是我妈妈。我爱我的家！" }
    ],
    targetVocab: [
      { word: "father", phonetic: "/ˈfɑːðə(r)/", zh: "父亲；爸爸", emoji: "👨", sent: "He is my father." },
      { word: "mother", phonetic: "/ˈmʌðə(r)/", zh: "母亲；妈妈", emoji: "👩", sent: "She is my mother." },
      { word: "brother", phonetic: "/ˈbrʌðə(r)/", zh: "兄；弟", emoji: "👦", sent: "This is my brother." },
      { word: "sister", phonetic: "/ˈsɪstə(r)/", zh: "姐；妹", emoji: "👧", sent: "This is my sister." },
      { word: "grandfather", phonetic: "/ˈɡrænfɑːðə(r)/", zh: "祖父；外祖父", emoji: "👴", sent: "He is my grandfather." },
      { word: "grandmother", phonetic: "/ˈɡrænmʌðə(r)/", zh: "祖母；外祖母", emoji: "👵", sent: "She is my grandmother." },
      { word: "family", phonetic: "/ˈfæməli/", zh: "家庭；家人", emoji: "🏡", sent: "I love my family." }
    ],
    quickPrompts: [
      { text: "He is my father.", zh: "他是我爸爸。" },
      { text: "She is my mother.", zh: "她是我妈妈。" },
      { text: "This is my brother.", zh: "这是我的哥哥/弟弟。" },
      { text: "I love my family!", zh: "我爱我的家！" }
    ],
    unitQuiz: [
      {
        q: "向朋友介绍自己的妈妈，应该说：",
        options: ["He is my father.", "She is my mother.", "This is a cat."],
        answer: 1,
        explain: "She is my mother. 意思为她是我妈妈。"
      },
      {
        q: "brother 的中文含义是：",
        options: ["爸爸", "姐姐", "哥哥/弟弟"],
        answer: 2,
        explain: "brother 表示兄或弟。"
      }
    ],
    sevenDayChant: {
      title: "My Sweet Family (我的温暖一家)",
      lines: [
        { en: "Father, mother, sister and brother,", zh: "爸爸、妈妈、姐姐和弟弟，" },
        { en: "We love and help each other.", zh: "互相关爱，彼此珍惜。" },
        { en: "Grandpa, grandma, warm and bright,", zh: "爷爷、奶奶，慈祥又温暖，" },
        { en: "My sweet family, day and night!", zh: "幸福的家园，岁岁年年！" }
      ]
    }
  },
  {
    id: "pep-7a-u1",
    title: "初中七年级上册 · Unit 1: You and Me",
    grade: "初中七年级",
    stage: "junior",
    bannerEmoji: "🏫",
    themeDescription: "【情景】初中开学第一天，结识来自各地的初中新同学，交流个人爱好与校园生活！",
    persona: {
      name: "Alex",
      role: "初中英国交换生",
      tone: "幽默、地道、随和",
      systemPrompt: "You are Alex from London. Speak in Grade 7 English."
    },
    initialGreeting: "Hi there! I am Alex. Nice to meet you in middle school! Where are you from?",
    targetDialogue: [
      { role: "Alex", text: "Nice to meet you! What's your hobby?", zh: "很高兴认识你！你的爱好是什么？" },
      { role: "You", text: "I like playing basketball.", zh: "我喜欢打篮球。" }
    ],
    targetVocab: [
      { word: "classmate", phonetic: "/ˈklɑːsmeɪt/", zh: "同班同学", emoji: "🧑‍🤝‍🧑", sent: "We are classmates." },
      { word: "hobby", phonetic: "/ˈhɒbi/", zh: "业余爱好", emoji: "🎨", sent: "My hobby is reading." },
      { word: "favorite", phonetic: "/ˈfeɪvərɪt/", zh: "特别喜爱的", emoji: "⭐", sent: "English is my favorite subject." }
    ],
    quickPrompts: [
      { text: "I'm from China.", zh: "我来自中国。" },
      { text: "My favorite sport is basketball.", zh: "我最喜欢的运动是篮球。" }
    ],
    unitQuiz: [],
    sevenDayChant: null
  }
];
