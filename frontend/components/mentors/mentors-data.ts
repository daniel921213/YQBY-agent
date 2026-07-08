export type Mentor = {
  key: string;
  name: string;
  initial: string; // 頭像備援首字（無照片時顯示）
  role: string; // 職稱（暫用佔位）
  tags: string[]; // 專長標籤（暫空，之後補）
  highlights?: string[]; // 簡短介紹：金點條列（有值時取代 bio 段落）
  bio?: string; // 簡短介紹（段落式，暫無）
  photo?: string; // /mentors/xxx.jpg（暫無）
  status?: "active" | "coming"; // coming = 開發中佔位卡
};

export const MENTORS: Mentor[] = [
  {
    key: "jiji",
    name: "吉吉",
    initial: "吉",
    role: "CT_Trader 創辦人",
    tags: ["ICT", "SMC", "時間"],
    highlights: ["ICT", "SMC", "時間/環境/價格共振"],
    bio:
      "我是吉吉，CT Trader 創辦人。\n" +
      "CT（Confluence Theory）是一套建立在市場邏輯上的交易思維，我主張時間、環境、價格三者共振，並堅持邏輯交易，而非情緒交易。看不懂的盤，就沒有交易。\n" +
      "專注於外匯與加密貨幣市場，致力於帶領交易者建立獨立分析能力，而不是依賴明牌。",
    photo: "/mentors/jiji.png"
  },
  {
    key: "nini",
    name: "妮妮",
    initial: "妮",
    role: "CT_Trader 社群秘書",
    tags: [],
    highlights: ["社群營運", "學員服務", "資訊佈達"],
    bio:
      "負責 CT Trader 社群的日常營運與學員服務，協助佈達最新市場資訊、課程公告及社群通知，確保每位成員都能即時掌握重要資訊。\n" +
      "同時負責解答社群常見問題、協助學員學習與課程引導，成為學員與 CT Trader 之間最即時的溝通橋樑，陪伴每位學員順利完成學習旅程。",
    photo: "/mentors/nini.png"
  },
  {
    key: "kuro",
    name: "Kun",
    initial: "K",
    role: "CT_Trader 創辦人",
    tags: ["ICT", "SMC", "時間"],
    highlights: ["ICT", "SMC", "交易實戰6年"],
    bio:
      "從工程到交易，專注時間、數據與紀律。\n" +
      "我是 Kun，過去長期在起重工程產業累積實務經驗，後來投入金融交易市場。\n" +
      "經歷虧損、修正與反覆驗證後，我更相信交易不是靠感覺，而是建立在邏輯、風險控管與持續複盤之上。\n" +
      "目前透過系統化交易觀點與實戰經驗分享，協助多位新手建立自己的交易流程，少走冤枉路。",
    photo: "/mentors/kuro.png"
  },
  { key: "hb", name: "HB", initial: "HB", role: "CT_Trader 導師", tags: [] },
  {
    key: "evan",
    name: "Evan",
    initial: "E",
    role: "CT_Trader 技術顧問",
    tags: ["SMC", "指標", "交易系統"],
    highlights: ["指標開發", "SMC", "技術顧問"],
    bio:
      "專注時間週期、數據判讀與交易紀律。\n" +
      "我是 Evan，累積 3 年交易實戰經驗，長期研究資金流向與市場環境。\n" +
      "我相信交易不是靠感覺，而是透過系統化邏輯、風險控管與持續複盤，建立可執行的交易流程。\n" +
      "目前也透過實戰，協助多位學員從學習到操作，逐步建立交易節奏，並累積實戰操作與出金經驗。",
    photo: "/mentors/evan.png"
  },
  {
    key: "shark",
    name: "Shark",
    initial: "S",
    role: "CT_Trader 導師",
    tags: ["SNR", "數據", "K棒邏輯"],
    highlights: ["SNR", "裸 K", "數據分析"],
    bio:
      "專注 SNR 結構、價格行為與交易紀律。\n" +
      "我是 Shark，深耕加密貨幣市場 5 年。我的交易系統以 SNR 為絕對核心，專注於市場關鍵結構位的判讀，並搭配裸 K 形態和市場數據捕捉最真實的價格行為。",
    photo: "/mentors/shark.png"
  },
  { key: "junn", name: "Junn", initial: "J", role: "CT_Trader 導師", tags: [] },
  {
    key: "chai",
    name: "柴柴",
    initial: "柴",
    role: "CT_Trader 導師",
    tags: ["ICT", "SMC", "邏輯交易"],
    highlights: ["ICT", "SMC", "交易經歷4年"],
    bio:
      "我是柴柴，2022 年底入圈，從新手小白一路走到帶單老師。\n" +
      "曾經虧損過、爆倉過，也正是這些坑，逼我養成日復一日復盤跟學習的習慣，才走到今天的穩定。\n" +
      "我始終相信一件事：做單靠的不是猜測，而是邏輯。\n" +
      "在這裡，我分享的不只是方向，更是判斷背後的思路，讓你看得懂，也學得會。",
    photo: "/mentors/chai.png"
  },
  {
    key: "zyn",
    name: "Zyn",
    initial: "Z",
    role: "CT_Trader 導師",
    tags: ["ICT", "邏輯交易", "裸K"],
    highlights: ["技術分析", "時間&價格", "SMC"],
    bio:
      "17 歲踏入市場，到現在已有兩年資歷。\n" +
      "我是 Zyn，關注時間及價格，帶給我正確的答案。\n" +
      "在市場上不是比誰錢多就贏，而是靠著紀律、計劃並且執行的人才能獲勝。",
    photo: "/mentors/zyn.png"
  },
  {
    key: "louis",
    name: "Louis",
    initial: "L",
    role: "CT_Trader 導師",
    tags: ["邏輯", "裸K", "SMC"],
    highlights: ["ICT", "SMC", "邏輯交易"],
    bio:
      "交易到現在已有一年半資歷。\n" +
      "我是 Louis，關注時間及價格流動性，始終保持紀律參與交易。\n" +
      "在市場上保持紀律、不腦衝，是活下去的方法。交易是一條漫長的路，跟著我一步一步，帶你走向自律之路。",
    photo: "/mentors/louis.png"
  },
  { key: "coming1", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming2", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming3", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming4", name: "開發中", initial: "?", role: "", tags: [], status: "coming" }
];
