// カード属性
export const ATTRIBUTES = [
  { value: 'LIGHT', label: '光', color: '#C9A227', symbol: '光' },
  { value: 'DARK', label: '闇', color: '#6B2D8C', symbol: '闇' },
  { value: 'FIRE', label: '炎', color: '#C0392B', symbol: '炎' },
  { value: 'WATER', label: '水', color: '#2E86C1', symbol: '水' },
  { value: 'EARTH', label: '地', color: '#7B6B43', symbol: '地' },
  { value: 'WIND', label: '風', color: '#48A86B', symbol: '風' },
  { value: 'DIVINE', label: '神', color: '#D4AF37', symbol: '神' },
  { value: 'SPELL', label: '魔法', color: '#1F8F6E', symbol: '魔' },
  { value: 'TRAP', label: '罠', color: '#A8367E', symbol: '罠' },
];

// カード種別
export const CARD_TYPES = [
  { value: 'normal', label: '通常モンスター', frame: '#C9A876', isMonster: true },
  { value: 'effect', label: '効果モンスター', frame: '#B85A3E', isMonster: true },
  { value: 'fusion', label: '融合モンスター', frame: '#7B4F9E', isMonster: true },
  { value: 'ritual', label: '儀式モンスター', frame: '#5B7BB5', isMonster: true },
  { value: 'synchro', label: 'シンクロモンスター', frame: '#E8E8E8', isMonster: true, darkText: true },
  { value: 'xyz', label: 'エクシーズモンスター', frame: '#1A1A1A', isMonster: true, isXyz: true },
  { value: 'link', label: 'リンクモンスター', frame: '#1F4E8C', isMonster: true, isLink: true },
  { value: 'spell', label: '魔法カード', frame: '#1F8F6E', isMonster: false },
  { value: 'trap', label: '罠カード', frame: '#A8367E', isMonster: false },
];

// レベル/ランクの最大値
export const MAX_LEVEL = 12;

// デフォルト値
export const DEFAULT_CARD = {
  name: 'ブラック・マジシャン',
  attribute: 'DARK',
  level: 7,
  cardType: 'effect',
  race: '魔法使い族／効果',
  effectText:
    '召喚・特殊召喚に成功した場合、自分は1枚ドローする。このカードが戦闘で相手モンスターを破壊した場合、そのコントローラーに500ダメージを与える。',
  atk: 2500,
  def: 2100,
  imageData: null,
  imageScale: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
};
