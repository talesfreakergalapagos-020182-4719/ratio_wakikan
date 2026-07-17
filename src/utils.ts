import { RoundingUnit, SlantedGroup } from './types';

// 金額を指定の単位で切り捨て丸めする (Math.floor)
export function roundAmount(amount: number, unit: RoundingUnit): number {
  const factor = unit;
  return Math.floor(amount / factor) * factor;
}

// 金額を日本円らしくカンマ区切りにする
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
}

// 傾斜（ウエイト・固定額）での割り勘計算
export interface SlantedResultGroup {
  id: string;
  name: string;
  count: number;
  type: 'weight' | 'amount';
  value: number;
  originalPricePerPerson: number;
  roundedPricePerPerson: number;
  totalGroupAmount: number;
  isAdjustmentGroup: boolean; // 端数調整を担当しているか
  adjusterPrice?: number;      // 調整担当者1名の実際の支払金額
  isRatioAdjusted?: boolean;   // 比率が自動調整（逆転防止）されたか
}

export function calculateSlantedSplit(
  totalAmount: number,
  groups: SlantedGroup[],
  roundingUnit: RoundingUnit,
  adjustmentGroupId?: string,
  pointRate: number = 0,
  autoAdjustRatio: boolean = true
): {
  groups: SlantedResultGroup[];
  totalCalculated: number;
  difference: number; // 端数処理による過不足（正なら多く徴収、負なら不足）
  pointsAmount: number;
  splitAmount: number;
} {
  // 入力クランプ
  const safeTotalAmount = isNaN(totalAmount) || totalAmount < 0 ? 0 : totalAmount;
  const safePointRate = isNaN(pointRate) ? 0 : Math.max(0, Math.min(100, pointRate));

  // ポイント還元額を計算 (一般的に切り捨て)
  const pointsAmount = Math.floor(safeTotalAmount * (safePointRate / 100));
  // 実際に割り勘する金額
  const splitAmount = Math.max(0, safeTotalAmount - pointsAmount);

  // 全員の合計人数を算出
  const totalPeopleCount = groups.reduce((acc, g) => acc + (isNaN(g.count) || g.count < 0 ? 0 : g.count), 0);

  // 端数調整グループのID決定 (指定したグループに1名以上いる場合、いなければ1名以上いる最上部のグループに適用)
  let targetAdjGroupId = adjustmentGroupId;
  let hasAdj = groups.some((g) => g.id === targetAdjGroupId && g.count >= 1);
  if (!hasAdj) {
    const fallback = groups.find((g) => g.count >= 1);
    if (fallback) {
      targetAdjGroupId = fallback.id;
    }
  }

  // もし割り勘する金額の合計が 0 または合計人数が 0 の場合は、全員 0 円とする
  if (splitAmount === 0 || totalPeopleCount === 0) {
    const finalResultGroups: SlantedResultGroup[] = groups.map((g) => {
      const isAdj = g.id === targetAdjGroupId;
      return {
        id: g.id,
        name: g.name,
        count: isNaN(g.count) || g.count < 0 ? 0 : g.count,
        type: g.type,
        value: isNaN(g.value) || g.value < 0 ? 0 : g.value,
        originalPricePerPerson: 0,
        roundedPricePerPerson: 0,
        totalGroupAmount: 0,
        isAdjustmentGroup: isAdj,
        adjusterPrice: isAdj ? 0 : undefined,
      };
    });
    return {
      groups: finalResultGroups,
      totalCalculated: 0,
      difference: 0,
      pointsAmount,
      splitAmount,
    };
  }

  // 調整用の一時コピー
  const adjustedGroups = groups.map((g) => ({
    ...g,
    count: isNaN(g.count) || g.count < 0 ? 0 : g.count,
    value: isNaN(g.value) || g.value < 0 ? 0 : g.value,
  }));

  // 自動調整されたグループIDを記憶
  const adjustedGroupIds = new Set<string>();

  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations) {
    const fixedGroups = adjustedGroups.filter((g) => g.type === 'amount');
    const weightGroups = adjustedGroups.filter((g) => g.type === 'weight');

    // 固定金額を合計から引き、残りの割り勘対象額を求める
    const totalFixedAmount = fixedGroups.reduce((acc, g) => acc + g.value * g.count, 0);
    const remainingAmount = Math.max(0, splitAmount - totalFixedAmount);

    // 比率（ウエイト）グループの総持分ポイント
    const totalPoints = weightGroups.reduce((acc, g) => acc + g.value * g.count, 0);

    // 仮 of basePrice
    const basePrice = totalPoints > 0 ? remainingAmount / totalPoints : 0;

    // 仮の丸め単価を計算
    const tempResult: SlantedResultGroup[] = adjustedGroups.map((g) => {
      let originalPricePerPerson = 0;
      let roundedPricePerPerson = 0;
      if (g.type === 'amount') {
        originalPricePerPerson = g.value;
        roundedPricePerPerson = g.value;
      } else {
        originalPricePerPerson = basePrice * g.value;
        roundedPricePerPerson = roundAmount(originalPricePerPerson, roundingUnit);
      }

      // 常時 0 円以上にクランプ
      roundedPricePerPerson = Math.max(0, roundedPricePerPerson);

      return {
        id: g.id,
        name: g.name,
        count: g.count,
        type: g.type,
        value: g.value,
        originalPricePerPerson,
        roundedPricePerPerson,
        totalGroupAmount: roundedPricePerPerson * g.count,
        isAdjustmentGroup: false,
      };
    });

    // 仮の丸め計算による合計額と実際の合計金額との過不足を求める
    const initialCalculated = tempResult.reduce((acc, g) => acc + g.totalGroupAmount, 0);
    const difference = initialCalculated - splitAmount;

    // 端数調整担当
    const adjGroup = tempResult.find((g) => g.id === targetAdjGroupId);
    if (adjGroup) {
      adjGroup.isAdjustmentGroup = true;
      // 端数調整支払額も、絶対に 0 円より下回らない (¥0 が下限)
      const adjusterPrice = Math.max(0, adjGroup.roundedPricePerPerson - difference);
      adjGroup.adjusterPrice = adjusterPrice;

      // 倍率が自分より高いグループの中で、一人あたり支払額が自分（端数調整適用後の支払額）以下のものをすべて見つける
      // ※割り勘対象額(splitAmount)が0より大きい場合のみ、丸めの逆転を解消するための自動調整を実行
      const reversedGroups = (autoAdjustRatio && splitAmount > 0 && adjGroup.type === 'weight')
        ? tempResult.filter(
            (g) => g.type === 'weight' && g.value > adjGroup.value && g.roundedPricePerPerson <= adjusterPrice
          )
        : [];

      if (reversedGroups.length > 0) {
        let updatedAny = false;
        for (const revGroup of reversedGroups) {
          const targetInAdjusted = adjustedGroups.find((g) => g.id === revGroup.id);
          if (targetInAdjusted) {
            const origGroup = groups.find((og) => og.id === targetInAdjusted.id);
            const originalValue = origGroup ? (isNaN(origGroup.value) || origGroup.value < 0 ? 0 : origGroup.value) : 1;
            
            // 安全な引き上げ上限（元のウエイトの3倍、または 15.0x、物理的な絶対上限は 30.0x）
            const maxRatioLimit = Math.min(30.0, Math.max(15.0, originalValue * 3));
            
            // 比率を 0.1 ずつ増額し、丸めの罠(切り捨て)を無理に飛ばさず、最小限で目標をクリアする
            const nextValue = Math.min(maxRatioLimit, targetInAdjusted.value + 0.1);
            const finalValue = Math.round(nextValue * 10) / 10;
            
            if (finalValue > targetInAdjusted.value) {
              targetInAdjusted.value = finalValue;
              adjustedGroupIds.add(revGroup.id);
              updatedAny = true;
            }
          }
        }

        // --- 元の比率の順序・比率傾斜の維持プロパゲーション (補正逆転防止) ---
        // 元の比率が大きいグループが、元の比率が小さいグループの調整後比率を下回らない（元の比率比を維持する）ようにする
        const sortedWeightGroups = adjustedGroups
          .filter((sg) => sg.type === 'weight')
          .map((sg) => {
            const orig = groups.find((o) => o.id === sg.id);
            const origVal = orig ? (isNaN(orig.value) || orig.value < 0 ? 0 : orig.value) : sg.value;
            return { sg, origVal };
          })
          .sort((a, b) => a.origVal - b.origVal);

        for (let i = 1; i < sortedWeightGroups.length; i++) {
          const prev = sortedWeightGroups[i - 1]; // 元の比率が小さいグループ
          const curr = sortedWeightGroups[i];     // 元の比率がより大きいグループ

          if (curr.origVal > prev.origVal) {
            // 元の比率に明確な差がある場合：
            // 差が最小になるよう、乗算ではなく順序を維持する最小単位(+0.01)だけ上回るようにする
            const minNeeded = prev.sg.value + 0.01;
            if (curr.sg.value < minNeeded) {
              // 0.01 単位で丸めて引き上げ
              const nextVal = Math.round(minNeeded * 100) / 100;
              // 安全な上限でキャップ（最大でも 50x）
              const maxRatioLimit = Math.min(50.0, Math.max(15.0, curr.origVal * 4));
              const finalVal = Math.min(maxRatioLimit, nextVal);

              if (finalVal > curr.sg.value) {
                curr.sg.value = finalVal;
                adjustedGroupIds.add(curr.sg.id);
                updatedAny = true;
              }
            }
          } else {
            // 元の比率が同じ場合は、調整後も curr.sg.value が prev.sg.value を下回らないようにする
            if (curr.sg.value < prev.sg.value) {
              curr.sg.value = prev.sg.value;
              adjustedGroupIds.add(curr.sg.id);
              updatedAny = true;
            }
          }
        }
        // ----------------------------------------------------

        if (updatedAny) {
          iterations++;
          continue; // 再計算
        }
      }
    }

    break;
  }

  // 最終的な計算処理
  const fixedGroups = adjustedGroups.filter((g) => g.type === 'amount');
  const weightGroups = adjustedGroups.filter((g) => g.type === 'weight');
  const totalFixedAmount = fixedGroups.reduce((acc, g) => acc + g.value * g.count, 0);
  const remainingAmount = Math.max(0, splitAmount - totalFixedAmount);
  const totalPoints = weightGroups.reduce((acc, g) => acc + g.value * g.count, 0);
  const basePrice = totalPoints > 0 ? remainingAmount / totalPoints : 0;

  const finalResultGroups: SlantedResultGroup[] = adjustedGroups.map((g) => {
    let originalPricePerPerson = 0;
    let roundedPricePerPerson = 0;
    if (g.type === 'amount') {
      originalPricePerPerson = g.value;
      roundedPricePerPerson = g.value;
    } else {
      originalPricePerPerson = basePrice * g.value;
      roundedPricePerPerson = roundAmount(originalPricePerPerson, roundingUnit);
    }

    // 安全性とNaN対策
    if (isNaN(originalPricePerPerson)) originalPricePerPerson = 0;
    if (isNaN(roundedPricePerPerson)) roundedPricePerPerson = 0;

    roundedPricePerPerson = Math.max(0, roundedPricePerPerson);

    return {
      id: g.id,
      name: g.name,
      count: g.count,
      type: g.type,
      value: g.value,
      originalPricePerPerson,
      roundedPricePerPerson,
      totalGroupAmount: roundedPricePerPerson * g.count,
      isAdjustmentGroup: false,
      isRatioAdjusted: adjustedGroupIds.has(g.id),
    };
  });

  // 分配後の合計額と、真の過不足差
  const initialCalculated = finalResultGroups.reduce((acc, g) => acc + g.totalGroupAmount, 0);
  const truthDifference = initialCalculated - splitAmount; // 調整役の最後の微調整前の真の丸め誤差

  const adjGroup = finalResultGroups.find((g) => g.id === targetAdjGroupId);
  const adjusterPrice = adjGroup ? Math.max(0, adjGroup.roundedPricePerPerson - truthDifference) : 0;

  if (adjGroup) {
    adjGroup.isAdjustmentGroup = true;
    adjGroup.adjusterPrice = adjusterPrice;
    adjGroup.totalGroupAmount = adjGroup.count > 0
      ? Math.max(0, adjusterPrice + adjGroup.roundedPricePerPerson * (adjGroup.count - 1))
      : 0;
  }

  const totalCalculated = finalResultGroups.reduce((acc, g) => acc + g.totalGroupAmount, 0);

  return {
    groups: finalResultGroups,
    totalCalculated,
    difference: truthDifference, // 調整完了前の真の過不足（これに沿ってUIバッジを出す）
    pointsAmount,
    splitAmount,
  };
}

// Compact structures for ultra short URLs
export interface CompactGroup {
  n?: string;      // name (only if custom)
  cust?: boolean;  // isCustomName
  c?: number;      // count
  t?: 'w' | 'a';   // type: 'w' -> 'weight', 'a' -> 'amount'
  v?: number;      // value
}

export interface CompactConfig {
  a: number;       // totalAmount
  cf?: number;     // courseFee
  aa?: number;     // adjustmentAmount
  r: RoundingUnit; // roundingUnit
  adj?: string;    // adjustmentGroupId
  p?: number;      // pointRate
  ara?: boolean;   // autoRatioAdjustment
  sn?: string;     // shopName
  sa?: string;     // shopAddress
  su?: string;     // shopUrl
  d?: string;      // date
  st?: string;     // startTime
  et?: string;     // endTime
  g: CompactGroup[];
}

export function compressConfigToCompact(cfg: any): Partial<CompactConfig> {
  const comp: Partial<CompactConfig> = {};
  
  if (cfg.totalAmount) comp.a = cfg.totalAmount;
  if (cfg.courseFee) comp.cf = cfg.courseFee;
  if (cfg.adjustmentAmount) comp.aa = cfg.adjustmentAmount;
  if (cfg.roundingUnit !== undefined && cfg.roundingUnit !== 100) comp.r = cfg.roundingUnit as RoundingUnit;
  if (cfg.pointRate) comp.p = cfg.pointRate;
  if (cfg.autoRatioAdjustment === false) comp.ara = false;
  if (cfg.shopName) comp.sn = cfg.shopName;
  if (cfg.shopAddress) comp.sa = cfg.shopAddress;
  if (cfg.shopUrl) comp.su = cfg.shopUrl;
  if (cfg.date) comp.d = cfg.date;
  if (cfg.startTime) comp.st = cfg.startTime;
  if (cfg.endTime) comp.et = cfg.endTime;
  
  const idMap = new Map<string, string>();
  
  const groupsToSave = (cfg.groups || []).map((group: any, index: number) => {
    const newId = `g${index}`;
    idMap.set(group.id, newId);

    const cg: Partial<CompactGroup> = {};
    if (group.count !== 1) cg.c = group.count;
    if (group.type === 'amount') cg.t = 'a';
    if (group.value !== 1) cg.v = group.value;
    if (group.isCustomName && group.name) {
      cg.n = group.name;
      cg.cust = true;
    }
    return cg as CompactGroup;
  });
  
  if (cfg.adjustmentGroupId && idMap.has(cfg.adjustmentGroupId)) {
    const newAdjId = idMap.get(cfg.adjustmentGroupId);
    if (newAdjId && newAdjId !== 'g0') comp.adj = newAdjId;
  }
  
  if (groupsToSave.length === 1 && !groupsToSave[0].c && !groupsToSave[0].t && !groupsToSave[0].v && !groupsToSave[0].cust) {
    // It's the default group, so we can omit it completely to reduce URL size
  } else if (groupsToSave.length > 0) {
    comp.g = groupsToSave;
  }
  
  return comp;
}

export function decompressCompactToConfig(compact: Partial<CompactConfig>): any {
  const totalAmount = compact.a ?? 0;
  const courseFee = compact.cf ?? 0;
  const adjustmentAmount = compact.aa ?? 0;
  const roundingUnit = (compact.r ?? 100) as RoundingUnit;
  const adjustmentGroupId = compact.adj ?? 'g0';
  const pointRate = compact.p ?? 0;
  const autoRatioAdjustment = compact.ara ?? true; // defaults to true
  const shopName = compact.sn ?? '';
  const shopAddress = compact.sa ?? '';
  const shopUrl = compact.su ?? '';
  const date = compact.d ?? '';
  const startTime = compact.st ?? '';
  const endTime = compact.et ?? '';
  const groups = (compact.g ?? []).map((cg, idx) => {
    const type = cg.t === 'a' ? 'amount' : 'weight';
    let name = cg.n ?? '';
    const count = cg.c ?? 1;
    const value = cg.v ?? 1;
    
    if (!name) {
      if (type === 'amount') {
        name = `固定額 ${formatCurrency(value)}`;
      } else {
        name = `Ratio ${value}x`;
      }
    }
    return {
      id: `g${idx}`,
      name,
      count,
      type,
      value,
      isCustomName: !!cg.cust,
    };
  });

  return {
    totalAmount,
    courseFee,
    adjustmentAmount,
    shopName,
    shopAddress,
    shopUrl,
    date,
    startTime,
    endTime,
    groups: groups.length > 0 ? groups : [{ id: 'g0', name: 'Ratio 1x', count: 1, type: 'weight', value: 1 }],
    roundingUnit,
    adjustmentGroupId,
    pointRate,
    autoRatioAdjustment,
  };
}

