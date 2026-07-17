export type RoundingUnit = 1 | 5 | 10 | 50 | 100 | 500 | 1000;

export interface SlantedGroup {
  id: string;
  name: string;
  count: number;
  type: 'weight' | 'amount'; // 比率ウエイト、または固定支払金額
  value: number; // ウエイト(1, 2, 3など) or 固定金額(3000など)
  isCustomName?: boolean; // ユーザーが独自の名前をカスタム入力したかどうか
}

export interface SlantedSplitConfig {
  shopName?: string;
  shopAddress?: string;
  shopUrl?: string;
  organizerPhone?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  totalAmount: number;
  courseFee?: number;
  adjustmentAmount?: number;
  groups: SlantedGroup[];
  roundingUnit: RoundingUnit;
  adjustmentGroupId?: string; // 端数調整を担当するグループのID
  pointRate?: number; // ポイント還元率 (%, 例: 1.5)
  autoRatioAdjustment?: boolean; // 例外・端数逆転防止 (自動Ratio調整)
}

export interface Member {
  id: string;
  name: string;
}
