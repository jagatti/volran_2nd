import { SONGS } from './songs.js';

// --- GASエンドポイント ---
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbz2gsX2XXdV0OOvHtPF0AsHkTBvrCQ_8_1zYxVQ0bki_CoAlFy25QbsEryqTe-dZJJu/exec";

export const MAX_NAME_LENGTH = 10;

// --- JSONP ---
export function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cbName = "__jsonp_cb_" + Math.random().toString(36).slice(2);
    const sep = url.includes("?") ? "&" : "?";
    const full = `${url}${sep}callback=${encodeURIComponent(cbName)}`;

    let done = false;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("network error"));
    };

    script.src = full;
    document.body.appendChild(script);
  });
}

// --- ランキング取得 ---
export async function fetchTopScores(limit) {
  // 全曲のスコアを取得して集計するため、曲フィルターなしで全件取得する
  const url = `${GAS_ENDPOINT}?action=top`;
  const res = await jsonp(url);
  if (res && res.ok && Array.isArray(res.data)) {
    const songIds = SONGS.map(s => s.id);
    // プレイヤーごとに曲別ベストスコアを収集する
    const playerMap = {};
    for (const r of res.data) {
      const nameStr = String(r.name ?? '');
      const scoreVal = Number(r.score ?? 0);
      for (const songId of songIds) {
        const tag = ` [${songId}]`;
        if (nameStr.endsWith(tag)) {
          const playerName = nameStr.slice(0, -tag.length);
          playerMap[playerName] ??= {};
          if (!playerMap[playerName][songId] || scoreVal > playerMap[playerName][songId]) {
            playerMap[playerName][songId] = scoreVal;
          }
          break;
        }
      }
    }
    // 各プレイヤーの総スコア÷曲数を算出（未プレイ曲はスコア０扱い）
    const numSongs = SONGS.length;
    const aggregated = Object.entries(playerMap).map(([name, songScores]) => {
      const total = songIds.reduce((sum, id) => sum + (songScores[id] || 0), 0);
      return { name, score: Math.floor(total / numSongs) };
    });
    // スコア降順でソートしてlimitを適用
    aggregated.sort((a, b) => b.score - a.score);
    const limited = (typeof limit === 'number') ? aggregated.slice(0, limit) : aggregated;
    res.data = limited.map((r, i) => ({ ...r, rank: i + 1 }));
  }
  return res;
}

// --- スコア送信（songId: 曲ごとに "[songId]" タグを名前に付加して管理） ---
export async function submitScore(name, score, seed, songId) {
  // --- 入力バリデーション ---
  const trimmedName = String(name ?? '').trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmedName) throw new Error('名前が無効です');
  const scoreInt = Math.trunc(Number(score));
  if (!Number.isFinite(scoreInt) || scoreInt < 0 || scoreInt > 99_999_999) {
    throw new Error('スコアが無効です');
  }

  const taggedName = trimmedName + ` [${songId}]`;
  const url =
    `${GAS_ENDPOINT}?action=submit` +
    `&name=${encodeURIComponent(taggedName)}` +
    `&score=${encodeURIComponent(scoreInt)}` +
    `&seed=${encodeURIComponent(seed)}` +
    `&ua=${encodeURIComponent(navigator.userAgent)}`;
  return await jsonp(url);
}

// --- ランキングテーブル描画（rankingModal: ランキングモーダルDOM要素） ---
export function renderRankingTable(rows, rankingModal) {
  const table = rankingModal.querySelector('#rankingTable');

  const headerCell = (text, align = 'left') =>
    `<div style="font-weight:800; opacity:0.95; padding-bottom:6px; border-bottom:1px dashed rgba(255,255,255,0.35); text-align:${align};">
      ${text}
     </div>`;

  const cell = (text, align = 'left') =>
    `<div style="padding-top:6px; text-align:${align}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
      ${text}
     </div>`;

  let html = '';
  html += headerCell('順位');
  html += headerCell('名前');
  html += headerCell('総合スコア', 'right');

  for (const r of rows) {
    const rankText = `${r.rank}位`;
    const nameText = String(r.name ?? '');
    const scoreNum = Number(r.score ?? 0);
    const scoreText = Number.isFinite(scoreNum) ? scoreNum.toLocaleString('ja-JP') : '';

    html += cell(rankText);
    html += cell(escapeHtml_(nameText));
    html += cell(scoreText, 'right');
  }

  table.innerHTML = html;
}

export function escapeHtml_(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
