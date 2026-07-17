import React, { useState, useEffect } from 'react';
import SlantedSplit from './components/SlantedSplit';
import { Percent, Landmark } from 'lucide-react';
import LZString from 'lz-string';
import { decompressCompactToConfig } from './utils';

export default function App() {
  const [urlSharedData, setUrlSharedData] = useState<any | null>(null);
  
  // マウント時に URLのハッシュを評価
  useEffect(() => {
    const base64ToUtf8 = (str: string): string => {
      // URL-safe文字を標準的なBase64文字に正規化
      let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
      // パディング補正
      while (normalized.length % 4) {
        normalized += '=';
      }
      const binString = atob(normalized);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    };

    const parseHash = () => {
      const href = window.location.href;
      const sharedUrlIndex = href.indexOf('#shared=');
      if (sharedUrlIndex !== -1) {
        try {
          let hashPart = href.substring(sharedUrlIndex + 8);
          // パーセントエンコードを戻す
          hashPart = decodeURIComponent(hashPart);
          
          let jsonStr: string | null = null;
          
          // まずは LZ-String でデコンプレスを試みる
          try {
            jsonStr = LZString.decompressFromEncodedURIComponent(hashPart);
          } catch (lzErr) {
            console.warn('LZ-String decompression failed, trying fallback to Base64...', lzErr);
          }
          
          // LZ-Stringでのデコンプレスに失敗（または結果が空）の場合、旧URL-safe Base64のデコードをフォールバックとして試す
          if (!jsonStr) {
            try {
              jsonStr = base64ToUtf8(hashPart);
            } catch (b64Err) {
              console.error('Base64 fallback decoding also failed', b64Err);
            }
          }
          
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (parsed) {
              if (parsed.a !== undefined || parsed.g !== undefined) {
                // 新形式 (コンパクト)
                const decompressed = decompressCompactToConfig(parsed);
                setUrlSharedData(decompressed);
              } else if (typeof parsed.totalAmount === 'number' || typeof parsed.totalAmount === 'string') {
                // 旧形式
                setUrlSharedData(parsed);
              }
            }
          }
        } catch (e) {
          console.error('Failed to restore calculation from shared URL', e);
        }
      }
    };

    parseHash();

    // ハッシュ変更時にも動的反映
    window.addEventListener('hashchange', parseHash);
    return () => {
      window.removeEventListener('hashchange', parseHash);
    };
  }, []);

  // 共有URLの読み込みクリア
  const handleClearSharedLoad = () => {
    setUrlSharedData(null);
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col antialiased">
      {/* ヘッダー / ナビゲーション */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center relative select-none">
              <span className="text-white font-mono font-black text-base italic leading-none translate-x-[-0.5px]">R</span>
            </div>
            <div>
              <h1 id="main-app-title" className="text-xl font-bold tracking-tight text-slate-950 flex items-center gap-1.5 leading-none animate-fade-in">
                Ratio割り勘ツール
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* メインスペース */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 sm:px-12 py-10">
        <div className="space-y-8">
          {/* 左・中：計算フォーム・結果エリア - 広めにとる */}
          <div className="space-y-8">
            {/* 共有URL読み込み時のバナー表示 */}
            {urlSharedData && (
              <div className="bg-emerald-50 border border-emerald-200/80 text-emerald-950 rounded-xl p-4 flex justify-between items-center text-xs tracking-wide shadow-2xs">
                <span className="font-medium flex items-center gap-1.5">
                  <span className="text-emerald-700 text-sm">💡</span>
                  <span>共有URLから計算案（合計 ¥{(urlSharedData.totalAmount || 0).toLocaleString()}）を復元しました。</span>
                </span>
                <button
                  onClick={handleClearSharedLoad}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
                >
                  リセット
                </button>
              </div>
            )}

            {/* アクティブな割り勘コンポーネント (Ratio) */}
            <SlantedSplit
              key={urlSharedData ? 'slanted_shared' : 'slanted_default'}
              initialData={urlSharedData || undefined}
            />
          </div>
        </div>
      </main>

      {/* 一部文言調整 */}
      <footer className="p-12 bg-white text-center border-t border-slate-100 mt-16 space-y-2">
        <p className="text-xs text-slate-600 font-semibold whitespace-normal leading-relaxed">
          ※ すべての計算はブラウザ上で安全かつローカルに実行されます。万が一、計算結果に誤り等があっても一切の責任を負いかねますのでご了承ください。
        </p>
        <p className="text-[10px] text-slate-400 font-medium">
          Ⓒ2026 Ratio割り勘ツール
        </p>
      </footer>
    </div>
  );
}
