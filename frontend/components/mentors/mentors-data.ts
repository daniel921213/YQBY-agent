export type Mentor = {
  key: string;
  name: string;
  initial: string; // 頭像備援首字（無照片時顯示）
  role: string; // 職稱（暫用佔位）
  tags: string[]; // 專長標籤（暫空，之後補）
  bio?: string; // 簡短介紹（暫無）
  photo?: string; // /mentors/xxx.jpg（暫無）
  status?: "active" | "coming"; // coming = 開發中佔位卡
};

export const MENTORS: Mentor[] = [
  { key: "jiji", name: "吉吉", initial: "吉", role: "CT_Trader 導師", tags: [] },
  { key: "nini", name: "妮妮", initial: "妮", role: "CT_Trader 導師", tags: [] },
  { key: "kuro", name: "Kuro", initial: "K", role: "CT_Trader 導師", tags: [] },
  { key: "hb", name: "HB", initial: "HB", role: "CT_Trader 導師", tags: [] },
  { key: "evan", name: "Evan", initial: "E", role: "CT_Trader 導師", tags: [] },
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
