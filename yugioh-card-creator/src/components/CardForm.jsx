import React, { useCallback } from 'react';
import { ATTRIBUTES, CARD_TYPES, MAX_LEVEL } from '../constants.js';

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-xs text-slate-300">{children}</label>;
}

const baseInput =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

export default function CardForm({ card, updateField }) {
  const cardTypeMeta = CARD_TYPES.find((t) => t.value === card.cardType);
  const isMonster = !!cardTypeMeta?.isMonster;
  const isLink = !!cardTypeMeta?.isLink;

  const handleImage = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateField('imageData', reader.result);
        updateField('imageOffsetX', 0);
        updateField('imageOffsetY', 0);
        updateField('imageScale', 1);
      };
      reader.readAsDataURL(file);
    },
    [updateField]
  );

  return (
    <div>
      <Section title="基本情報">
        <Label>カード名</Label>
        <input
          className={baseInput}
          value={card.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="例: ブラック・マジシャン"
        />

        <Label>カード種別</Label>
        <select
          className={baseInput}
          value={card.cardType}
          onChange={(e) => updateField('cardType', e.target.value)}
        >
          {CARD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {isMonster && (
          <>
            <Label>属性</Label>
            <select
              className={baseInput}
              value={card.attribute}
              onChange={(e) => updateField('attribute', e.target.value)}
            >
              {ATTRIBUTES.filter((a) => !['SPELL', 'TRAP'].includes(a.value)).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>

            <Label>{isLink ? 'リンク' : 'レベル / ランク'}（1〜{MAX_LEVEL}）</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={MAX_LEVEL}
                value={card.level}
                onChange={(e) => updateField('level', Number(e.target.value))}
                className="flex-1 accent-amber-400"
              />
              <span className="w-8 text-right text-sm font-bold text-amber-300">{card.level}</span>
            </div>

            <Label>種族 / 分類</Label>
            <input
              className={baseInput}
              value={card.race}
              onChange={(e) => updateField('race', e.target.value)}
              placeholder="例: ドラゴン族／効果"
            />
          </>
        )}
      </Section>

      <Section title="効果テキスト">
        <textarea
          className={`${baseInput} h-32 resize-none leading-relaxed`}
          value={card.effectText}
          onChange={(e) => updateField('effectText', e.target.value)}
          placeholder="カードの効果テキストを入力…"
        />
        <p className="text-[11px] text-slate-500">
          ※ プレビューでは長さに応じてフォントサイズが自動調整されます
        </p>
      </Section>

      {isMonster && !isLink && (
        <Section title="ステータス">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>攻撃力</Label>
              <input
                type="number"
                className={baseInput}
                value={card.atk}
                onChange={(e) => updateField('atk', Number(e.target.value))}
              />
            </div>
            <div>
              <Label>守備力</Label>
              <input
                type="number"
                className={baseInput}
                value={card.def}
                onChange={(e) => updateField('def', Number(e.target.value))}
              />
            </div>
          </div>
        </Section>
      )}

      {isLink && (
        <Section title="ステータス">
          <Label>攻撃力</Label>
          <input
            type="number"
            className={baseInput}
            value={card.atk}
            onChange={(e) => updateField('atk', Number(e.target.value))}
          />
        </Section>
      )}

      <Section title="カードイラスト">
        <input
          type="file"
          accept="image/*"
          onChange={handleImage}
          className="block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-900 hover:file:bg-amber-400"
        />

        {card.imageData && (
          <>
            <Label>拡大・縮小（{card.imageScale.toFixed(2)}x）</Label>
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.01}
              value={card.imageScale}
              onChange={(e) => updateField('imageScale', Number(e.target.value))}
              className="w-full accent-amber-400"
            />

            <button
              type="button"
              onClick={() => {
                updateField('imageScale', 1);
                updateField('imageOffsetX', 0);
                updateField('imageOffsetY', 0);
              }}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              位置・サイズをリセット
            </button>

            <p className="text-[11px] text-slate-500">
              ※ プレビュー上で画像をドラッグして位置調整、ホイールで拡大縮小ができます
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
