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
  { key: "jiji", name: "吉吉", initial: "吉", role: "CT_Trader 導師", tags: [] },
  { key: "nini", name: "妮妮", initial: "妮", role: "CT_Trader 導師", tags: [] },
  { key: "kuro", name: "Kuro", initial: "K", role: "CT_Trader 導師", tags: [] },
  { key: "hb", name: "HB", initial: "HB", role: "CT_Trader 導師", tags: [] },
  {
    key: "evan",
    name: "Evan",
    initial: "E",
    role: "CT_Trader 導師",
    tags: ["SMC", "指標", "交易系統"],
    highlights: ["指標開發", "SMC", "技術顧問"],
    bio:
      "專注時間週期、數據判讀與交易紀律。\n" +
      "我是 Evan，累積 3 年交易實戰經驗，長期研究資金流向與市場環境。\n" +
      "我相信交易不是靠感覺，而是透過系統化邏輯、風險控管與持續複盤，建立可執行的交易流程。\n" +
      "目前也透過實戰，協助多位學員從學習到操作，逐步建立交易節奏，並累積實戰操作與出金經驗。",
    photo: "/mentors/evan.png"
  },
  { key: "shark", name: "Shark", initial: "S", role: "CT_Trader 導師", tags: [] },
  { key: "junn", name: "Junn", initial: "J", role: "CT_Trader 導師", tags: [] },
  { key: "chai", name: "柴柴", initial: "柴", role: "CT_Trader 導師", tags: [] },
  { key: "zyn", name: "Zyn", initial: "Z", role: "CT_Trader 導師", tags: [] },
  { key: "louis", name: "Louis", initial: "L", role: "CT_Trader 導師", tags: [] },
  { key: "coming1", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming2", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming3", name: "開發中", initial: "?", role: "", tags: [], status: "coming" },
  { key: "coming4", name: "開發中", initial: "?", role: "", tags: [], status: "coming" }
];
