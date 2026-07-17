import React, { useState, useRef, useEffect } from 'react';
import { SlantedSplitConfig, SlantedGroup, RoundingUnit } from '../types';
import { calculateSlantedSplit, formatCurrency, compressConfigToCompact } from '../utils';
import { Plus, Trash2, Info, Copy, Check, Minus, X, Link, QrCode, Smartphone, ExternalLink, Store, MapPin, Calendar, Clock, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';
import QRCode from 'qrcode';

interface SlantedSplitProps {
  key?: string;
  initialData?: any;
}

export default function SlantedSplit({ initialData }: SlantedSplitProps) {
  const [config, setConfig] = useState<SlantedSplitConfig>(() => {
    const today = new Date();
    const defaultDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    if (initialData) {
      const parsed = { ...initialData };
      const totalPeople = parsed.groups?.reduce((acc: number, g: any) => acc + (g.count || 0), 0) || 0;
      if (parsed.courseFee === undefined) {
        parsed.courseFee = 0;
      }
      if (parsed.adjustmentAmount === undefined) {
        parsed.adjustmentAmount = parsed.totalAmount || 0;
      }
      parsed.totalAmount = (parsed.courseFee || 0) * totalPeople + (parsed.adjustmentAmount || 0);
      return { pointRate: 0, date: parsed.date || defaultDateStr, startTime: parsed.startTime || '19:00', endTime: parsed.endTime || '21:00', ...parsed };
    }
    return {
      totalAmount: 30000,
      courseFee: 5000,
      adjustmentAmount: 0,
      date: defaultDateStr,
      startTime: '19:00',
      endTime: '21:00',
      groups: [
        { id: 'g1', name: '固定額 ¥3,000', count: 1, type: 'amount', value: 3000 },
        { id: 'g2', name: 'Ratio 1.5x', count: 2, type: 'weight', value: 1.5 },
        { id: 'g3', name: 'Ratio 1x', count: 2, type: 'weight', value: 1 },
        { id: 'g4', name: '無料 (0円)', count: 1, type: 'amount', value: 0 },
      ],
      roundingUnit: 100,
      adjustmentGroupId: 'g3',
      pointRate: 0,
    };
  });

  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingSortGroupId, setPendingSortGroupId] = useState<string | null>(null);
  const [newlyAddedGroupId, setNewlyAddedGroupId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const sortTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent.toLowerCase();
      const mobile = /iphone|ipad|ipod|android/i.test(ua);
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  // QRコードモーダル用のステートと生成ロジック
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  useEffect(() => {
    const generateQr = async () => {
      try {
        const totalPeople = config.groups?.reduce((acc, g) => acc + (g.count || 0), 0) || 0;
        const fullConfig = {
          ...config,
          totalAmount: (config.courseFee ?? 0) * totalPeople + (config.adjustmentAmount ?? 0)
        };
        const compact = compressConfigToCompact(fullConfig);
        const jsonStr = JSON.stringify(compact);
        const compressed = LZString.compressToEncodedURIComponent(jsonStr);
        const shareUrl = `${window.location.origin}${window.location.pathname}#shared=${compressed}`;
        
        const url = await QRCode.toDataURL(shareUrl, {
          width: 320,
          margin: 1,
          color: {
            dark: '#0f172a', // slate-900
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(url);
      } catch (err) {
        console.error('Failed to generate QR code', err);
      }
    };
    generateQr();
  }, [config]);

  // 共有URLの作成とコピー
  const handleShareCopy = () => {
    try {
      const totalPeople = config.groups?.reduce((acc, g) => acc + (g.count || 0), 0) || 0;
      const fullConfig = {
        ...config,
        totalAmount: (config.courseFee ?? 0) * totalPeople + (config.adjustmentAmount ?? 0)
      };
      const compact = compressConfigToCompact(fullConfig);
      const jsonStr = JSON.stringify(compact);
      const compressed = LZString.compressToEncodedURIComponent(jsonStr);
      const shareUrl = `${window.location.origin}${window.location.pathname}#shared=${compressed}`;
      
      navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (e) {
      console.error('Failed to generate sharing URL', e);
    }
  };

  useEffect(() => {
    return () => {
      if (sortTimeoutRef.current) {
        clearTimeout(sortTimeoutRef.current);
      }
    };
  }, []);

  const applySort = (currentGroups: SlantedGroup[]) => {
    setConfig((prev) => ({
      ...prev,
      groups: [...currentGroups].sort((a, b) => {
        if (a.value === 0 && b.value !== 0) return 1;
        if (b.value === 0 && a.value !== 0) return -1;
        if (a.type !== b.type) {
          return a.type === 'amount' ? -1 : 1;
        }
        return b.value - a.value;
      }),
    }));
    
    // ソートの流れるような移動アニメーション完了（約600ms）を待ってからハイライトを消す
    setTimeout(() => {
      setPendingSortGroupId(null);
    }, 600);
  };

  // グループの追加 (最大10個まで)
  const handleAddGroup = (type: 'weight' | 'amount' = 'weight') => {
    if (config.groups.length >= 10) {
      alert('グループは最大10個まで登録可能です。');
      return;
    }
    const id = `g_${Date.now()}`;
    const nextRatioValue = Math.max(1, config.groups.filter(gt => gt.type === 'weight').length + 1);
    const newGroup: SlantedGroup = {
      id,
      name: type === 'amount' ? '固定額 ¥3,000' : `Ratio ${nextRatioValue}x`,
      count: 1,
      type,
      value: type === 'amount' ? 3000 : nextRatioValue,
    };

    if (sortTimeoutRef.current) {
      clearTimeout(sortTimeoutRef.current);
      sortTimeoutRef.current = null;
    }
    setPendingSortGroupId(id);
    setNewlyAddedGroupId(id);
    sortTimeoutRef.current = setTimeout(() => {
      setPendingSortGroupId(null);
    }, 1000);
    setTimeout(() => {
      setNewlyAddedGroupId(currentId => currentId === id ? null : currentId);
    }, 3000);

    setConfig({
      ...config,
      groups: [...config.groups, newGroup].sort((a, b) => {
        if (a.value === 0 && b.value !== 0) return 1;
        if (b.value === 0 && a.value !== 0) return -1;
        if (a.type !== b.type) {
          return a.type === 'amount' ? -1 : 1;
        }
        return b.value - a.value;
      }),
    });
  };

  // グループの削除
  const handleRemoveGroup = (id: string) => {
    if (config.groups.length <= 1) {
      alert('最低1つのグループが必要です。');
      return;
    }
    const remainingGroups = config.groups.filter((g) => g.id !== id);
    let nextAdjustmentGroupId = config.adjustmentGroupId;
    if (config.adjustmentGroupId === id) {
      nextAdjustmentGroupId = remainingGroups[0]?.id;
    }
    setConfig({
      ...config,
      groups: remainingGroups,
      adjustmentGroupId: nextAdjustmentGroupId,
    });
  };

  // グループの情報更新
  const handleUpdateGroup = (id: string, updates: Partial<SlantedGroup>) => {
    if (sortTimeoutRef.current) {
      clearTimeout(sortTimeoutRef.current);
      sortTimeoutRef.current = null;
    }

    const isValueOrCountOrTypeChange = 
      updates.value !== undefined || updates.count !== undefined || updates.type !== undefined;

    if (isValueOrCountOrTypeChange) {
      setPendingSortGroupId(id);
    }

    const nextGroups = config.groups.map((g) => {
      if (g.id !== id) return g;
      const newGroup = { ...g, ...updates };
      
      if (updates.name !== undefined) {
        const limitedName = updates.name.slice(0, 20);
        newGroup.name = limitedName;
        newGroup.isCustomName = limitedName.trim() !== '';
      }

      if (updates.count !== undefined) {
        newGroup.count = Math.max(1, Math.min(100, updates.count));
      }

      if (updates.type !== undefined) {
        if (updates.type === 'amount') {
          newGroup.value = updates.value !== undefined ? Math.max(0, Math.min(9999999999, Math.round(updates.value))) : 3000;
          if (!newGroup.isCustomName) {
            newGroup.name = newGroup.value === 0 ? '無料 (0円)' : '支払額固定';
          }
        } else {
          newGroup.value = updates.value !== undefined ? Math.max(0, Math.min(100, Math.round(updates.value * 1000) / 1000)) : 1;
          if (!newGroup.isCustomName) {
            newGroup.name = newGroup.value === 0 ? '無料 (0円)' : 'Ratio';
          }
        }
      } else if (updates.value !== undefined) {
        if (newGroup.type === 'amount') {
          newGroup.value = Math.max(0, Math.min(9999999999, Math.round(updates.value)));
          if (!newGroup.isCustomName) {
            newGroup.name = newGroup.value === 0 ? '無料 (0円)' : `固定額 ${formatCurrency(newGroup.value)}`;
          }
        } else {
          newGroup.value = Math.max(0, Math.min(100, Math.round(updates.value * 1000) / 1000));
          if (!newGroup.isCustomName) {
            newGroup.name = newGroup.value === 0 ? '無料 (0円)' : `Ratio ${newGroup.value}x`;
          }
        }
      }
      return newGroup as SlantedGroup;
    });

    if (isValueOrCountOrTypeChange) {
      let nextAdjustmentId = config.adjustmentGroupId;
      const updatedGroup = nextGroups.find((g) => g.id === id);
      if (updatedGroup && updatedGroup.value === 0 && config.adjustmentGroupId === id) {
        const fallbackGroup = nextGroups.find((g) => g.value !== 0 && g.id !== id);
        if (fallbackGroup) {
          nextAdjustmentId = fallbackGroup.id;
        }
      }

      setConfig({
        ...config,
        groups: nextGroups,
        adjustmentGroupId: nextAdjustmentId,
      });

      sortTimeoutRef.current = setTimeout(() => {
        applySort(nextGroups);
      }, 5000);
    } else {
      setConfig({
        ...config,
        groups: nextGroups,
      });
    }
  };

  // 計算の実行
  const totalPeopleCount = config.groups.reduce((acc, g) => acc + g.count, 0);
  const calculatedTotalAmount = (config.courseFee ?? 0) * totalPeopleCount + (config.adjustmentAmount ?? 0);

  const {
    groups: resultGroups,
    totalCalculated,
    difference,
    pointsAmount,
    splitAmount,
  } = calculateSlantedSplit(
    calculatedTotalAmount,
    config.groups,
    config.roundingUnit,
    config.adjustmentGroupId || (config.groups[0]?.id),
    config.pointRate || 0,
    config.autoRatioAdjustment ?? true
  );

  const totalFixedAmount = config.groups
    .filter((g) => g.type === 'amount')
    .reduce((acc, g) => acc + g.value * g.count, 0);

  const isFixedOverBudget = calculatedTotalAmount > 0 && totalFixedAmount > splitAmount;
  const anyRatioAdjusted = resultGroups.some((g) => g.isRatioAdjusted);


  // コピペ用テキスト生成
  const handleCopy = () => {
    let text = `【Ratio割り勘・精算結果】\n`;
    if (config.shopName || config.shopAddress || config.shopUrl || config.organizerPhone || config.date || config.startTime || config.endTime) {
      text += `\n[イベント・お店情報]\n`;
      if (config.date || config.startTime || config.endTime) {
        let timeStr = config.date ? `${config.date} ` : '';
        if (config.startTime && config.endTime) timeStr += `${config.startTime} ~ ${config.endTime}`;
        else if (config.startTime) timeStr += `${config.startTime} ~`;
        else if (config.endTime) timeStr += `~ ${config.endTime}`;
        if (timeStr.trim()) text += `日時: ${timeStr.trim()}\n`;
      }
      if (config.shopName) text += `店名: ${config.shopName}\n`;
      if (config.shopAddress) {
        text += `住所: ${config.shopAddress}\n`;
        const query = encodeURIComponent(config.shopName ? `${config.shopName} ${config.shopAddress}` : config.shopAddress);
        text += `Map: https://www.google.com/maps/search/?api=1&query=${query}\n`;
      }
      if (config.shopUrl) {
        text += `URL: ${config.shopUrl}\n`;
      }
      if (config.organizerPhone) {
        text += `幹事連絡先: ${config.organizerPhone}\n`;
      }
      text += `\n`;
    }
    
    // 以下、費用明細
    let hasFeeDetails = false;
    let feeText = '';
    if ((config.courseFee ?? 0) > 0) {
      feeText += `■ コース料金: ${formatCurrency(config.courseFee ?? 0)}/人 × ${totalPeopleCount}名\n`;
      hasFeeDetails = true;
    }
    if (config.adjustmentAmount && config.adjustmentAmount !== 0) {
      feeText += `■ 調整額: ${config.adjustmentAmount > 0 ? '+' : ''}${formatCurrency(config.adjustmentAmount)}\n`;
      hasFeeDetails = true;
    }
    
    if (hasFeeDetails) {
      text += feeText;
    }
    text += `■ 合計金額: ${formatCurrency(calculatedTotalAmount)}\n`;
    if (config.pointRate && config.pointRate > 0) {
      text += `■ ポイント還元 (${config.pointRate}%): -${formatCurrency(pointsAmount)}\n`;
      text += `■ 割り勘対象額: ${formatCurrency(splitAmount)}\n`;
    }
    text += `■ 総人数: ${totalPeopleCount}名\n`;
    text += `■ 丸め単位: ${config.roundingUnit}円\n`;
    text += `■ 端数逆転防止 (自動調整): ${config.autoRatioAdjustment !== false ? 'ON' : 'OFF'}\n`;
    text += `--------------------------\n`;
    
    resultGroups.forEach((g) => {
      if (g.type === 'amount') {
        text += `■ ${g.name} : ${formatCurrency(g.value)}/人 (${g.count}名)\n`;
      } else {
        text += `■ ${g.name} : ${g.value}x (${g.count}名)\n`;
      }
      if (g.isAdjustmentGroup && g.adjusterPrice !== undefined) {
        const diff = g.adjusterPrice - g.roundedPricePerPerson;
        const diffStr = diff > 0 ? `+${formatCurrency(diff)}` : diff < 0 ? formatCurrency(diff) : '±0円';
        if (g.count > 1) {
          text += `   ・1人あたり: ${formatCurrency(g.roundedPricePerPerson)}\n`;
          text += `   ・端数調整支払い (うち1名): ${formatCurrency(g.adjusterPrice)} (端数 ${diffStr})\n`;
        } else {
          text += `   ・端数調整支払い: ${formatCurrency(g.adjusterPrice)} (端数 ${diffStr})\n`;
        }
      } else {
        text += `   ・支払額: ${formatCurrency(g.roundedPricePerPerson)} (1人あたり)\n`;
      }
      text += `   ・グループ小計: ${formatCurrency(g.totalGroupAmount)}\n`;
    });
    
    text += `--------------------------\n`;
    text += `■ 回収予定額: ${formatCurrency(totalCalculated)}\n`;
    if (anyRatioAdjusted) {
      text += `※ 端数逆転防止のため、一部グループのRatioが自動調整されました。\n`;
    }
    text += `※ 端数調整によって生じる過不足額は、${resultGroups.find(g => g.isAdjustmentGroup)?.name || '指定グループ'}の1名が負担します。\n`;
    text += `※ ${config.roundingUnit}円単位で丸めています。\n`;
    
    // 共有用URLの生成と末尾への付加
    try {
      const totalPeople = config.groups?.reduce((acc, g) => acc + (g.count || 0), 0) || 0;
      const fullConfig = {
        ...config,
        totalAmount: (config.courseFee ?? 0) * totalPeople + (config.adjustmentAmount ?? 0)
      };
      const compact = compressConfigToCompact(fullConfig);
      const jsonStr = JSON.stringify(compact);
      const compressed = LZString.compressToEncodedURIComponent(jsonStr);
      const shareUrl = `${window.location.origin}${window.location.pathname}#shared=${compressed}`;
      text += `\n【結果の共有・編集URL】\n${shareUrl}\n`;
    } catch (e) {
      console.error('Failed to generate sharing URL in copy', e);
    }
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden max-w-2xl mx-auto">
      {/* 会計金額 & 基本設定 (左側) */}
      <div className="p-8 lg:p-10 flex flex-col justify-between gap-10">
        <div className="space-y-8">
          {/* イベント・お店情報 */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                イベント・お店情報
              </label>
              {((config.courseFee || 0) > 0 || (config.adjustmentAmount || 0) !== 0 || !!config.shopName || !!config.shopAddress || !!config.shopUrl || !!config.organizerPhone || !!config.date || !!config.startTime || !!config.endTime || config.groups.length > 1 || config.groups[0]?.count !== 1 || config.groups[0]?.value !== 1 || (config.pointRate || 0) > 0) && (
                <button
                  id="btn-text-clear"
                  type="button"
                  onClick={() => {
                    setConfig({ 
                      ...config, 
                      courseFee: 0, 
                      adjustmentAmount: 0, 
                      shopName: '', 
                      shopAddress: '', 
                      shopUrl: '',
                      organizerPhone: '',
                      date: '', 
                      startTime: '', 
                      endTime: '',
                      pointRate: 0,
                      groups: [{ id: 'g1', name: 'Ratio 1x', count: 1, type: 'weight', value: 1 }],
                      adjustmentGroupId: 'g1'
                    });
                  }}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-md text-slate-500 bg-slate-100/50 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all uppercase tracking-wider cursor-pointer"
                >
                  クリア
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-[2]">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="date"
                    value={config.date || ''}
                    onChange={(e) => setConfig({ ...config, date: e.target.value })}
                    className="block w-full pl-10 pr-2 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Clock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="time"
                    value={config.startTime || ''}
                    onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
                    className="block w-full pl-8 pr-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div className="flex items-center text-slate-400 text-xs font-bold">-</div>
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Clock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="time"
                    value={config.endTime || ''}
                    onChange={(e) => setConfig({ ...config, endTime: e.target.value })}
                    className="block w-full pl-8 pr-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Store className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="お店の名前を入力"
                  value={config.shopName || ''}
                  onChange={(e) => setConfig({ ...config, shopName: e.target.value })}
                  maxLength={100}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors text-slate-900 font-medium"
                />
              </div>
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex-none flex items-center pointer-events-none">
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="住所を入力"
                    value={config.shopAddress || ''}
                    onChange={(e) => setConfig({ ...config, shopAddress: e.target.value })}
                    maxLength={150}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors text-slate-900 font-medium"
                  />
                </div>
                <AnimatePresence mode="wait">
                  {config.shopAddress && config.shopAddress.trim() !== '' && (
                    <motion.button
                      key="map-button"
                      initial={{ opacity: 0, scale: 0.8, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: 10 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      type="button"
                      onClick={() => {
                        const query = encodeURIComponent(config.shopName ? config.shopName + ' ' + config.shopAddress : config.shopAddress || '');
                        window.open('https://www.google.com/maps/search/?api=1&query=' + query, '_blank');
                      }}
                      className="shrink-0 flex items-center justify-center bg-gradient-to-r from-[#4285F4] via-[#34A853] to-[#FBBC05] animate-gradient-slow text-white p-2.5 rounded-xl border border-transparent shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
                      title={config.shopName ? "店名と住所でGoogleマップを検索" : "住所でGoogleマップを検索"}
                    >
                      <MapPin className="w-4 h-4 text-white animate-bounce-slow" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed px-1">
                ※ 住所を入力するとGoogleマップボタンが表示され、入力した「お店の名前」と「住所」を組み合わせて簡単にGoogleマップで検索できます。
              </div>
              <div className="text-[11px] font-semibold text-slate-500 px-1 pt-1">
                コース情報などのURL
              </div>
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex-none flex items-center pointer-events-none">
                    <Link className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="url"
                    placeholder="コースの紹介URLを入力"
                    value={config.shopUrl || ''}
                    onChange={(e) => setConfig({ ...config, shopUrl: e.target.value })}
                    maxLength={255}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors text-slate-900 font-medium"
                  />
                </div>
                <AnimatePresence mode="wait">
                  {config.shopUrl && config.shopUrl.trim() !== '' && (
                    <motion.a
                      key="url-button"
                      initial={{ opacity: 0, scale: 0.8, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: 10 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      href={config.shopUrl.startsWith('http') ? config.shopUrl : 'https://' + config.shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center justify-center bg-gradient-to-r from-[#4F46E5] via-[#3B82F6] to-[#06B6D4] animate-gradient-slow text-white p-2.5 rounded-xl border border-transparent shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
                      title="リンクを開く"
                    >
                      <ExternalLink className="w-4 h-4 text-white animate-bounce-slow" />
                    </motion.a>
                  )}
                </AnimatePresence>
              </div>

              {/* 幹事の連絡先電話番号 */}
              <div className="text-[11px] font-semibold text-slate-500 px-1 pt-1">
                幹事連絡先電話番号
              </div>
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    placeholder="幹事の電話番号を入力（任意）"
                    value={config.organizerPhone || ''}
                    onChange={(e) => setConfig({ ...config, organizerPhone: e.target.value })}
                    maxLength={20}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-slate-50 focus:bg-white transition-colors text-slate-900 font-medium"
                  />
                </div>
                <AnimatePresence mode="wait">
                  {config.organizerPhone && config.organizerPhone.trim() !== '' && (
                    <motion.a
                      key="phone-button"
                      initial={{ opacity: 0, scale: 0.8, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: 10 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      href={'tel:' + config.organizerPhone.replace(/[^0-9+]/g, '')}
                      className="shrink-0 flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-500 animate-gradient-slow text-white p-2.5 rounded-xl border border-transparent shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      title="電話をかける"
                    >
                      <Phone className="w-4 h-4 text-white animate-bounce-slow" />
                    </motion.a>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* 会計合計 (自動計算) */}
          <section id="section-total-amount" className="space-y-4">
            <div className="flex justify-between items-center">
              <label id="label-total-amount" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                合計金額
              </label>
            </div>

            {/* お会計合計額の表示 */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 relative overflow-hidden shadow-xs">
              <div className="absolute right-4 bottom-[-10px] text-6xl font-mono font-black text-slate-800/15 select-none">
                SUM
              </div>
              <span className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase mb-1">
                支払総額 (自動計算・税込)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-light text-slate-400">¥</span>
                <span className="text-3xl font-extrabold tracking-tight font-mono text-white">
                  {calculatedTotalAmount.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-slate-400 ml-1.5">
                  ({totalPeopleCount > 0 ? `${totalPeopleCount}名分` : '0名'})
                </span>
              </div>
            </div>

            {/* コース料金 ＆ 調整額の入力枠 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* コース料金枠 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 focus-within:ring-2 focus-within:ring-orange-100 focus-within:border-orange-300 transition-all flex flex-col justify-between min-h-[94px]">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    コース料金 (1人あたり)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-0 text-sm font-bold text-slate-400 select-none">¥</span>
                    <input
                      id="input-course-fee"
                      type="number"
                      value={config.courseFee === 0 ? '' : config.courseFee}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 10);
                        const parsed = parseInt(val);
                        setConfig({ ...config, courseFee: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent pl-5 pr-2 py-0.5 text-base font-bold text-slate-900 focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0"
                    />
                    <span className="text-[10px] font-bold text-slate-400 shrink-0 select-none ml-1">
                      /人
                    </span>
                  </div>
                </div>
                <div className="text-[8px] text-slate-400 font-medium leading-none shrink-0 border-t border-slate-100 pt-1.5 mt-1.5">
                  小計: {formatCurrency(config.courseFee || 0)} × {totalPeopleCount}名 = {formatCurrency((config.courseFee || 0) * totalPeopleCount)}
                </div>
              </div>

              {/* 調整額枠 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 focus-within:ring-2 focus-within:ring-orange-100 focus-within:border-orange-300 transition-all flex flex-col justify-between min-h-[94px]">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    調整額
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-0 text-sm font-bold text-slate-400 select-none">¥</span>
                    <input
                      id="input-adjustment-amount"
                      type="number"
                      value={config.adjustmentAmount === 0 ? '' : config.adjustmentAmount}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 10);
                        const parsed = parseInt(val);
                        setConfig({ ...config, adjustmentAmount: isNaN(parsed) ? 0 : parsed });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent pl-5 pr-2 py-0.5 text-base font-bold text-slate-900 focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="text-[8px] text-slate-400 font-medium leading-none shrink-0 border-t border-slate-100 pt-1.5 mt-1.5">
                  {config.adjustmentAmount && config.adjustmentAmount !== 0 ? (
                    config.adjustmentAmount > 0 ? (
                      `追加分: +${formatCurrency(config.adjustmentAmount)}`
                    ) : (
                      `割引分: -${formatCurrency(Math.abs(config.adjustmentAmount))}`
                    )
                  ) : (
                    "追加/値引きなし"
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ポイント還元率 & 端数設定 */}
          <section className="pt-6 border-t border-slate-100 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* ポイント還元率 */}
              <div id="section-point-rate" className="space-y-3">
                <div className="flex justify-between items-center mb-3">
                  <label id="label-point-rate" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    ポイント還元率 (%)
                  </label>
                  {pointsAmount > 0 && (
                    <span className="text-[10px] font-mono font-bold text-amber-700">
                      還元額: -{formatCurrency(pointsAmount)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4 focus-within:bg-orange-50/30 focus-within:border-orange-200 transition-all">
                  <span className="text-xs font-bold text-slate-900">
                    還元率: {config.pointRate || 0}%
                  </span>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-orange-400 focus-within:ring-1 focus-within:ring-orange-100 transition-all">
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, pointRate: Math.max(0, Math.round(((config.pointRate || 0) - 0.5) * 1000) / 1000) })}
                        className="px-2 py-1 text-slate-500 hover:bg-slate-100 select-none text-xs font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        id="input-point-rate"
                        type="number"
                        value={config.pointRate === 0 ? '' : config.pointRate}
                        min="0"
                        max="100"
                        step="0.01"
                        onChange={(e) => {
                          let val = parseFloat(e.target.value);
                          if (val > 100) val = 100;
                          setConfig({
                            ...config,
                            pointRate: isNaN(val) ? 0 : Math.max(0, Math.min(100, Math.round(val * 1000) / 1000))
                          });
                        }}
                        onInput={(e) => {
                          const val = parseFloat(e.currentTarget.value);
                          if (val > 100) {
                            e.currentTarget.value = '100';
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-12 text-center text-xs font-mono font-bold bg-transparent border-none text-slate-805 focus:outline-hidden focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.0"
                      />
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, pointRate: Math.min(100, Math.round(((config.pointRate || 0) + 0.5) * 1000) / 1000) })}
                        className="px-2 py-1 text-slate-500 hover:bg-slate-100 select-none text-xs font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 端数設定 */}
              <div className="space-y-3 flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    端数丸め単位
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-2 flex-grow items-stretch">
                  {([1, 10, 100, 1000] as RoundingUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setConfig({ ...config, roundingUnit: unit })}
                      className={`py-2 px-1 text-[11px] font-semibold rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center ${
                        config.roundingUnit === unit
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {unit === 1 ? '1円' : unit === 10 ? '10円' : unit === 100 ? '100円' : '1,000円'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 端数の支払いと逆転防止設定 */}
            <div 
              className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-100/50 transition-colors mt-2"
              onClick={() => setConfig({...config, autoRatioAdjustment: !(config.autoRatioAdjustment ?? true)})}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <div className="flex gap-2 items-center mb-1">
                    <Info className="w-4 h-4 text-slate-700 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-900">
                      端数の支払いと逆転防止 (レシオ自動調整)
                    </span>
                  </div>
                  <div className="text-[10px] leading-relaxed text-slate-600 font-medium pl-6">
                    端数処理で生じる過不足額は、指定グループの1名が支払います（各カードの「端数調整」で変更可能）。端数負担の影響で、本来高いRatioを持つグループの支払額が低く逆転してしまう現象を自動的に防ぐ設定です。
                  </div>
                </div>
                <div className={`relative inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-in-out ml-3 ${config.autoRatioAdjustment !== false ? 'bg-slate-900' : 'bg-slate-200'}`}>
                  <span className="sr-only">レシオ自動調整機能</span>
                  <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white ring-0 transition duration-200 ease-in-out shadow-sm ${config.autoRatioAdjustment !== false ? 'translate-x-2' : '-translate-x-2'}`} />
                </div>
              </div>
            </div>

            {/* 均等割り勘の参考金額 */}
            {totalPeopleCount > 0 && (
              <div id="reference-average-amount" className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs">
                <span className="text-slate-600 font-medium font-sans">均等割り (目安):</span>
                <span className="font-bold text-slate-900 font-mono flex items-center gap-1">
                  {splitAmount % totalPeopleCount === 0 ? (
                    formatCurrency(splitAmount / totalPeopleCount)
                  ) : (
                    <>
                      <span>{formatCurrency(Math.round(splitAmount / totalPeopleCount))}</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        (約 {(splitAmount / totalPeopleCount).toFixed(1)}円)
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}
          </section>

          {/* グループ構成 */}
          <section className="space-y-4 pt-6 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                支払いグループ (計{totalPeopleCount}名)
              </label>
              {config.groups.length < 10 && (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleAddGroup('weight')}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-md text-[10px] sm:text-xs font-bold tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    枠を追加
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {config.groups.map((group, index) => {
                  const isSelectedAdjustment = config.adjustmentGroupId ? (config.adjustmentGroupId === group.id) : (index === 0);
                  const resultGroup = resultGroups.find((rg) => rg.id === group.id);
                  const displayValue = resultGroup ? resultGroup.value : group.value;
                  const isRatioAdjusted = resultGroup ? resultGroup.isRatioAdjusted : false;
                  const isPendingSort = pendingSortGroupId === group.id;
                  const isNewlyAdded = newlyAddedGroupId === group.id;
                  return (
                    <motion.div
                      key={group.id}
                      layout="position"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{
                        type: 'spring',
                        stiffness: 350,
                        damping: 25,
                        layout: {
                          type: 'spring',
                          stiffness: 280,
                          damping: 28,
                        }
                      }}
                      className={`p-4 rounded-2xl border transition-colors duration-500 flex flex-col gap-4 ${
                        isNewlyAdded
                          ? 'bg-amber-100/80 border-amber-400 ring-4 ring-amber-200/60 shadow-md'
                          : isPendingSort
                            ? 'bg-sky-50/90 border-sky-200 ring-4 ring-sky-100/35 shadow-3xs'
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      {/* 上部ヘッダー：タイトル、ステータス、端数調整バッジ、削除ボタン */}
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100/80">
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-slate-500 font-mono">#{index + 1}</span>
                          <input
                            type="text"
                            value={group.name}
                            maxLength={20}
                            onChange={(e) => handleUpdateGroup(group.id, { name: e.target.value.slice(0, 20) })}
                            onFocus={(e) => e.target.select()}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-orange-300 focus:ring-2 focus:ring-orange-100/50 focus:bg-white focus:outline-hidden rounded-md px-2 py-1 text-xs font-bold text-slate-800 w-[140px] sm:w-[160px] truncate transition-all"
                            placeholder="グループ名"
                            title="グループ名を編集"
                          />
                          {isRatioAdjusted && (
                            <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200/40 px-1.5 py-0.5 rounded whitespace-nowrap">
                              倍率自動調整: {displayValue}x
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={group.value === 0}
                            onClick={() => setConfig({ ...config, adjustmentGroupId: group.id })}
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition-all whitespace-nowrap ${
                              isSelectedAdjustment
                                ? 'bg-slate-950 text-white shadow-2xs cursor-default'
                                : group.value === 0
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed'
                                  : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-700 hover:border-slate-350 cursor-pointer'
                            }`}
                            title={group.value === 0 ? "無料グループは端数調整に指定できません" : ""}
                          >
                            {isSelectedAdjustment ? '端数調整 ✓' : '端数調整に指定'}
                          </button>
                        </div>

                        {/* 削除ボタン */}
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(group.id)}
                          className={`p-1.5 rounded-lg transition-colors shrink-0 ml-2 ${
                            config.groups.length <= 1
                              ? 'text-slate-300 opacity-30 cursor-not-allowed bg-transparent'
                              : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                          disabled={config.groups.length <= 1}
                          title="グループを削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 下部コントロール：3列のグリッドレイアウトで完全なレスポンシブを実現 */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                        
                        {/* タイプ切り替え (比率 vs 固定値 vs 無料) */}
                        <div className="md:col-span-4 flex flex-col gap-1 w-full">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">支払いタイプ</span>
                          <div className="flex flex-col bg-slate-100/80 rounded-lg p-1 w-full select-none h-[82px] justify-between gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateGroup(group.id, { type: 'weight', ...(group.value === 0 ? { value: 1 } : {}) })}
                              className={`w-full flex-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                                group.type === 'weight' && group.value !== 0 ? 'bg-white text-blue-600 shadow-3xs ring-1 ring-blue-200' : 'text-slate-500 hover:text-blue-700'
                              }`}
                            >
                              Ratio
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateGroup(group.id, { type: 'amount', ...(group.value === 0 && group.type === 'amount' ? { value: 3000 } : group.value === 0 ? { value: Math.round(calculatedTotalAmount / totalPeopleCount / 100) * 100 } : {}) })}
                              className={`w-full flex-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                                group.type === 'amount' && group.value !== 0 ? 'bg-white text-orange-600 shadow-3xs ring-1 ring-orange-200' : 'text-slate-500 hover:text-orange-700'
                              }`}
                            >
                              支払額固定
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateGroup(group.id, { type: 'amount', value: 0 })}
                              className={`w-full flex-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                                group.value === 0 ? 'bg-white text-emerald-600 shadow-3xs ring-1 ring-emerald-200' : 'text-slate-500 hover:text-emerald-700'
                              }`}
                            >
                              無料
                            </button>
                          </div>
                        </div>

                        {/* 人数調整 */}
                        <div className="md:col-span-4 flex flex-col gap-1 w-full">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">人数</span>
                          <div className="flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden w-full h-[82px] justify-between shadow-3xs">
                            {/* 表示エリア */}
                            <div className="flex-1 flex justify-center items-center px-1 overflow-hidden border-b border-slate-100">
                              <span className="text-center text-xs font-semibold text-slate-850 whitespace-nowrap truncate">
                                {group.count} <span className="text-[10px] text-slate-500 font-bold ml-0.5">名</span>
                              </span>
                            </div>
                            {/* 操作エリア */}
                            <div className="flex h-[28px] shrink-0 divide-x divide-slate-100 bg-slate-50/50">
                              <button
                                type="button"
                                onClick={() => handleUpdateGroup(group.id, { count: Math.max(1, group.count - 1) })}
                                className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 select-none text-sm font-bold cursor-pointer transition-colors"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateGroup(group.id, { count: Math.min(100, group.count + 1) })}
                                className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 select-none text-sm font-bold cursor-pointer transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 金額・倍率入力 */}
                        <div className="md:col-span-4 flex flex-col gap-1 w-full">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">
                            {group.value === 0 ? '無料 (0円)' : group.type === 'amount' ? '固定金額' : 'Ratio'}
                          </span>
                          <div className={`flex flex-col rounded-lg border bg-white overflow-hidden w-full h-[82px] justify-between shadow-3xs transition-all ${
                            group.value === 0 ? 'border-slate-100 opacity-60 bg-slate-50 grayscale' : 'border-slate-200 focus-within:border-orange-400 focus-within:ring-1 focus-within:ring-orange-100'
                          }`}>
                            {/* 入力エリア */}
                            <div className={`flex-1 flex items-center justify-center px-1.5 gap-0.5 overflow-hidden border-b border-slate-100 transition-colors ${group.value !== 0 ? 'focus-within:bg-orange-50/50' : ''}`}>
                              <input
                                type="number"
                                value={group.value}
                                min="0"
                                max={group.type === 'amount' ? "9999999999" : "100"}
                                step={group.type === 'amount' ? "100" : "0.1"}
                                disabled={group.value === 0}
                                onChange={(e) => {
                                  if (group.type === 'amount') {
                                    const val = parseInt(e.target.value.slice(0, 10));
                                    handleUpdateGroup(group.id, { value: isNaN(val) ? 0 : Math.max(0, val) });
                                  } else {
                                    let val = parseFloat(e.target.value);
                                    if (val > 100) val = 100;
                                    if (!isNaN(val)) {
                                      const newValue = Math.max(0, Math.min(100, Math.round(val * 1000) / 1000));
                                      handleUpdateGroup(group.id, { 
                                        value: newValue,
                                        ...(newValue === 0 ? { type: 'amount' } : {}) 
                                      });
                                    }
                                  }
                                }}
                                onInput={(e) => {
                                  if (group.type === 'amount') {
                                    if (e.currentTarget.value.length > 10) e.currentTarget.value = e.currentTarget.value.slice(0, 10);
                                  } else {
                                    if (parseFloat(e.currentTarget.value) > 100) e.currentTarget.value = '100';
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full text-center text-xs font-mono font-bold bg-transparent border-none text-slate-805 focus:outline-hidden focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0 disabled:text-slate-400"
                              />
                              <span className="text-[10px] text-slate-500 font-bold shrink-0 select-none">
                                {group.type === 'amount' ? '円' : '倍'}
                              </span>
                            </div>
                            {/* 操作エリア */}
                            <div className="flex h-[28px] shrink-0 divide-x divide-slate-100 bg-slate-50/50">
                              <button
                                type="button"
                                disabled={group.value === 0}
                                onClick={() => {
                                  if (group.type === 'amount') {
                                    handleUpdateGroup(group.id, { value: Math.max(0, group.value - 500) });
                                  } else {
                                    const newValue = Math.max(0, Math.round((group.value - 0.1) * 1000) / 1000);
                                    handleUpdateGroup(group.id, { 
                                      value: newValue,
                                      ...(newValue === 0 ? { type: 'amount' } : {})
                                    });
                                  }
                                }}
                                className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 select-none text-sm font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                disabled={group.value === 0}
                                onClick={() => {
                                  if (group.type === 'amount') {
                                    handleUpdateGroup(group.id, { value: Math.min(9999999999, group.value + 500) });
                                  } else {
                                    handleUpdateGroup(group.id, { value: Math.min(100, Math.round((group.value + 0.1) * 1000) / 1000) });
                                  }
                                }}
                                className="flex-1 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 select-none text-sm font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 精算結果の組み込み表示 */}
                      {resultGroup && (
                        <div className="mt-2 pt-4 border-t border-slate-100/80 flex flex-col gap-3">
                          <div className="flex justify-between items-baseline px-1">
                            <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">グループ合計</span>
                            <span className="text-sm font-bold text-slate-900">{formatCurrency(resultGroup.totalGroupAmount)}</span>
                          </div>

                          <div className="bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-2xs">
                            {resultGroup.isAdjustmentGroup && resultGroup.adjusterPrice !== undefined && resultGroup.roundedPricePerPerson !== resultGroup.adjusterPrice ? (
                              <div className="space-y-3">
                                {resultGroup.count > 1 ? (
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-baseline py-0.5">
                                      <span className="text-[10px] font-bold text-slate-500">1人あたり</span>
                                      <p className="text-2xl font-black text-slate-950 tracking-tight">
                                        {resultGroup.roundedPricePerPerson.toLocaleString()} <span className="text-xs font-bold text-slate-500">円</span>
                                      </p>
                                    </div>
                                    <div className="flex justify-between items-baseline py-0.5 mt-1 border-t border-slate-100 pt-2">
                                      {resultGroup.adjusterPrice < 0 ? (
                                        <>
                                          <span className="text-[10px] font-bold text-slate-500">
                                            端数担当者 (端数{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson) > 0 ? '+' : ''}{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson).toLocaleString()}円)
                                          </span>
                                          <p className="text-2xl font-black text-emerald-600 tracking-tight">
                                            {Math.abs(resultGroup.adjusterPrice).toLocaleString()} <span className="text-xs font-bold text-emerald-400">円受け取り</span>
                                          </p>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-[10px] font-bold text-slate-500">
                                            端数担当者 (端数{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson) > 0 ? '+' : ''}{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson).toLocaleString()}円)
                                          </span>
                                          <p className="text-2xl font-black text-slate-950 tracking-tight">
                                            {resultGroup.adjusterPrice.toLocaleString()} <span className="text-xs font-bold text-slate-500">円</span>
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  resultGroup.adjusterPrice < 0 ? (
                                    <div className="flex justify-between items-baseline">
                                      <span className="text-[10px] font-bold text-emerald-600">
                                        端数担当者 (端数{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson) > 0 ? '+' : ''}{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson).toLocaleString()}円)
                                      </span>
                                      <p className="text-2xl font-black text-emerald-600 tracking-tight">
                                        {Math.abs(resultGroup.adjusterPrice).toLocaleString()} <span className="text-xs font-bold text-emerald-400">円受け取り</span>
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="flex justify-between items-baseline">
                                      <span className="text-[10px] font-bold text-slate-500">
                                        端数担当者 (端数{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson) > 0 ? '+' : ''}{(resultGroup.adjusterPrice - resultGroup.roundedPricePerPerson).toLocaleString()}円)
                                      </span>
                                      <p className="text-2xl font-black text-slate-950 tracking-tight">
                                        {resultGroup.adjusterPrice.toLocaleString()} <span className="text-xs font-bold text-slate-500">円</span>
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              <div className="flex justify-between items-baseline">
                                <span className="text-[10px] font-bold text-slate-500">1人あたり</span>
                                <p className="text-2xl font-black text-slate-950 tracking-tight">
                                  {resultGroup.roundedPricePerPerson.toLocaleString()} <span className="text-xs font-bold text-slate-500">円</span>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>

      {/* 結果表示・共有 (下部) */}
      <div className="bg-[#fcfcfc] border-t border-slate-100 p-8 lg:p-10 flex flex-col justify-center">
        <div className="max-w-lg mx-auto w-full space-y-10">
          {/* システム警告・スマートヒント */}
          {(isFixedOverBudget || anyRatioAdjusted) && (
            <div className="space-y-3">
              {isFixedOverBudget && (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-[11px] leading-relaxed text-rose-800">
                  <div className="font-extrabold flex items-center gap-1.5 mb-1.5 text-rose-900 text-xs">
                    <span>⚠️ 固定枠の合計額が予算超過</span>
                  </div>
                  支払額固定グループの合計額（{formatCurrency(totalFixedAmount)}）が、割り勘対象合計（{formatCurrency(splitAmount)}）を超えているため、比率グループ等に分配できる残金がありません。固定金額を下げるか、合計金額を増やすように調整してください。
                </div>
              )}
              {anyRatioAdjusted && !isFixedOverBudget && (
                <div className="bg-amber-50 border border-amber-150 rounded-2xl p-4 text-[11px] leading-relaxed text-amber-800">
                  <div className="font-extrabold flex items-center gap-1.5 mb-1.5 text-amber-900 text-xs animate-pulse">
                    <span>💡 レシオ自動調整 (端数逆転防止) が作動中</span>
                  </div>
                  調整担当者が不足額の補填によって、自身より高いRatioのグループより支払額が増える（逆転する）現象が発生しました。不公平を防ぐため、システムがRatioを自動的に補正しています。
                  <div className="mt-2 pt-2 border-t border-amber-200/50 text-[10px] space-y-1 text-amber-900 font-medium">
                    <p className="font-bold">💡 よりスマートな計算にするには：</p>
                    <p>• 丸め単位を「10円」や「1円」などの細かい単位に設定する。</p>
                    <p>• もしくは、人数の多い別のグループを「端数調整に指定」に切り替える。</p>
                  </div>
                </div>
              )}
            </div>
          )}



          <div className="space-y-4 pt-6 border-t border-slate-100 text-sm">
            <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">会計合計額</span>
              <span className="font-mono font-bold text-slate-800">{calculatedTotalAmount.toLocaleString()}円</span>
            </div>
            {pointsAmount > 0 && (
              <>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 text-amber-750 bg-amber-50/50 px-2 rounded-lg">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    ポイント還元 ({(config.pointRate || 0)}%)
                  </span>
                  <span className="font-mono font-bold">-{pointsAmount.toLocaleString()}円</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                  <span className="text-slate-700 font-extrabold uppercase tracking-wider text-[10px]">割り勘対象金額 (還元後)</span>
                  <span className="font-mono font-black text-rose-600 text-base">{splitAmount.toLocaleString()}円</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center py-2 text-xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">端数調整方法</span>
              <span className="text-emerald-700 font-bold text-[10px] text-right">
                {difference > 0 ? (
                  `端数担当者の支払額 -${difference.toLocaleString()}円`
                ) : difference < 0 ? (
                  `端数担当者の支払額 +${Math.abs(difference).toLocaleString()}円`
                ) : (
                  "端数担当者の支払額 調整なし"
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
            <button
              onClick={handleCopy}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-xl font-bold tracking-wider text-[10px] uppercase hover:bg-slate-100 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  コピー完了 ✓
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  コピー
                </>
              )}
            </button>
            <button
              onClick={handleShareCopy}
              className="w-full bg-emerald-50 border border-emerald-100 text-emerald-950 p-3 rounded-xl font-bold tracking-wider text-[10px] uppercase hover:bg-emerald-100/50 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {shareCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  コピー完了 ✓
                </>
              ) : (
                <>
                  <Link className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="whitespace-nowrap">共有URLコピー</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowQrModal(true)}
              className="w-full bg-orange-50 border border-orange-100 text-orange-950 p-3 rounded-xl font-bold tracking-wider text-[10px] uppercase hover:bg-orange-100/50 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-orange-700 shrink-0" />
              QRコード表示
            </button>
          </div>

          {/* 決済アプリかんたん起動 */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-3.5">
              <Smartphone className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">送金・決済アプリ起動</span>
            </div>
            
            {isMobile ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <a
                  href="paypay://"
                  className="bg-[#FF003F]/5 border border-[#FF003F]/15 hover:bg-[#FF003F]/10 active:scale-98 transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer group text-center"
                >
                  <span className="text-[11px] font-black text-[#FF003F] tracking-wide flex items-center justify-center gap-0.5">
                    PayPay <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </span>
                  <span className="text-[8px] font-bold text-[#FF003F]/75">アプリを開く</span>
                </a>
                <a
                  href="aupay://"
                  className="bg-[#EA5504]/5 border border-[#EA5504]/15 hover:bg-[#EA5504]/10 active:scale-98 transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer group text-center"
                >
                  <span className="text-[11px] font-black text-[#EA5504] tracking-wide flex items-center justify-center gap-0.5">
                    au PAY <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </span>
                  <span className="text-[8px] font-bold text-[#EA5504]/75">アプリを開く</span>
                </a>
                <a
                  href="dpayment://"
                  className="bg-[#E60012]/5 border border-[#E60012]/15 hover:bg-[#E60012]/10 active:scale-98 transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer group text-center"
                >
                  <span className="text-[11px] font-black text-[#E60012] tracking-wide flex items-center justify-center gap-0.5">
                    d払い <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </span>
                  <span className="text-[8px] font-bold text-[#E60012]/75">アプリを開く</span>
                </a>
                <a
                  href="rakutenpay://"
                  className="bg-[#BF0000]/5 border border-[#BF0000]/15 hover:bg-[#BF0000]/10 active:scale-98 transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer group text-center"
                >
                  <span className="text-[11px] font-black text-[#BF0000] tracking-wide flex items-center justify-center gap-0.5">
                    楽天ペイ <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </span>
                  <span className="text-[8px] font-bold text-[#BF0000]/75">アプリを開く</span>
                </a>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                  📱 スマートフォンで各アプリを開いてください。
                </p>
                <p className="text-[9px] text-slate-400 mt-1">
                  モバイル端末から本URLにアクセスすると、ここから直接各決済アプリを起動できます。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QRコード表示モーダル */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 背景オーバーレイ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQrModal(false)}
              className="absolute inset-0 bg-slate-900/65 backdrop-blur-[2px]"
            />
            
            {/* モーダルコンテンツ */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden z-10 border border-slate-100"
            >
              {/* ヘッダー */}
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-orange-600" />
                  <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">共有用QRコード</span>
                </div>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* メイン */}
              <div className="p-6 flex flex-col items-center text-center">
                {(config.shopName || config.shopAddress || config.shopUrl || config.date || config.startTime || config.endTime) && (
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 text-left">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                      <Store className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">イベント・お店情報</span>
                    </div>
                    {(config.date || config.startTime || config.endTime) && (
                      <div className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {(() => {
                          let timeStr = config.date ? `${config.date} ` : '';
                          if (config.startTime && config.endTime) timeStr += `${config.startTime} ~ ${config.endTime}`;
                          else if (config.startTime) timeStr += `${config.startTime} ~`;
                          else if (config.endTime) timeStr += `~ ${config.endTime}`;
                          return timeStr.trim();
                        })()}
                      </div>
                    )}
                    {config.shopName && <div className="text-sm font-bold text-slate-900 break-words line-clamp-3">{config.shopName}</div>}
                    {config.shopAddress && <div className="text-[10px] text-slate-500 mt-1 break-words line-clamp-3">{config.shopAddress}</div>}
                    {config.shopUrl && (
                      <a href={config.shopUrl.startsWith('http') ? config.shopUrl : `https://${config.shopUrl}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline mt-1 break-words line-clamp-2 block">
                        {config.shopUrl}
                      </a>
                    )}
                  </div>
                )}
                {qrCodeDataUrl ? (
                  <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-xs mb-4">
                    <img
                      src={qrCodeDataUrl}
                      alt="Share QR Code"
                      className="w-48 h-48 sm:w-56 sm:h-56 select-none"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 bg-slate-100 rounded-xl flex items-center justify-center mb-4 text-xs text-slate-400">
                    読み込み中...
                  </div>
                )}

                <p className="text-xs text-slate-600 font-bold leading-relaxed mb-6 px-1">
                  割り勘メンバーのスマートフォンでこのQRコードをスキャンすると、現在の計算結果をそっくり共有して開くことができます。
                </p>

                <div className="w-full">
                  <button
                    onClick={() => setShowQrModal(false)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-3 px-6 rounded-xl font-bold tracking-wider text-[10px] uppercase hover:bg-slate-100 active:scale-98 transition-all cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
