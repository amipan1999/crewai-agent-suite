import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ATTRIBUTES, CARD_TYPES, MAX_LEVEL } from '../constants.js';

const CARD_W = 421;
const CARD_H = 614;
const ART_BOX = { x: 50, y: 110, w: 321, h: 321 };

function getEffectFontSize(text) {
  const len = text?.length ?? 0;
  if (len < 80) return 13;
  if (len < 140) return 12;
  if (len < 200) return 11;
  if (len < 280) return 10;
  if (len < 360) return 9;
  return 8;
}

function shade(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
  let b = (num & 0xff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function LevelStars({ count, isXyz }) {
  const stars = Array.from({ length: Math.min(count, MAX_LEVEL) });
  const symbol = isXyz ? '◯' : '★';
  return (
    <div className="flex flex-row-reverse gap-[2px]" style={{ direction: 'rtl' }}>
      {stars.map((_, i) => (
        <span
          key={i}
          style={{
            color: isXyz ? '#000' : '#E8B948',
            fontSize: 18,
            textShadow: isXyz ? 'none' : '0 0 2px #6B3F00',
            lineHeight: 1,
          }}
        >
          {symbol}
        </span>
      ))}
    </div>
  );
}

function AttributeBadge({ attribute }) {
  const attr = ATTRIBUTES.find((a) => a.value === attribute);
  if (!attr) return null;
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white shadow-md"
      style={{
        width: 38,
        height: 38,
        background: `radial-gradient(circle at 30% 30%, ${attr.color}, ${shade(attr.color, -25)})`,
        border: '2px solid #f8f4e3',
        fontSize: 16,
      }}
    >
      {attr.symbol}
    </div>
  );
}

export default function CardPreview({ card, updateField, previewRef }) {
  const meta = CARD_TYPES.find((t) => t.value === card.cardType) ?? CARD_TYPES[0];
  const isMonster = !!meta.isMonster;
  const isLink = !!meta.isLink;
  const isXyz = !!meta.isXyz;

  const artRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const onArtMouseDown = (e) => {
    if (!card.imageData) return;
    e.preventDefault();
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      origX: card.imageOffsetX,
      origY: card.imageOffsetY,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      updateField('imageOffsetX', drag.origX + dx);
      updateField('imageOffsetY', drag.origY + dy);
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, updateField]);

  const onWheel = (e) => {
    if (!card.imageData) return;
    e.preventDefault();
    const next = Math.max(
      0.3,
      Math.min(3, card.imageScale + (e.deltaY < 0 ? 0.05 : -0.05))
    );
    updateField('imageScale', Number(next.toFixed(3)));
  };

  const effectFontSize = useMemo(() => getEffectFontSize(card.effectText), [card.effectText]);

  const subType = isMonster ? `【${card.race || ''}】` : `【${meta.label}】`;
  const nameColor = ['xyz', 'spell', 'trap'].includes(card.cardType) ? '#fff' : '#000';

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={previewRef}
        className="relative shadow-2xl"
        style={{
          width: CARD_W,
          height: CARD_H,
          borderRadius: 14,
          background: `linear-gradient(180deg, ${shade(meta.frame, 8)} 0%, ${meta.frame} 50%, ${shade(meta.frame, -10)} 100%)`,
          padding: 14,
          boxSizing: 'border-box',
          fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
        }}
      >
        <div
          className="relative h-full w-full"
          style={{
            background: '#E9D7A8',
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.25)',
          }}
        >
          {/* 名前バー + 属性 */}
          <div
            className="absolute left-3 right-3 top-2 flex items-center justify-between"
            style={{ height: 30 }}
          >
            <div
              className="truncate font-bold"
              style={{
                color: nameColor,
                fontSize: 22,
                letterSpacing: '0.01em',
                textShadow: nameColor === '#fff' ? '0 0 2px #000' : 'none',
                maxWidth: 320,
              }}
            >
              {card.name || ' '}
            </div>
            <AttributeBadge
              attribute={
                isMonster ? card.attribute : card.cardType === 'spell' ? 'SPELL' : 'TRAP'
              }
            />
          </div>

          {/* レベル/ランク */}
          {isMonster && !isLink && (
            <div
              className="absolute"
              style={{
                top: 44,
                left: 12,
                right: 12,
                height: 22,
                display: 'flex',
                justifyContent: isXyz ? 'flex-start' : 'flex-end',
              }}
            >
              <LevelStars count={card.level} isXyz={isXyz} />
            </div>
          )}

          {/* イラスト */}
          <div
            ref={artRef}
            onMouseDown={onArtMouseDown}
            onWheel={onWheel}
            className="absolute overflow-hidden"
            style={{
              left: ART_BOX.x,
              top: ART_BOX.y,
              width: ART_BOX.w,
              height: ART_BOX.h,
              border: '2px solid #2b1d0c',
              background: '#5c5c66',
              cursor: card.imageData ? (drag ? 'grabbing' : 'grab') : 'default',
            }}
          >
            {card.imageData ? (
              <img
                src={card.imageData}
                draggable={false}
                alt=""
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${card.imageOffsetX}px, ${card.imageOffsetY}px) scale(${card.imageScale})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-200">
                画像をアップロード
              </div>
            )}
          </div>

          {/* 種族行 */}
          <div
            className="absolute"
            style={{
              left: 14,
              right: 14,
              top: ART_BOX.y + ART_BOX.h + 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#1a1a1a',
              borderBottom: '1px solid rgba(0,0,0,0.3)',
              paddingBottom: 2,
            }}
          >
            {subType}
          </div>

          {/* 効果テキスト */}
          <div
            className="absolute card-effect-text"
            style={{
              left: 14,
              right: 14,
              top: ART_BOX.y + ART_BOX.h + 28,
              bottom: isMonster ? 36 : 18,
              fontSize: effectFontSize,
              color: '#0a0a0a',
              background: 'rgba(255,255,255,0.35)',
              padding: 6,
              borderRadius: 3,
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.effectText}
          </div>

          {/* ATK/DEF */}
          {isMonster && (
            <div
              className="absolute flex items-end justify-end gap-3"
              style={{
                right: 16,
                bottom: 10,
                fontSize: 14,
                fontWeight: 700,
                color: '#0a0a0a',
                fontFamily: 'Georgia, serif',
              }}
            >
              {!isLink && (
                <>
                  <span>ATK/{String(card.atk).padStart(4, ' ')}</span>
                  <span>DEF/{String(card.def).padStart(4, ' ')}</span>
                </>
              )}
              {isLink && (
                <>
                  <span>ATK/{String(card.atk).padStart(4, ' ')}</span>
                  <span>LINK-{card.level}</span>
                </>
              )}
            </div>
          )}

          <div
            className="absolute"
            style={{
              left: 12,
              bottom: 4,
              fontSize: 8,
              color: 'rgba(0,0,0,0.55)',
            }}
          >
            © Original Card
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        プレビュー: {CARD_W} × {CARD_H} (PNG書き出し時は2倍解像度)
      </p>
    </div>
  );
}
