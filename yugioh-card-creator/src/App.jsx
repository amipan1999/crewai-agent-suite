import React, { useCallback, useRef, useState } from 'react';
import CardForm from './components/CardForm.jsx';
import CardPreview from './components/CardPreview.jsx';
import { DEFAULT_CARD } from './constants.js';
import { toPng } from 'html-to-image';

export default function App() {
  const [card, setCard] = useState(DEFAULT_CARD);
  const previewRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const updateField = useCallback((key, value) => {
    setCard((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleExport = useCallback(async () => {
    if (!previewRef.current) return;
    setSaving(true);
    setSavedMessage('');
    try {
      const dataUrl = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: 'transparent',
      });
      const fileName = `${(card.name || 'card').replace(/[^\w぀-ヿ一-鿿-]/g, '_')}.png`;

      if (window.cardAPI?.savePng) {
        const result = await window.cardAPI.savePng({
          dataUrl,
          defaultName: fileName,
        });
        if (result?.saved) {
          setSavedMessage(`保存しました: ${result.filePath}`);
        }
      } else {
        // ブラウザフォールバック
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();
        setSavedMessage('ダウンロードしました');
      }
    } catch (err) {
      console.error(err);
      setSavedMessage('保存に失敗しました');
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMessage(''), 4000);
    }
  }, [card.name]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-900 text-slate-100">
      {/* ヘッダー */}
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900 shadow">
            遊
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Yu-Gi-Oh! カードクリエイター</h1>
            <p className="text-xs text-slate-400">オリジナルカードをデザインしてPNGで書き出し</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedMessage && (
            <span className="text-xs text-emerald-400">{savedMessage}</span>
          )}
          <button
            onClick={handleExport}
            disabled={saving}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 shadow transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中…' : 'PNGで保存'}
          </button>
        </div>
      </header>

      {/* メイン: 2カラム */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左: 入力フォーム */}
        <section className="w-[440px] shrink-0 overflow-y-auto border-r border-slate-700 bg-slate-800/40 p-5">
          <CardForm card={card} updateField={updateField} />
        </section>

        {/* 右: プレビュー */}
        <section className="flex flex-1 items-center justify-center overflow-auto bg-gradient-to-br from-slate-900 via-slate-950 to-black p-8">
          <CardPreview card={card} updateField={updateField} previewRef={previewRef} />
        </section>
      </main>
    </div>
  );
}
