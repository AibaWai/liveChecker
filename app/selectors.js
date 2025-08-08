// 冗長化した LIVE 検知ロケータ（足りなければ環境変数で追加可）
export const DEFAULT_LIVE_LOCATORS = [
  // プロフィールページのアバター上に出る "LIVE" バッジ（テキスト）
  'text=/^LIVE$/i',
  // LIVE バッジの aria-label
  '[aria-label="Live"]',
  // ストーリーリング上の "LIVE"（一部地域 UI）
  'role=img[name=/live/i]',
  // ストーリートレイに出る LIVE ラベル
  'xpath=//*[contains(translate(., "live", "LIVE"), "LIVE")]'
];

export function loadExtraLocatorsFromEnv() {
  try {
    const raw = process.env.EXTRA_LIVE_LOCATORS?.trim();
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(Boolean);
  } catch {
    return [];
  }
}
