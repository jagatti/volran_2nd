import { SONGS } from './songs.js';
import { fetchTopScores, submitScore, renderRankingTable, escapeHtml_, MAX_NAME_LENGTH, checkNameExists } from './ranking.js';

let selectedSongIdx = 0;
let songSelectCardBounds = [];
let currentSong = SONGS[0];

// --- 必須グローバル変数 ---
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const rotateMsg = document.getElementById('rotateMsg');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.style.position = 'absolute';
pauseBtn.style.right = '12px';
pauseBtn.style.top = '12px';
pauseBtn.style.padding = '0.4em 0.7em';
pauseBtn.style.fontSize = '1.2rem';
pauseBtn.style.backgroundColor = 'rgba(30,41,59,0.8)';
pauseBtn.style.color = 'white';
pauseBtn.style.border = '1px solid rgba(255,255,255,0.18)';
pauseBtn.style.borderRadius = '8px';
pauseBtn.style.cursor = 'pointer';
pauseBtn.style.zIndex = '100';
pauseBtn.style.display = 'none';
let reseedBtn = document.getElementById('reseedBtn');
if (!reseedBtn) {
    reseedBtn = document.createElement('button');
    reseedBtn.id = 'reseedBtn';
    document.body.appendChild(reseedBtn);
}
reseedBtn.textContent = '乱数再現';
reseedBtn.style.position = 'absolute';
// 画面右下に配置
reseedBtn.style.bottom = '20px';
reseedBtn.style.right = '20px';
reseedBtn.style.left = 'auto';
reseedBtn.style.transform = 'none';
reseedBtn.style.padding = '10px 20px';
reseedBtn.style.fontSize = '16px';
reseedBtn.style.backgroundColor = 'green';
reseedBtn.style.color = 'white';
reseedBtn.style.border = 'none';
reseedBtn.style.borderRadius = '5px';
reseedBtn.style.cursor = 'pointer';
reseedBtn.style.display = 'none'; // 最初は非表示

const bgm = document.getElementById('bgm');
const bgimg = document.getElementById('bgimg');
const titleImg = document.getElementById('titleImg');
const jacketImg = document.getElementById('jacketImg');
const titleBgm = document.getElementById('titleBgm');
// --- ユーザー設定 (localStorage永続化) ---
let settingsVolume      = parseFloat(localStorage.getItem('settings_volume')        ?? '0.1');
let settingsNoteSpeed   = parseInt(localStorage.getItem('settings_noteSpeed')       ?? '5', 10);
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
// スマホブラウザ（スタンドアロン=PWAでない）の場合はホーム画面追加メッセージを表示
const isStandalone = window.navigator.standalone === true ||
                     window.matchMedia('(display-mode: standalone)').matches;
if (isMobile && !isStandalone) {
  const rotateMsgSub = document.getElementById('rotateMsgSub');
  if (rotateMsgSub) rotateMsgSub.textContent = 'ホーム画面に追加して起動すると、快適にプレイできます';
}
let settingsTimingOffset= parseFloat(localStorage.getItem('settings_timingOffset')  ?? (isMobile ? '0.3' : '0'));
let settingsSE          = localStorage.getItem('settings_se') !== 'off';
// 値域クランプ
settingsVolume       = Math.max(0, Math.min(1, settingsVolume));
// settingsNoteSpeed は 1-10 スケール (旧30-90値は5にリセット、1未満も同様)
settingsNoteSpeed    = (settingsNoteSpeed < 1 || settingsNoteSpeed > 10) ? 5 : settingsNoteSpeed;
settingsTimingOffset = Math.max(-0.5, Math.min(0.5, settingsTimingOffset));
// 1-10 スケールからフレーム数(30-90)に変換: 速度1→90フレーム(遅い)、速度10→30フレーム(速い)
function speedToFrames(speed) { return Math.round(90 - (speed - 1) * (60 / 9)); }

// --- BGM 音量制御（Web Audio API GainNode、iOS Safari 対応） ---
// GainNode 変数は loadTapSE() 内で接続される
let bgmGain = null;
let titleBgmGain = null;

function applyVolume(vol) {
  if (bgmGain)      bgmGain.gain.value      = vol;
  else              bgm.volume              = vol;
  if (titleBgmGain) titleBgmGain.gain.value = vol;
  else              titleBgm.volume         = vol;
}

bgm.volume = settingsVolume;
titleBgm.volume = settingsVolume;
// Web Audio 未接続時のフォールバック用（接続後は applyVolume で制御）

// --- チュートリアルボタン ---
let tutorialBtn = document.getElementById('tutorialBtn');
if (!tutorialBtn) {
  tutorialBtn = document.createElement('button');
  tutorialBtn.id = 'tutorialBtn';
  tutorialBtn.textContent = 'あそびかた';
  document.body.appendChild(tutorialBtn);
}
tutorialBtn.style.position = 'absolute';
tutorialBtn.style.right = '12px';
tutorialBtn.style.left = 'auto';
tutorialBtn.style.transform = 'none';
tutorialBtn.style.top = 'auto';
tutorialBtn.style.padding = '0.4em 1.1em';
tutorialBtn.style.fontSize = '0.82rem';
tutorialBtn.style.backgroundColor = '#1e293b';
tutorialBtn.style.color = 'white';
tutorialBtn.style.border = '1px solid rgba(255,255,255,0.18)';
tutorialBtn.style.borderRadius = '8px';
tutorialBtn.style.cursor = 'pointer';
tutorialBtn.style.letterSpacing = '0.04em';
tutorialBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
tutorialBtn.style.zIndex = '100';
tutorialBtn.style.display = 'none';

// --- チュートリアルモーダル ---
const TUTORIAL_PAGES = [
  {
    title: '🎵 基本ルール',
    body: `画面に流れてくる「ノーツ」を<br>タイミングよくタップして<br>スコアを稼ごう！<br><br>
           スコアは良い順に<br><b>CRITICAL → WONDERFUL → GREAT → NICE → BAD → MISS</b><br><br>
           コンボが続くほど獲得スコアがアップ！`
  },
  {
    title: '👆 ノーツのタップ',
    body: `ノーツは画面<b>左右</b>のターゲットに向かって流れてくる。<br><br>
           ▶ <b>左ノーツ</b>：画面左半分をタップ<br>
           ▶ <b>右ノーツ</b>：画面右半分をタップ<br><br>
           ターゲットに近いほど高得点！<br><br>
           <b>【PC】</b>　<kbd>Z</kbd>キー = 左　／　<kbd>X</kbd>キー = 右`
  },
  {
    title: '✌️ 同時押し（ペアノーツ）',
    body: `左右に同時に出るノーツは<br><b>2本指で同時タップ</b>すると両方判定！<br><br>
           片方だけ叩くと、MISSになるので注意。<br><br>
           <b>【PC】</b>　<kbd>Z</kbd>＋<kbd>X</kbd>を同時押し`
  },
  {
    title: '⚡ SPゲージ',
    body: `ノーツを叩くとSPゲージが溜まる。<br><br>
           ゲージが<b>MAX</b>になると画面下の半円が光る。<br>その半円を<b>タップ</b>するとSPスキルを発動！<br><br>
           一気に大きなスコアが加算されるぞ！<br><br>
           <b>【PC】</b>　<kbd>Ctrl</kbd>キーで発動`
  },
  {
    title: '🎯 作戦切り替え',
    body: `画面の左右端にある<b>作戦アイコン</b>をタップすると<br>作戦を切り替えられる。<br><br>
           🔴 <b>赤作戦（アタッカー）</b>：スコア重視の特技発動<br>
           🟢 <b>緑作戦（ヒーラー）</b>：スタミナ回復の特技発動<br><br>
           スタミナが減ってきたら緑作戦に切り替えよう！<br><br>
           <b>【PC】</b>　<kbd>Shift</kbd>キーで切り替え`
  },
  {
    title: '🌟 アピールチャンス（AC）',
    body: `曲の特定パートに<b>アピールチャンス（AC）</b>が発生！<br><br>
           ACミッションを達成すると<br>ボーナスとして<b>大量スコア・SPゲージ</b>が獲得できる。<br><br>
           ACは全部で<b>3回</b>。すべてクリアを目指そう！`
  },
  {
    title: '💡 まとめ',
    body: `① ノーツをタイミングよく叩いてコンボをつなげる<br>
           ② SPゲージが溜まったらすかさず発動！<br>
           ③ スタミナに気をつけて作戦を切り替える<br>
           ④ ACミッションを全クリアしてハイスコアを狙え！<br><br>
           <b>さあ、ランキング上位を目指してみよう！</b>`
  }
];
let tutorialPage = 0;

let tutorialModal = document.getElementById('tutorialModal');
if (!tutorialModal) {
  tutorialModal = document.createElement('div');
  tutorialModal.id = 'tutorialModal';
  tutorialModal.style.position = 'fixed';
  tutorialModal.style.left = '50%';
  tutorialModal.style.top = '50%';
  tutorialModal.style.transform = 'translate(-50%, -50%)';
  tutorialModal.style.width = 'min(420px, 92vw)';
  tutorialModal.style.background = 'rgba(10,14,28,0.97)';
  tutorialModal.style.color = '#fff';
  tutorialModal.style.border = '1px solid rgba(255,255,255,0.22)';
  tutorialModal.style.borderRadius = '14px';
  tutorialModal.style.padding = '14px 16px 12px';
  tutorialModal.style.maxHeight = 'min(88vh, 400px)';
  tutorialModal.style.flexDirection = 'column';
  tutorialModal.style.zIndex = '9999';
  tutorialModal.style.display = 'none';
  tutorialModal.style.boxShadow = '0 8px 40px rgba(0,0,0,0.75)';
  document.body.appendChild(tutorialModal);
}

function renderTutorialPage() {
  const p = TUTORIAL_PAGES[tutorialPage];
  const total = TUTORIAL_PAGES.length;
  tutorialModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0;">
      <div style="font-weight:800;font-size:14px;letter-spacing:0.04em;">${p.title}</div>
      <button id="tutorialCloseBtn"
        style="padding:3px 9px;background:#1e293b;color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.85rem;">
        ✕
      </button>
    </div>
    <div style="font-size:12.5px;line-height:1.65;overflow-y:auto;flex:1;min-height:0;max-height:220px;padding-right:2px;">${p.body}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;flex-shrink:0;">
      <button id="tutorialPrevBtn"
        style="padding:5px 14px;background:#1e293b;color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.82rem;${tutorialPage === 0 ? 'opacity:0.3;pointer-events:none;' : ''}">
        ◀ 前へ
      </button>
      <span style="font-size:11px;opacity:0.6;">${tutorialPage + 1} / ${total}</span>
      <button id="tutorialNextBtn"
        style="padding:5px 14px;background:${tutorialPage === total - 1 ? '#6366f1' : '#1e293b'};color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.82rem;">
        ${tutorialPage === total - 1 ? 'とじる ▶' : '次へ ▶'}
      </button>
    </div>
  `;
  tutorialModal.style.display = 'flex';
  tutorialModal.querySelector('#tutorialCloseBtn').onclick = () => {
    tutorialModal.style.display = 'none';
  };
  tutorialModal.querySelector('#tutorialPrevBtn').onclick = () => {
    if (tutorialPage > 0) { tutorialPage--; renderTutorialPage(); }
  };
  tutorialModal.querySelector('#tutorialNextBtn').onclick = () => {
    if (tutorialPage < total - 1) { tutorialPage++; renderTutorialPage(); }
    else { tutorialModal.style.display = 'none'; }
  };
}

tutorialBtn.onclick = () => {
  tutorialPage = 0;
  renderTutorialPage();
};

// --- ランキングボタン ---
let rankingBtn = document.getElementById('rankingBtn');
if (!rankingBtn) {
  rankingBtn = document.createElement('button');
  rankingBtn.id = 'rankingBtn';
  rankingBtn.textContent = 'ランキング';
  document.body.appendChild(rankingBtn);
}
rankingBtn.style.position = 'absolute';
rankingBtn.style.right = '12px';
rankingBtn.style.left = 'auto';
rankingBtn.style.transform = 'none';
rankingBtn.style.top = 'auto';
rankingBtn.style.padding = '0.4em 1.1em';
rankingBtn.style.fontSize = '0.82rem';
rankingBtn.style.backgroundColor = '#1e293b';
rankingBtn.style.color = 'white';
rankingBtn.style.border = '1px solid rgba(255,255,255,0.18)';
rankingBtn.style.borderRadius = '8px';
rankingBtn.style.cursor = 'pointer';
rankingBtn.style.letterSpacing = '0.04em';
rankingBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
rankingBtn.style.zIndex = '100';
rankingBtn.style.display = 'none';

// --- ランキングモーダル ---
let rankingModal = document.getElementById('rankingModal');
if (!rankingModal) {
  rankingModal = document.createElement('div');
  rankingModal.id = 'rankingModal';
  rankingModal.style.position = 'fixed';
  rankingModal.style.left = '50%';
  rankingModal.style.top = '50%';
  rankingModal.style.transform = 'translate(-50%, -50%)';
  rankingModal.style.width = 'min(420px, 94vw)';
  rankingModal.style.maxHeight = '80vh';
  rankingModal.style.background = 'rgba(10,14,28,0.97)';
  rankingModal.style.color = '#fff';
  rankingModal.style.border = '1px solid rgba(255,255,255,0.22)';
  rankingModal.style.borderRadius = '14px';
  rankingModal.style.padding = '16px 18px 14px';
  rankingModal.style.zIndex = '9999';
  rankingModal.style.display = 'none';
  rankingModal.style.boxShadow = '0 8px 40px rgba(0,0,0,0.75)';
  rankingModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div id="rankingTitle" style="font-weight:800;font-size:14px;letter-spacing:0.04em;">🏆 全体ランキング</div>
      <button id="rankingCloseBtn"
        style="padding:3px 9px;background:#1e293b;color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.85rem;">
        ✕
      </button>
    </div>
    <div id="rankingScroll" style="overflow-y:auto;max-height:calc(80vh - 80px);">
      <div id="rankingTable" style="display:grid;grid-template-columns:3em 1fr auto;gap:0 12px;font-size:13px;"></div>
    </div>
  `;
  document.body.appendChild(rankingModal);
  rankingModal.querySelector('#rankingCloseBtn').onclick = () => {
    rankingModal.style.display = 'none';
  };
}

rankingBtn.onclick = async () => {
  // Loading表示（画面左下）
  let loadingEl = document.getElementById('rankingLoadingOverlay');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'rankingLoadingOverlay';
    loadingEl.style.cssText = 'position:fixed;left:20px;bottom:24px;z-index:9999;color:#fff;font-size:1.1rem;font-weight:bold;font-family:system-ui,sans-serif;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,0.8);';
    document.body.appendChild(loadingEl);
  }
  let dots = 1;
  loadingEl.textContent = '接続中.';
  loadingEl.style.display = 'block';
  const loadingInterval = setInterval(() => {
    dots = (dots % 3) + 1;
    loadingEl.textContent = 'Loading' + '.'.repeat(dots);
  }, 400);
  try {
    const res = await fetchTopScores();
    clearInterval(loadingInterval);
    loadingEl.style.display = 'none';
    if (!res.ok) throw new Error(res.error || 'unknown');

    const rows = (res.data && res.data.length) ? res.data : [];
    renderRankingTable(rows, rankingModal);

    const titleEl = rankingModal.querySelector('#rankingTitle');
    if (titleEl) titleEl.textContent = '全体ランキング　　4/1 18:00 ～ 4/5 23:59（予定）';
    rankingModal.style.display = 'block';
    const sc = rankingModal.querySelector('#rankingScroll');
    if (sc) sc.scrollTop = 0;
  } catch (e) {
    clearInterval(loadingInterval);
    if (loadingEl) loadingEl.style.display = 'none';
    alert('ランキング取得に失敗しました: ' + e.message);
  }
};

// --- クレジットボタン ---
let creditsBtn = document.getElementById('creditsBtn');
if (!creditsBtn) {
  creditsBtn = document.createElement('button');
  creditsBtn.id = 'creditsBtn';
  creditsBtn.textContent = 'クレジット';
  document.body.appendChild(creditsBtn);
}
creditsBtn.style.position = 'absolute';
creditsBtn.style.right = '12px';
creditsBtn.style.left = 'auto';
creditsBtn.style.transform = 'none';
creditsBtn.style.top = 'auto';
creditsBtn.style.padding = '0.4em 1.1em';
creditsBtn.style.fontSize = '0.82rem';
creditsBtn.style.backgroundColor = '#1e293b';
creditsBtn.style.color = 'white';
creditsBtn.style.border = '1px solid rgba(255,255,255,0.18)';
creditsBtn.style.borderRadius = '8px';
creditsBtn.style.cursor = 'pointer';
creditsBtn.style.letterSpacing = '0.04em';
creditsBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
creditsBtn.style.zIndex = '100';
creditsBtn.style.display = 'none';

// --- クレジットモーダル ---
let creditsModal = document.getElementById('creditsModal');
if (!creditsModal) {
  creditsModal = document.createElement('div');
  creditsModal.id = 'creditsModal';
  creditsModal.style.position = 'fixed';
  creditsModal.style.left = '50%';
  creditsModal.style.top = '50%';
  creditsModal.style.transform = 'translate(-50%, -50%)';
  creditsModal.style.width = 'min(380px, 92vw)';
  creditsModal.style.background = 'rgba(10,14,28,0.97)';
  creditsModal.style.color = '#fff';
  creditsModal.style.border = '1px solid rgba(255,255,255,0.22)';
  creditsModal.style.borderRadius = '14px';
  creditsModal.style.padding = '16px 18px 14px';
  creditsModal.style.zIndex = '9999';
  creditsModal.style.display = 'none';
  creditsModal.style.boxShadow = '0 8px 40px rgba(0,0,0,0.75)';
  creditsModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="font-weight:800;font-size:14px;letter-spacing:0.04em;">🎵 クレジット</div>
      <button id="creditsCloseBtn"
        style="padding:3px 9px;background:#1e293b;color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.85rem;">
        ✕
      </button>
    </div>
    <div style="font-size:12.5px;line-height:1.8;">
      <div style="margin-bottom:10px;">
        <b style="color:#a5b4fc;">タイトル楽曲</b><br>
        目指せ！KIRAKIRAアイドル！<br>
        <span style="opacity:0.75;">- DOVA-SYNDROME</span>
      </div>
      <div>
        <b style="color:#a5b4fc;">使用楽曲</b><br>
        シャイニングスター<br>
        <span style="opacity:0.75;">- 魔王魂</span><br>
        ときめき☆ラビリンス<br>
        <span style="opacity:0.75;">- 魔王魂</span><br>
        betrayal<br>
        <span style="opacity:0.75;">- kuku(@1266166susu)</span>
      </div>
    </div>
  `;
  document.body.appendChild(creditsModal);
  creditsModal.querySelector('#creditsCloseBtn').onclick = () => {
    creditsModal.style.display = 'none';
  };
}

creditsBtn.onclick = () => {
  creditsModal.style.display = 'block';
};

// --- 設定ボタン ---
let settingsBtn = document.getElementById('settingsBtn');
if (!settingsBtn) {
  settingsBtn = document.createElement('button');
  settingsBtn.id = 'settingsBtn';
  settingsBtn.textContent = '⚙';
  document.body.appendChild(settingsBtn);
}
settingsBtn.style.position = 'absolute';
settingsBtn.style.right = '12px';
settingsBtn.style.left = 'auto';
settingsBtn.style.transform = 'none';
settingsBtn.style.top = '12px';
settingsBtn.style.padding = '0.4em 0.7em';
settingsBtn.style.fontSize = '1.1rem';
settingsBtn.style.backgroundColor = '#1e293b';
settingsBtn.style.color = 'white';
settingsBtn.style.border = '1px solid rgba(255,255,255,0.18)';
settingsBtn.style.borderRadius = '8px';
settingsBtn.style.cursor = 'pointer';
settingsBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
settingsBtn.style.zIndex = '100';
settingsBtn.style.display = 'none';

// --- 設定モーダル ---
let settingsModal = document.getElementById('settingsModal');
if (!settingsModal) {
  settingsModal = document.createElement('div');
  settingsModal.id = 'settingsModal';
  settingsModal.style.position = 'fixed';
  settingsModal.style.left = '50%';
  settingsModal.style.top = '50%';
  settingsModal.style.transform = 'translate(-50%, -50%)';
  settingsModal.style.width = 'min(360px, 92vw)';
  settingsModal.style.background = 'rgba(10,14,28,0.97)';
  settingsModal.style.color = '#fff';
  settingsModal.style.border = '1px solid rgba(255,255,255,0.22)';
  settingsModal.style.borderRadius = '14px';
  settingsModal.style.padding = '16px 18px 14px';
  settingsModal.style.zIndex = '9999';
  settingsModal.style.display = 'none';
  settingsModal.style.boxShadow = '0 8px 40px rgba(0,0,0,0.75)';
  settingsModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-weight:800;font-size:14px;letter-spacing:0.04em;">⚙ 設定</div>
      <button id="settingsCloseBtn"
        style="padding:3px 9px;background:#1e293b;color:#fff;border:1px solid rgba(255,255,255,0.22);border-radius:7px;cursor:pointer;font-size:0.85rem;">
        ✕
      </button>
    </div>
    <div style="font-size:13px;display:flex;flex-direction:column;gap:12px;">
      <label style="display:flex;flex-direction:column;gap:4px;">
        <span>音量: <span id="settingsVolumeVal">${Math.round(settingsVolume * 100)}</span>%</span>
        <input id="settingsVolumeRange" type="range" min="0" max="100" value="${Math.round(settingsVolume * 100)}"
          style="width:100%;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <span>ノーツ速度: <span id="settingsSpeedVal">${settingsNoteSpeed}</span> / 10</span>
        <input id="settingsSpeedRange" type="range" min="1" max="10" step="1" value="${settingsNoteSpeed}"
          style="width:100%;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;">
        <span>タイミング調整: <span id="settingsTimingVal">${settingsTimingOffset.toFixed(2)}</span>秒</span>
        <input id="settingsTimingRange" type="range" min="-50" max="50" value="${Math.round(settingsTimingOffset * 100)}"
          style="width:100%;">
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input id="settingsSECheck" type="checkbox" ${settingsSE ? 'checked' : ''}
          style="width:16px;height:16px;cursor:pointer;">
        <span>タップ音 ON/OFF</span>
      </label>
    </div>
  `;
  document.body.appendChild(settingsModal);
  settingsModal.querySelector('#settingsCloseBtn').onclick = () => {
    settingsModal.style.display = 'none';
  };
  settingsModal.querySelector('#settingsVolumeRange').oninput = (e) => {
    settingsVolume = parseInt(e.target.value, 10) / 100;
    settingsVolume = Math.max(0, Math.min(1, settingsVolume));
    localStorage.setItem('settings_volume', settingsVolume);
    applyVolume(settingsVolume);
    settingsModal.querySelector('#settingsVolumeVal').textContent = e.target.value;
  };
  settingsModal.querySelector('#settingsSpeedRange').oninput = (e) => {
    settingsNoteSpeed = parseInt(e.target.value, 10);
    settingsNoteSpeed = Math.max(1, Math.min(10, settingsNoteSpeed));
    localStorage.setItem('settings_noteSpeed', settingsNoteSpeed);
    noteDuration = speedToFrames(settingsNoteSpeed);
    noteTravelSec = noteDuration / 60;
    settingsModal.querySelector('#settingsSpeedVal').textContent = settingsNoteSpeed;
  };
  settingsModal.querySelector('#settingsTimingRange').oninput = (e) => {
    settingsTimingOffset = parseInt(e.target.value, 10) / 100;
    settingsTimingOffset = Math.max(-0.5, Math.min(0.5, settingsTimingOffset));
    localStorage.setItem('settings_timingOffset', settingsTimingOffset);
    settingsModal.querySelector('#settingsTimingVal').textContent = settingsTimingOffset.toFixed(2);
  };
  settingsModal.querySelector('#settingsSECheck').onchange = (e) => {
    settingsSE = e.target.checked;
    localStorage.setItem('settings_se', settingsSE ? 'on' : 'off');
  };
}

settingsBtn.onclick = () => {
  const currentPlayerName = localStorage.getItem('player_name') || '';
  let nameChangeHtml = '';
  if (currentPlayerName) {
    nameChangeHtml = `
      <div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px;margin-top:4px;">
        <span style="font-size:13px;font-weight:700;">👤 プレイヤー名の変更</span>
        <input id="settingsNameInput" type="text" maxlength="10" value="${escapeHtml_(currentPlayerName)}"
          style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:#0f172a;color:#fff;font-size:16px;box-sizing:border-box;">
        <span id="settingsNameError" style="font-size:12px;color:#f87171;display:none;min-height:16px;">既に使用されています。</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="settingsNameSaveBtn"
            style="padding:8px 20px;background:#6366f1;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:14px;">変更</button>
          <span id="settingsNameMsg" style="font-size:12px;color:#86efac;display:none;">保存しました</span>
        </div>
      </div>`;
  }
  const settingsBody = settingsModal.querySelector('div[style*="flex-direction:column;gap:12px"]');
  if (settingsBody) {
    const existing = settingsModal.querySelector('#settingsNameSection');
    if (existing) existing.remove();
    if (currentPlayerName) {
      const section = document.createElement('div');
      section.id = 'settingsNameSection';
      section.innerHTML = nameChangeHtml;
      settingsBody.appendChild(section);
      const saveBtn = section.querySelector('#settingsNameSaveBtn');
      const nameInput = section.querySelector('#settingsNameInput');
      const nameMsg = section.querySelector('#settingsNameMsg');
      const nameErrorEl = section.querySelector('#settingsNameError');
      saveBtn.onclick = async () => {
        const newName = nameInput.value.trim().slice(0, MAX_NAME_LENGTH);
        if (!newName) return;
        nameErrorEl.style.display = 'none';
        nameMsg.style.display = 'none';
        if (newName !== currentPlayerName) {
          saveBtn.disabled = true;
          let taken = false;
          try {
            taken = await checkNameExists(newName);
          } catch (_) {
            // ネットワークエラー時はチェックをスキップ
          }
          saveBtn.disabled = false;
          if (taken) {
            nameErrorEl.style.display = 'inline';
            return;
          }
        }
        localStorage.setItem('player_name', newName);
        nameMsg.style.display = 'inline';
        setTimeout(() => { nameMsg.style.display = 'none'; }, 1000);
      };
    }
  }
  settingsModal.style.display = 'block';
};

// --- プレイヤー名入力モーダル ---
let playerNameModal = document.getElementById('playerNameModal');
if (!playerNameModal) {
  playerNameModal = document.createElement('div');
  playerNameModal.id = 'playerNameModal';
  playerNameModal.style.position = 'fixed';
  playerNameModal.style.left = '50%';
  playerNameModal.style.top = '50%';
  playerNameModal.style.transform = 'translate(-50%, -50%)';
  playerNameModal.style.width = 'min(360px, 92vw)';
  playerNameModal.style.background = 'rgba(10,14,28,0.97)';
  playerNameModal.style.color = '#fff';
  playerNameModal.style.border = '1px solid rgba(255,255,255,0.22)';
  playerNameModal.style.borderRadius = '14px';
  playerNameModal.style.padding = '20px 20px 16px';
  playerNameModal.style.zIndex = '9999';
  playerNameModal.style.display = 'none';
  playerNameModal.style.boxShadow = '0 8px 40px rgba(0,0,0,0.75)';
  playerNameModal.innerHTML = `
    <div style="font-weight:800;font-size:15px;letter-spacing:0.04em;margin-bottom:12px;">👤 プレイヤー名を入力</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,0.7);margin-bottom:12px;">ランキングに使用する名前を入力してください（10文字以内）</div>
    <input type="text" id="playerNameInput" maxlength="10"
      style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:#0f172a;color:#fff;font-size:16px;box-sizing:border-box;">
    <div id="playerNameError" style="font-size:12px;color:#f87171;margin-top:6px;min-height:18px;"></div>
    <div style="margin-top:12px;text-align:right;">
      <button id="playerNameSubmitBtn"
        style="padding:8px 20px;background:#6366f1;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:14px;">決定</button>
    </div>
  `;
  document.body.appendChild(playerNameModal);
}

function showPlayerNameModal(onSuccess) {
  playerNameModal.style.display = 'block';
  const input = playerNameModal.querySelector('#playerNameInput');
  const errorEl = playerNameModal.querySelector('#playerNameError');
  const submitBtn = playerNameModal.querySelector('#playerNameSubmitBtn');
  input.value = '';
  errorEl.textContent = '';
  input.focus();
  const handleSubmit = async () => {
    const name = input.value.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) {
      errorEl.textContent = '名前を入力してください';
      return;
    }
    submitBtn.disabled = true;
    errorEl.textContent = '';
    let taken = false;
    try {
      taken = await checkNameExists(name);
    } catch (_) {
      // ネットワークエラー時はチェックをスキップ
    }
    submitBtn.disabled = false;
    if (taken) {
      errorEl.textContent = '既に使用されています';
      return;
    }
    localStorage.setItem('player_name', name);
    playerNameModal.style.display = 'none';
    onSuccess();
  };
  submitBtn.onclick = handleSubmit;
  input.onkeydown = (e) => { if (e.key === 'Enter') handleSubmit(); };
}

// --- 乱数生成器 ---
let _seed = 0;
function setSeed(s) {
  _seed = s;
}
function seededRandom() {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
}
let lastGameSeed = 0; // 直前のゲームのシードを保存


// --- グローバル変数 ---
let chartIndex = 0, R=30, leftTarget={x:0,y:0,r:0}, rightTarget={x:0,y:0,r:0}, spRadius=80;
let SP_MAX=6000, spValue=0, spFullNotified=false, score=0, combo=0, notes=[], frame=0, noteDuration=speedToFrames(settingsNoteSpeed);
let bestScore = Number(localStorage.getItem('bestScore_' + currentSong.id)) || 0;
let spFlashTimer=0, spRingTimer=0, spRingSpeed=20, spRingRange=40, spBoostTimer=0, spCountdownTimer=0, spCountdownValue=0;
let popups=[], hitRings=[], particles=[], lastInputWasTouch=false;
let gameState = "init", countdownValue = 3, countdownSecsAccum = 60, totalNotesSpawned = 0, clearStartFrame = null, resultStartFrame = null;
let skillHistory = [], appealBoostNotes = 0, skillActivationCount = 0, spUseCount = 0, progressDisplay = 0;
let judgeCount = {CRITICAL:0,WONDERFUL:0,GREAT:0,NICE:0,BAD:0,MISS:0};
let spScoreBuffNotes = 0, noteCounter = 0, totalSPUsed = 0, permanentScoreBuff = 0, acFailFlashTimer = 0, waitingClearFrame = null;
let audioContext, tapBuffer = null;

// --- スタミナシステム ---
const STAMINA_MAX = 100000;
let stamina = STAMINA_MAX;
let damageReduceNotes = 0;
let skillRateBoostNotes = 0;

// --- 作戦切り替えシステム ---
let currentStrategy = "red";
let strategyChangeCooldown = 0;
const STRATEGY_CHANGE_NOTES = 5;
let notesProcessedSinceSwitch = 0;
let strategyBadgeOffsetX = 0; // バッジスライドアニメーション用（0=定位置、負=画面外左）

// --- ポーズ状態管理 ---
let isPaused = false;
let pauseResumeBtnBounds = null;
let pauseTitleBtnBounds = null;

// --- 曲選択画面「戻る」ボタン境界 ---
let songSelectBackBtnBounds = null;
  
// ノーツ到達までの秒数（デフォルト55フレーム固定：AC判定・進捗バーの基準）
const DEFAULT_NOTE_TRAVEL_SEC = 55 / 60;
// 現在のノーツ速度によるビジュアル到達時間（スポーン補正のみに使用）
let noteTravelSec = noteDuration / 60;

// --- BGM精密タイミング同期（モバイル対応）---
// bgm.currentTimeはモバイルでは更新頻度が低く誤差が出るため、
// audioContext.currentTimeをベースに精密な再生位置を計算する
let bgmSyncPoint = null; // { audioCtxTime, bgmOffset }

function getAccurateBgmTime() {
  if (bgmSyncPoint && audioContext) {
    const elapsed = audioContext.currentTime - bgmSyncPoint.audioCtxTime;
    // outputLatency/baseLatencyで出力遅延を補正（モバイルは大きい）
    const latency = (audioContext.outputLatency || 0) + (audioContext.baseLatency || 0);
    return Math.max(0, bgmSyncPoint.bgmOffset + elapsed - latency);
  }
  return bgm.currentTime || 0;
}
  
// --- 効果音ロード ---
async function loadTapSE() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // bgm / titleBgm を GainNode 経由でルーティング（iOS Safari 音量対応）
    try {
      const bs = audioContext.createMediaElementSource(bgm);
      bgmGain = audioContext.createGain();
      bgmGain.gain.value = settingsVolume;
      bs.connect(bgmGain);
      bgmGain.connect(audioContext.destination);
      const ts = audioContext.createMediaElementSource(titleBgm);
      titleBgmGain = audioContext.createGain();
      titleBgmGain.gain.value = settingsVolume;
      ts.connect(titleBgmGain);
      titleBgmGain.connect(audioContext.destination);
    } catch(e) {
      console.warn('Web Audio BGM routing failed:', e);
    }
  }
  await audioContext.resume();
  if (!tapBuffer) {
    const response = await fetch('tap.wav');
    const arrayBuffer = await response.arrayBuffer();
    tapBuffer = await audioContext.decodeAudioData(arrayBuffer);
  }
}

//
function findClosestNoteIndex(time) {
  let minDiff = Infinity;
  let idx = -1;
  for (let i = 0; i < currentSong.notesChart.length; i++) {
    const diff = Math.abs(currentSong.notesChart[i].time - time);
    if (diff < minDiff) {
      minDiff = diff;
      idx = i;
    }
  }
  return idx;
}
  
// --- assignACNoteIndexes ---
function assignACNoteIndexes() {
  for (const ac of currentSong.acList) {
    // 開始ノーツidx: startTime以上で最初
    ac.startIdx = currentSong.notesChart.findIndex(n => n.time >= ac.startTime);
    // 終了ノーツidx: endTime以下で最後
    let lastIdx = -1;
    for (let i = 0; i < currentSong.notesChart.length; i++) {
      if (currentSong.notesChart[i].time <= ac.endTime) lastIdx = i;
    }
    ac.endIdx = lastIdx;
  }
}
  
// --- コンボボーナス倍率計算 ---
function getComboBonus(combo) {
  if (combo >= 71) return 1.04;
  if (combo >= 51) return 1.03;
  if (combo >= 31) return 1.02;
  if (combo >= 11) return 1.01;
  return 1.0;
}

// --- スタミナ関連関数 ---
function getNoteDamage() { return 200; }

function getStaminaScoreMult() {
  const ratio = stamina / STAMINA_MAX;
  if (ratio >= 0.70) return 1.0;
  if (ratio >= 0.30) return 0.8;
  if (ratio > 0)     return 0.6;
  return 0.0;
}

function applyACFailDamage() {
  stamina = Math.max(0, stamina - 25000);
}

function applyNoteDamage(nowTime) {
  if (isACClearedNowByTime(nowTime)) return;
  let damage = getNoteDamage();
  if (isACActiveByTime(nowTime)) damage = Math.floor(damage * 1.1);
  if (damageReduceNotes > 0) {
    damage = Math.floor(damage * 0.5);
    damageReduceNotes--;
  }
  stamina = Math.max(0, stamina - damage);
}

// 効果音再生
function playTapSE() {
  if (!tapBuffer || !settingsSE) return;
  const source = audioContext.createBufferSource();
  source.buffer = tapBuffer;
  source.connect(audioContext.destination);
  source.start(0);
}
  
// --- AC（アピールチャンス）関連（進捗保存のため追加） ---
  currentSong.acList.forEach(ac => {
    ac.tapScore = 0; // タップで得たスコア
    ac.spScore = 0;  // SP発動で得たスコア
  });
  
// --- AC取得関数 ---
function getActiveACByTime(nowTime) {
  return currentSong.acList.find(ac =>
    (ac.state === "active" || (ac.state === "cleared" && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset))
    && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset
  );
}
function isACActiveByTime(nowTime) {
  return !!getActiveACByTime(nowTime);
}
function isACClearedNowByTime(nowTime) {
  return !!currentSong.acList.find(ac =>
    ac.state === "cleared" && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset
  );
}
  
// --- レイアウト・ターゲット位置 ---
function resizeCanvas(){
  const landscape = window.innerWidth >= window.innerHeight;
  if(!landscape){
    rotateMsg.style.display='flex';
    cvs.style.display='none';
    startBtn.style.display='none';
    retryBtn.style.display='none';
    reseedBtn.style.display='none';
    rankingBtn.style.display = 'none';
    tutorialBtn.style.display = 'none';
    creditsBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    settingsBtn.style.display = 'none';
    return;
  }
  rotateMsg.style.display='none';
  cvs.style.display='block';
  // ランキングボタンはタイトル画面のみ表示（曲選択画面では非表示）
  rankingBtn.style.display = (gameState === "init") ? 'block' : 'none';
  tutorialBtn.style.display = (gameState === "init") ? 'block' : 'none';
  creditsBtn.style.display = (gameState === "init") ? 'block' : 'none';
  pauseBtn.style.display = (gameState === 'playing') ? 'block' : 'none';
  // 設定ボタンはタイトル画面のみ表示
  settingsBtn.style.display = (gameState === "init") ? 'block' : 'none';
  startBtn.style.display = (gameState === "init" || gameState === "songSelect") ? 'block' : 'none';
  startBtn.textContent = gameState === "songSelect" ? 'PLAY' : 'S.T.A.R.T!!';
  if(gameState==="result") {
    retryBtn.style.display='block';
    reseedBtn.style.display='block';
  } else {
    retryBtn.style.display='none';
    reseedBtn.style.display='none';
  }
  cvs.width = window.innerWidth;
  cvs.height= window.innerHeight;
  const minDim=Math.min(cvs.width, cvs.height);
  R = Math.max(18, Math.round(minDim*0.04));
  const laneGap = R*4.5;
  const targetY = Math.round(cvs.height*0.7);
  leftTarget  ={x: Math.round(cvs.width/2 - laneGap), y: targetY, r: R};
  rightTarget ={x: Math.round(cvs.width/2 + laneGap), y: targetY, r: R};
  spRadius = Math.max(64, Math.round(minDim*0.12));

  // --- ボタン位置の動的設定 ---
  if (gameState === "init") {
    // タイトル画面: S.T.A.R.T!! ボタンを中央より下に配置
    const startBtnTop = Math.round(cvs.height * 0.67);
    startBtn.style.top = startBtnTop + 'px';
    startBtn.style.left = '50%';
    startBtn.style.transform = 'translateX(-50%)';
    // ランキング・あそびかた・クレジットは右下に縦並び
    const btnH = 34; // ボタンの高さ概算
    const btnGapV = 8; // ボタン間の縦間隔
    const bottomBase = 12;
    creditsBtn.style.bottom = bottomBase + 'px';
    creditsBtn.style.top = 'auto';
    tutorialBtn.style.bottom = (bottomBase + btnH + btnGapV) + 'px';
    tutorialBtn.style.top = 'auto';
    rankingBtn.style.bottom = (bottomBase + (btnH + btnGapV) * 2) + 'px';
    rankingBtn.style.top = 'auto';
  } else if (gameState === "songSelect") {
    // 曲選択画面: PLAYボタンを画面下部に小さく配置
    startBtn.style.top = Math.round(cvs.height * 0.86) + 'px';
    startBtn.style.left = '50%';
    startBtn.style.transform = 'translateX(-50%)';
  }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function cubicBezier(p0,p1,p2,p3,t){const u=1-t;return {x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};}
// ノーツの現在座標を返す。目標フレーム通過後は接線方向(3*(p3-p2))に線形外挿して
// ノーツが判定〇を通り過ぎて流れていくビジュアルを実現する。
function getNotePos(n){
  if(n.t<=n.duration) return cubicBezier(n.path.p0,n.path.p1,n.path.p2,n.path.p3,n.t/n.duration);
  const p2=n.path.p2, p3=n.path.p3, ov=n.t-n.duration;
  return {x:p3.x+3*(p3.x-p2.x)*ov/n.duration, y:p3.y+3*(p3.y-p2.y)*ov/n.duration};
}
// MISS閾値(18f)に基づくフェードアウト係数 (通過前=1, 通過直後=1→0, 閾値=0)
const MISS_WINDOW = 18;
function noteMissAlpha(n){
  if(n.t<=n.duration) return 1;
  return Math.max(0, 1 - (n.t - n.duration) / MISS_WINDOW);
}
// ノーツの理想タップBGM時刻（秒）を返す。
// settingsTimingOffset（ユーザーのタイミング調整）を加算することで、
// ノーツのスポーン時刻・自動MISS・判定窓がすべて同じオフセット量だけシフトし、
// タイミング調整の変更が判定に正しく反映される。
function noteTargetBgmTime(n) {
  return currentSong.notesChart[n.chartIdx].time + settingsTimingOffset;
}
function makePath(side){const target= side==='left'? leftTarget : rightTarget;const startX = side==='left' ? (-R*2-10) : (cvs.width+R*2+10);const start={x:startX, y: target.y - Math.max(180, R*6)};const c1={x: side==='left' ? target.x - Math.max(200,R*6) : target.x + Math.max(200,R*6), y: target.y - Math.max(200,R*6)};const c2={x: side==='left' ? target.x - Math.max(60,R*2)  : target.x + Math.max(60,R*2),  y: target.y - Math.max(40,R*1.3)};const end={x: target.x, y: target.y};return {p0:start,p1:c1,p2:c2,p3:end};}
// --- spawnNoteにchartIdxを持たせる ---
function spawnNote(side, chartIdx){
  notes.push({
    side,
    t:0,
    duration:noteDuration,
    path:makePath(side),
    chartIdx: chartIdx // どの譜面ノーツか記憶
  });
}
function addPopup(text,x,y,ms,type){const d=Math.max(1,Math.round(ms/16.67));popups.push({text,x,y,timer:d,duration:d,type});}
function triggerSPVisual(){ spFlashTimer=10; spRingTimer=spRingSpeed; }
  
// --- AC進行チェック（nowTimeで判定） ---
function updateACOnTap(pointsWithCombo, nowTime) {
  noteCounter++;
  currentSong.acList.forEach(ac => {
    
    if (ac.state === "active" && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset) {
      if (ac.type === "score") {
        ac.tapScore += pointsWithCombo;
        ac.progress = ac.tapScore + ac.spScore;
      }
      // --- AC成功時バフ抽選 ---
      if (!ac.cleared && ac.progress >= ac.target) {
        ac.cleared = true;
        ac.state = "cleared";
        score += ac.rewardScore;
        spValue = Math.min(SP_MAX, spValue + ac.rewardSP);
        skillHistory.unshift({text: `ACクリア報酬 ${ac.rewardScore}`, life:180});
        if(skillHistory.length>5) skillHistory.pop();
        if(seededRandom() < 0.3){
          permanentScoreBuff++;
          skillHistory.unshift({text:"[アピール増加永続 5%]", life:180});
          if(skillHistory.length>5) skillHistory.pop();
        }
      }
    }
    // ※ AC失敗判定は updateACOnTime（時間ベース・毎フレーム）に一元化
  });
}

function updateACOnSPUse(nowTime, spScore) {
  totalSPUsed++;
  currentSong.acList.forEach(ac => {
    if (ac.state === "active" && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset) {
      if (ac.type === "sp") {
        ac.progress += 1;
        if (!ac.cleared && ac.progress >= ac.target) {
          ac.cleared = true;
          ac.state = "cleared";
          score += ac.rewardScore;
          spValue = Math.min(SP_MAX, spValue + ac.rewardSP);
          skillHistory.unshift({text: `ACクリア報酬 ${ac.rewardScore}`, life:180});
          if(skillHistory.length>5) skillHistory.pop();
        }
      }
      if (ac.type === "score") {
        ac.spScore += spScore;
        ac.progress = ac.tapScore + ac.spScore;
        if (!ac.cleared && ac.progress >= ac.target) {
          ac.cleared = true;
          ac.state = "cleared";
          score += ac.rewardScore;
          spValue = Math.min(SP_MAX, spValue + ac.rewardSP);
          skillHistory.unshift({text: `ACクリア報酬 ${ac.rewardScore}`, life:180});
          if(skillHistory.length>5) skillHistory.pop();
        }
      }
    }
  });
}

// --- AC進行チェック：作戦切り替え時 ---
function updateACOnStrategyChange(nowTime) {
  currentSong.acList.forEach(ac => {
    if (ac.state === "active" && nowTime >= ac.startTime + settingsTimingOffset && nowTime <= ac.endTime + settingsTimingOffset) {
      if (ac.type === "strategy") {
        ac.progress += 1;
        if (!ac.cleared && ac.progress >= ac.target) {
          ac.cleared = true;
          ac.state = "cleared";
          score += ac.rewardScore;
          spValue = Math.min(SP_MAX, spValue + ac.rewardSP);
          skillHistory.unshift({text: `ACクリア報酬 ${ac.rewardScore}`, life:180});
          if(skillHistory.length>5) skillHistory.pop();
        }
      }
    }
  });
}

// --- AC進行チェック：時間ベース（毎フレーム呼ばれる・全タイプの失敗はここで一元判定） ---
function updateACOnTime(nowTime) {
  currentSong.acList.forEach(ac => {
    if (ac.state === "active" && nowTime > ac.endTime + settingsTimingOffset) {
      if (ac.type === "stamina") {
        // スタミナ型：endTime到達時のスタミナ値で成否判定
        if (stamina / STAMINA_MAX >= ac.target / 100) {
          ac.cleared = true;
          ac.state = "cleared";
          score += ac.rewardScore;
          spValue = Math.min(SP_MAX, spValue + ac.rewardSP);
          skillHistory.unshift({text: `ACクリア報酬 ${ac.rewardScore}`, life:180});
          if(skillHistory.length>5) skillHistory.pop();
        } else {
          ac.state = "ended";
          applyACFailDamage();
          acFailFlashTimer = 18;
          skillHistory.unshift({text: "AC失敗！", life:180});
          if(skillHistory.length>5) skillHistory.pop();
        }
      } else if (!ac.cleared) {
        // score型・SP型・作戦型：クリアしていなければ失敗（赤フラッシュあり）
        ac.state = "ended";
        applyACFailDamage();
        acFailFlashTimer = 18;
        skillHistory.unshift({text: "AC失敗！", life:180});
        if(skillHistory.length>5) skillHistory.pop();
      }
    }
  });
}
window.addEventListener('touchstart', () => {
  loadTapSE(); // resumeも含む
  if(gameState === "init" && titleBgm.paused) titleBgm.play().catch(()=>{});
}, { once: true });
window.addEventListener('mousedown', () => {
  loadTapSE();
  if(gameState === "init" && titleBgm.paused) titleBgm.play().catch(()=>{});
}, { once: true });
window.addEventListener('keydown', () => {
  loadTapSE();
  if(gameState === "init" && titleBgm.paused) titleBgm.play().catch(()=>{});
}, { once: true });

  
// --- 基本スコアの計算を一律30000・上限50000に ---
function calcTapBase(){
  let baseRaw = 30000; 
  if (appealBoostNotes > 0) {
    baseRaw = Math.ceil(baseRaw * 1.12);
    appealBoostNotes--;
  }
  return Math.min(50000, baseRaw);
}
  
// 同時押し（左右同時刻）ペアのindexリストを作成
function getSimultaneousPairsInNotes() {
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < notes.length; i++) {
    if (used.has(i)) continue;
    const ni = notes[i];
    for (let j = i + 1; j < notes.length; j++) {
      if (used.has(j)) continue;
      const nj = notes[j];
      if (ni.chartIdx !== undefined && nj.chartIdx !== undefined) {
        const ci = currentSong.notesChart[ni.chartIdx];
        const cj = currentSong.notesChart[nj.chartIdx];
        if (ci && cj && ci.time === cj.time && ci.side !== cj.side) {
          pairs.push([ni, nj]);
          used.add(i); used.add(j);
          break;
        }
      }
    }
  }
  return pairs;
}

  
// 判定ラベル・スコア計算
// timingError = |tapBgmTime - noteTargetBgmTime(n)| (秒; 0=完璧タイミング)
// 各窓: WONDERFUL≤0.100s、GREAT≤0.150s、NICE≤0.180s、BAD≤0.200s
function calcTapScoreAndLabel(timingError, baseRaw){
  let label = 'WONDERFUL', mult = 1.2;
  if(timingError<=0.100)      {label='WONDERFUL';mult=1.2;}
  else if(timingError<=0.150) {label='GREAT';    mult=1.1;}
  else if(timingError<=0.180) {label='NICE';     mult=1.0;}
  else if(timingError<=0.200) {label='BAD';      mult=0.9;}
  else {return {points:0,label:'MISS',reset:true};}
  let points=Math.floor(baseRaw*mult);
  if(seededRandom()<0.3){ points=Math.floor(points*1.5); label='CRITICAL'; }
  if(spBoostTimer>0) points=Math.floor(points*1.1);
  points=Math.min(50000, points);
  const reset = (label==='NICE' || label==='BAD');
  return {points,label,reset};
}

// --- スコア加算処理 ---
function awardHit(target, points, label, resetCombo, baseRaw, chartIdx){
  playTapSE();
  let nowTime = getAccurateBgmTime();

  // 作戦クールダウンと特技発動率バフのデクリメント
  if (strategyChangeCooldown > 0) strategyChangeCooldown--;
  const skillRate = skillRateBoostNotes > 0 ? 0.66 : 0.33;
  if (skillRateBoostNotes > 0) skillRateBoostNotes--;

  // 特技発動抽選（スタミナダメージより先にdamageReduceNotesをセット → 当ノーツから軽減適用）
  if(seededRandom() < skillRate){
    skillActivationCount++;
    const skillType = Math.floor(seededRandom()*3);
    if (currentStrategy === "red") {
      if(skillType===0){
        // --- ボルテージ獲得(バフ適用版) ---
        let voltage = baseRaw;
        if (appealBoostNotes > 0) voltage = Math.ceil(voltage * 1.12);
        if (spBoostTimer > 0) voltage = Math.floor(voltage * 1.1);
        const comboBonus = getComboBonus(combo + 1);
        voltage = Math.floor(voltage * comboBonus);
        let nowTime2 = getAccurateBgmTime();
        if (isACActiveByTime(nowTime2) || isACClearedNowByTime(nowTime2)) voltage = Math.floor(voltage * 1.1);
        if (spScoreBuffNotes > 0) voltage = Math.floor(voltage * 1.1);
        let permanentBuff = 1 + permanentScoreBuff * 0.05;
        voltage = Math.floor(voltage * permanentBuff);
        if (voltage > 50000) voltage = 50000;
        score += voltage;
        skillHistory.unshift({text:`[追加スコア獲得 ${voltage}]`, life:180});
      }else if(skillType===1){
        spValue = Math.min(SP_MAX, spValue+540);
        skillHistory.unshift({text:`[SPゲージ獲得 9%]`, life:180});
      }else{
        appealBoostNotes = 5;
        skillHistory.unshift({text:`[アピール増加 12%]`, life:180});
      }
    } else {
      // --- 緑作戦（ヒーラー）特技 ---
      if (skillType === 0) {
        if (stamina > 0) {
          stamina = Math.min(STAMINA_MAX, stamina + 3000);
          skillHistory.unshift({text: '[スタミナ回復 3000]', life: 180});
        }
      } else if (skillType === 1) {
        damageReduceNotes += 3;
        skillHistory.unshift({text: '[ダメージ軽減 50%]', life: 180});
      } else {
        skillRateBoostNotes += 2;
        skillHistory.unshift({text: '[特技発動率上昇 33%]', life: 180});
      }
    }
    if(skillHistory.length>5) skillHistory.pop();
  }

  // スタミナダメージ適用（特技後なのでdamageReduceNotesが当ノーツに反映される）
  applyNoteDamage(nowTime);

  let acBuff = 1.0;
  if (isACActiveByTime(nowTime) || isACClearedNowByTime(nowTime)) acBuff = 1.1;
  let spBuff = 1.0;
  if (spScoreBuffNotes > 0) {
    spBuff = 1.1;
    spScoreBuffNotes--;
  }
  // --- 永続バフ適用 ---
  let permanentBuff = 1 + permanentScoreBuff * 0.05;
  const comboBonus = getComboBonus(combo+1);
  let pointsWithCombo = Math.floor(points * comboBonus * acBuff * spBuff * permanentBuff);
  // スタミナスコア倍率をキャップ前に適用
  pointsWithCombo = Math.floor(pointsWithCombo * getStaminaScoreMult());
  if(pointsWithCombo > 50000) pointsWithCombo = 50000;

  score += pointsWithCombo;
  if(resetCombo){if(spValue<SP_MAX) spValue=Math.max(0, spValue-300);combo=0;}
  else combo++;
  spValue=Math.min(SP_MAX, spValue+200);
  hitRings.push({x:target.x,y:target.y,r:target.r,alpha:1});
  // ヒットパーティクル生成
  {
    const particleProps = {
      CRITICAL:  {count:7, color:'#ffd700'},
      WONDERFUL: {count:5, color:'#ff69b4'},
      GREAT:     {count:4, color:'#00eaff'},
    };
    const pp = particleProps[label] || {count:3, color:'#ffffff'};
    for(let p=0;p<pp.count;p++){
      const angle = (Math.PI*2/pp.count)*p + Math.random()*0.5;
      const speed = (1.8 + Math.random()*2.5) * (R/30);
      particles.push({x:target.x,y:target.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:22+Math.floor(Math.random()*10),maxLife:32,r:2+Math.random()*1.5,color:pp.color});
    }
  }
  const midX = (leftTarget.x + rightTarget.x) / 2;
  const midY = (leftTarget.y + rightTarget.y) / 2 - R*2;
  addPopup(label, midX, midY - 30, 500, 'label');
  addPopup(String(pointsWithCombo), midX, midY, 500, 'score');
  if(judgeCount[label] !== undefined) judgeCount[label]++;

  // AC開始バフ抽選（STARTノーツ到達時のみ）
  for(const ac of currentSong.acList){
    if(ac.state === "waiting" && chartIdx === ac.startIdx){
      ac.state = "active";
      if(seededRandom() < 0.3){
        permanentScoreBuff++;
        skillHistory.unshift({text:"[アピール増加永続 5%]", life:180});
        if(skillHistory.length>5) skillHistory.pop();
      }
    }
  }

  updateACOnTap(pointsWithCombo, nowTime);
}
  
function applyMiss(label='MISS'){
  let nowTime = getAccurateBgmTime();
  applyNoteDamage(nowTime);
  if (strategyChangeCooldown > 0) strategyChangeCooldown--;
  if (skillRateBoostNotes > 0) skillRateBoostNotes--;
  if(spValue<SP_MAX) spValue=Math.max(0, spValue-300);
  combo=0;
  const midX = (leftTarget.x + rightTarget.x) / 2;
  const midY = (leftTarget.y + rightTarget.y) / 2 - R*2;
  addPopup(label, midX, midY - 30, 500, 'label');
  if(judgeCount[label] !== undefined) judgeCount[label]++;
}
function isInSPSemicircle(mx,my){
  const cx=cvs.width/2, cy=cvs.height-10, r=spRadius;
  const dx=mx-cx, dy=my-cy, dist=Math.hypot(dx,dy);
  return (dist<=r) && (my<=cy);
}
  
// --- SPゲージ使用時のスコア計算 ---
function tryUseSP(mx,my,bypassPos){
  if(spValue<SP_MAX) return false;
  if(!bypassPos && !isInSPSemicircle(mx,my)) return false;
  let nowTime = getAccurateBgmTime();
  spUseCount++;
  let spBase = 180000;
  if (appealBoostNotes > 0) {
    spBase = Math.ceil(spBase * 1.12);
    appealBoostNotes--;
  }
  let permanentBuff = 1 + permanentScoreBuff * 0.05;
  const comboBonus = getComboBonus(combo);
  let spScore = spBase;
  if (isACActiveByTime(nowTime) || isACClearedNowByTime(nowTime)) spScore = Math.floor(spScore * 1.1);
  if(spBoostTimer>0) spScore = Math.floor(spScore * 1.1);
  spScore = Math.floor(spScore * comboBonus * permanentBuff);
  if (spScore > 250000) spScore = 250000;
  score += spScore;
  spValue = 0;
  spRingSpeed = 10; spRingRange = 80; triggerSPVisual();
  spBoostTimer = 240;
  spCountdownTimer = 240;
  spCountdownValue = 3;
  addPopup(String(spScore), cvs.width/2, cvs.height/2, 1800, 'sp');
  addPopup('', 0, 0, 180, 'flash');
  for(let i=0;i<6;i++){
    if(seededRandom()<0.5){
      spValue = Math.min(SP_MAX, spValue + 600);
      skillHistory.unshift({text:`[SPゲージ獲得]`, life:180});
      if(skillHistory.length>5) skillHistory.pop();
    }
  }
  if(seededRandom() < 0.5){
    spScoreBuffNotes = 15;
    skillHistory.unshift({text: "[アピール増加 10%]", life:180});
    if(skillHistory.length>5) skillHistory.pop();
  }
  updateACOnSPUse(nowTime, spScore);
  return true;
}
  
// == タップ時の処理 ==
// 各タッチを独立して判定（SP・作戦アイコン・ノーツが同時に反応できる）
function handlePointer(e){
  // --- ポーズ中のタップ判定 ---
  if (gameState === 'playing' && isPaused) {
    const isTouch = e.type.startsWith('touch');
    if (isTouch) e.preventDefault();
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const pt = isTouch ? e.changedTouches[0] : e;
    const tx = (pt.clientX - rect.left) * scaleX;
    const ty = (pt.clientY - rect.top) * scaleY;

    if (pauseResumeBtnBounds &&
        tx >= pauseResumeBtnBounds.x && tx <= pauseResumeBtnBounds.x + pauseResumeBtnBounds.w &&
        ty >= pauseResumeBtnBounds.y && ty <= pauseResumeBtnBounds.y + pauseResumeBtnBounds.h) {
      const resumeOffset = bgm.currentTime;
      bgm.play().then(() => {
        bgmSyncPoint = audioContext ? { audioCtxTime: audioContext.currentTime, bgmOffset: resumeOffset } : null;
        isPaused = false;
        pauseBtn.style.display = 'block';
      }).catch(() => {
        bgmSyncPoint = null;
        isPaused = false;
        pauseBtn.style.display = 'block';
      });
      return;
    }

    if (pauseTitleBtnBounds &&
        tx >= pauseTitleBtnBounds.x && tx <= pauseTitleBtnBounds.x + pauseTitleBtnBounds.w &&
        ty >= pauseTitleBtnBounds.y && ty <= pauseTitleBtnBounds.y + pauseTitleBtnBounds.h) {
      isPaused = false;
      bgm.pause();
      bgm.currentTime = 0;
      gameState = 'init';
      resizeCanvas();
      titleBgm.currentTime = 0;
      titleBgm.play().catch(() => {});
      return;
    }
    return; // ポーズ中はその他の入力を無視
  }

  if(gameState === "songSelect"){
    const isTouch = e.type.startsWith('touch');
    if(isTouch) e.preventDefault();
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const pts = isTouch ? e.changedTouches : [e];
    for (const t of pts) {
      const tx = (t.clientX - rect.left) * scaleX;
      const ty = (t.clientY - rect.top) * scaleY;
      // 「戻る」ボタン判定
      if (songSelectBackBtnBounds &&
          tx >= songSelectBackBtnBounds.x && tx <= songSelectBackBtnBounds.x + songSelectBackBtnBounds.w &&
          ty >= songSelectBackBtnBounds.y && ty <= songSelectBackBtnBounds.y + songSelectBackBtnBounds.h) {
        gameState = "init";
        resizeCanvas();
        titleBgm.currentTime = 0;
        titleBgm.play().catch(() => {});
        return;
      }
      for (const b of songSelectCardBounds) {
        if (b.active && tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
          selectedSongIdx = b.songIdx;
        }
      }
    }
    return;
  }
  if(gameState!=="playing") return;
  const isTouch = e.type.startsWith('touch');
  if(isTouch){
    lastInputWasTouch=true;
    e.preventDefault();
  }
  if(!isTouch && lastInputWasTouch){ lastInputWasTouch=false; return; }

  const rect = cvs.getBoundingClientRect();
  const scaleX = cvs.width / rect.width;
  const scaleY = cvs.height / rect.height;

  // 作戦アイコンの当たり判定サイズ（両ループで共用）
  const iconW = Math.max(60, Math.round(R * 2.0));
  const iconH = Math.max(80, Math.round(R * 2.7));
  const iconCY = cvs.height / 2;

  // changedTouches: 今回新しく押された指のみ
  const newPoints = isTouch ? Array.from(e.changedTouches) : [e];
  let noteFingers = 0;

  for (const t of newPoints) {
    const tx = (t.clientX - rect.left) * scaleX;
    const ty = (t.clientY - rect.top) * scaleY;

    // 作戦切り替えアイコン判定
    if (strategyChangeCooldown === 0 &&
        ty >= iconCY - iconH / 2 && ty <= iconCY + iconH / 2 &&
        (tx <= iconW || tx >= cvs.width - iconW)) {
      currentStrategy = currentStrategy === "red" ? "blue" : "red";
      strategyChangeCooldown = STRATEGY_CHANGE_NOTES;
      notesProcessedSinceSwitch = 0;
      strategyBadgeOffsetX = -300; // バッジを左画面外から登場させる
      const strategyName = currentStrategy === "red" ? "赤作戦（アタッカー）" : "緑作戦（ヒーラー）";
      skillHistory.unshift({text: `[${strategyName}に切り替え]`, life: 180});
      if (skillHistory.length > 5) skillHistory.pop();
      updateACOnStrategyChange(getAccurateBgmTime());
      continue;
    }

    // SP半円判定（SP専用操作なのでノーツ判定には含めない）
    if (isInSPSemicircle(tx, ty)) {
      if (spValue >= SP_MAX) tryUseSP(tx, ty);
      continue;
    }

    noteFingers++;
  }

  if (noteFingers === 0) return;

  // ペア/シングル分岐は「現在画面に触れている全指」からSP・作戦アイコン指を除いた数で決定する。
  // changedTouches（新規指のみ）ではなく e.touches（全アクティブ指）を使うことで、
  // 2本指をわずかにずらして押した場合（= 2回の touchstart が別々に発火する場合）でも
  // 正しくペアノーツ判定に入れる。また SP 押しっぱなし中も SP 指を除外するため誤判定しない。
  let activeNoteFingers = 1; // マウスはタッチなし扱い(常に1)
  if (isTouch) {
    activeNoteFingers = 0;
    for (const t of e.touches) {
      const tx2 = (t.clientX - rect.left) * scaleX;
      const ty2 = (t.clientY - rect.top) * scaleY;
      if (isInSPSemicircle(tx2, ty2)) continue;
      if (ty2 >= iconCY - iconH / 2 && ty2 <= iconCY + iconH / 2 &&
          (tx2 <= iconW || tx2 >= cvs.width - iconW)) continue;
      activeNoteFingers++;
    }
  }

  if (activeNoteFingers >= 2) {
    const tapBgmTime = getAccurateBgmTime();
    const pairs = getSimultaneousPairsInNotes(); // [[nL, nR], ...]
    // 1タップで消費するのは最もタイミング誤差が小さいペア1つのみ
    // （全ペアをループすると0.2s間隔のペアが一括消費されてしまうため）
    let bestPair = null, bestPairError = Infinity;
    for (const [nL, nR] of pairs) {
      const pairTimingError = Math.min(Math.abs(tapBgmTime - noteTargetBgmTime(nL)), Math.abs(tapBgmTime - noteTargetBgmTime(nR)));
      if (pairTimingError < bestPairError) { bestPairError = pairTimingError; bestPair = [nL, nR]; }
    }
    if (bestPair) {
      const [nL, nR] = bestPair;
      let right = nL, left = nR;
      if(currentSong.notesChart[nL.chartIdx]?.side === "left" && currentSong.notesChart[nR.chartIdx]?.side === "right"){
        left = nL; right = nR;
      }
      const baseRaw = calcTapBase();
      const resR = calcTapScoreAndLabel(Math.abs(tapBgmTime - noteTargetBgmTime(right)), baseRaw);
      if(resR.label !== 'MISS'){
        awardHit(rightTarget, resR.points, resR.label, resR.reset, baseRaw, right.chartIdx);
        notes = notes.filter(n => n !== right);
      }
      const resL = calcTapScoreAndLabel(Math.abs(tapBgmTime - noteTargetBgmTime(left)), baseRaw);
      if(resL.label !== 'MISS'){
        awardHit(leftTarget, resL.points, resL.label, resL.reset, baseRaw, left.chartIdx);
        notes = notes.filter(n => n !== left);
      }
    }
    return;
  }

  // 1本指時は単発ノーツのみ、最もターゲットに近い1つのみ判定（誤って複数消費しないよう）
  function isNotPairNote(n){
    return !notes.some(other =>
      other !== n &&
      currentSong.notesChart[n.chartIdx]?.time === currentSong.notesChart[other.chartIdx]?.time &&
      currentSong.notesChart[n.chartIdx]?.side !== currentSong.notesChart[other.chartIdx]?.side
    );
  }
  let targetNotes = notes.filter(isNotPairNote);

  // 密ノーツ対策: 音声時刻基準で理想タイムを過ぎたノーツを優先して選択する。
  // ノーツ間隔が短い場合にWONDERFUL窓が重なっても、
  // 「叩こうとしたノーツより次のノーツが先に消費される」誤判定を防ぐ。
  // 通過済みがなければ全候補から最小誤差を選ぶ（早め叩きも正常に処理される）。
  const tapBgmTime = getAccurateBgmTime();
  const passedNotes = targetNotes.filter(n => tapBgmTime >= noteTargetBgmTime(n));
  const candidatePool = passedNotes.length > 0 ? passedNotes : targetNotes;

  let best = null, bestTimingError = Infinity, bestTarget = null;
  for(const n of candidatePool){
    const target = n.side === 'left' ? leftTarget : (n.side === 'right' ? rightTarget : null);
    if(!target) continue;
    const timingError = Math.abs(tapBgmTime - noteTargetBgmTime(n));
    if(timingError < bestTimingError){ bestTimingError = timingError; best = n; bestTarget = target; }
  }
  if(best){
    const baseRaw = calcTapBase();
    const res = calcTapScoreAndLabel(bestTimingError, baseRaw);
    if(res.label !== 'MISS'){
      awardHit(bestTarget, res.points, res.label, res.reset, baseRaw, best.chartIdx);
      notes = notes.filter(n => n !== best);
    }
  }
}

// --- イベント登録 ---
cvs.addEventListener('touchstart',handlePointer,{passive:false});
cvs.addEventListener('mousedown',handlePointer);

// --- キーボード対応（PC向け） ---
// Z/X=ノーツタップ（両押しでペア），Ctrl=SP，Shift=作戦切り替え
const keyState = {};
window.addEventListener('keyup', e => { keyState[e.code] = false; });
window.addEventListener('keydown', e => {
  if(gameState !== 'playing') return;
  if(isPaused) return;
  const code = e.code;
  if(!['KeyZ','KeyX','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(code)) return;
  e.preventDefault();
  if(e.repeat) return; // キーリピートは無視

  // 作戦切り替え（Shift）
  if(code === 'ShiftLeft' || code === 'ShiftRight'){
    if(strategyChangeCooldown === 0){
      currentStrategy = currentStrategy === 'red' ? 'blue' : 'red';
      strategyChangeCooldown = STRATEGY_CHANGE_NOTES;
      notesProcessedSinceSwitch = 0;
      strategyBadgeOffsetX = -300;
      const strategyName = currentStrategy === 'red' ? '赤作戦（アタッカー）' : '緑作戦（ヒーラー）';
      skillHistory.unshift({text: `[${strategyName}に切り替え]`, life: 180});
      if(skillHistory.length > 5) skillHistory.pop();
      updateACOnStrategyChange(getAccurateBgmTime());
    }
    return;
  }

  // SP発動（Ctrl）
  if(code === 'ControlLeft' || code === 'ControlRight'){
    tryUseSP(0, 0, true);
    return;
  }

  // ノーツタップ（Z/X）
  keyState[code] = true;
  const bothHeld = keyState['KeyZ'] && keyState['KeyX'];

  if(bothHeld){
    // 両押し → ペアノーツ判定（1キー入力につき最小誤差ペア1つのみ）
    const kbdTapBgmTime = getAccurateBgmTime();
    const pairs = getSimultaneousPairsInNotes();
    let bestPair = null, bestPairError = Infinity;
    for(const [nL, nR] of pairs){
      const pairTimingError = Math.min(Math.abs(kbdTapBgmTime - noteTargetBgmTime(nL)), Math.abs(kbdTapBgmTime - noteTargetBgmTime(nR)));
      if(pairTimingError < bestPairError){ bestPairError = pairTimingError; bestPair = [nL, nR]; }
    }
    if(bestPair){
      const [nL, nR] = bestPair;
      const left  = (currentSong.notesChart[nL.chartIdx]?.side === 'left') ? nL : nR;
      const right = (currentSong.notesChart[nL.chartIdx]?.side === 'left') ? nR : nL;
      const baseRaw = calcTapBase();
      const resR = calcTapScoreAndLabel(Math.abs(kbdTapBgmTime - noteTargetBgmTime(right)), baseRaw);
      if(resR.label !== 'MISS'){
        awardHit(rightTarget, resR.points, resR.label, resR.reset, baseRaw, right.chartIdx);
        notes = notes.filter(n => n !== right);
      }
      const resL = calcTapScoreAndLabel(Math.abs(kbdTapBgmTime - noteTargetBgmTime(left)), baseRaw);
      if(resL.label !== 'MISS'){
        awardHit(leftTarget, resL.points, resL.label, resL.reset, baseRaw, left.chartIdx);
        notes = notes.filter(n => n !== left);
      }
    }
    return;
  }

  // 片押し → 対応サイドの単発ノーツを判定
  const tapSide = code === 'KeyZ' ? 'left' : 'right';
  const tapTarget = tapSide === 'left' ? leftTarget : rightTarget;
  // ペアノーツ（同時刻・異サイドのペア）のインデックスを事前に収集して除外
  const pairIndices = new Set();
  for(let i = 0; i < notes.length; i++){
    if(pairIndices.has(i)) continue;
    for(let j = i + 1; j < notes.length; j++){
      if(currentSong.notesChart[notes[i].chartIdx]?.time === currentSong.notesChart[notes[j].chartIdx]?.time &&
         currentSong.notesChart[notes[i].chartIdx]?.side !== currentSong.notesChart[notes[j].chartIdx]?.side){
        pairIndices.add(i); pairIndices.add(j);
      }
    }
  }
  const candidates = notes.filter((n, idx) => n.side === tapSide && !pairIndices.has(idx));
  // 密ノーツ対策: 音声時刻基準で理想タイムを過ぎたノーツを優先（早め叩きはフォールバックで処理される）
  const kbdTapBgmTime = getAccurateBgmTime();
  const passedKbd = candidates.filter(n => kbdTapBgmTime >= noteTargetBgmTime(n));
  const kbdPool = passedKbd.length > 0 ? passedKbd : candidates;
  let best = null, bestTimingError = Infinity;
  for(const n of kbdPool){
    const timingError = Math.abs(kbdTapBgmTime - noteTargetBgmTime(n));
    if(timingError < bestTimingError){ bestTimingError = timingError; best = n; }
  }
  if(best){
    const baseRaw = calcTapBase();
    const res = calcTapScoreAndLabel(bestTimingError, baseRaw);
    if(res.label !== 'MISS'){
      awardHit(tapTarget, res.points, res.label, res.reset, baseRaw, best.chartIdx);
      notes = notes.filter(n => n !== best);
    }
  }
});

// ゲームを初期化して開始する共通関数
async function startGame(seed) {
  await loadTapSE();
  currentSong = SONGS[selectedSongIdx];
  assignACNoteIndexes();
  
  // タイトルBGM停止・ベストスコア再読み込み
  try { titleBgm.pause(); titleBgm.currentTime = 0; } catch(e) {}
  // 選曲に合わせてBGMソースを切り替え
  if (!bgm.src.endsWith('/' + currentSong.bgmSrc)) {
    bgm.src = currentSong.bgmSrc;
    bgm.load();
  }
  bestScore = Number(localStorage.getItem('bestScore_' + currentSong.id)) || 0;

  setSeed(seed);
  lastGameSeed = seed; // 今回のシードを保存

  chartIndex = 0;
  totalNotesSpawned = 0;
  notes = [];
  bgmSyncPoint = null;
  spValue=0; spFullNotified=false;
  score=0; combo=0;
  skillHistory = [];
  appealBoostNotes = 0;
  skillActivationCount = 0;
  spUseCount = 0;
  progressDisplay = 0;
  spFlashTimer=0; spRingTimer=0; spRingSpeed=20; spRingRange=40;
  spBoostTimer=0;
  spCountdownTimer=0;
  spCountdownValue=0;
  spScoreBuffNotes = 0;
  popups=[]; hitRings=[]; particles=[];
  frame = 0;
  countdownValue = 3;
  countdownSecsAccum = 60;
  judgeCount = {CRITICAL:0,WONDERFUL:0,GREAT:0,NICE:0,BAD:0,MISS:0};
  noteCounter = 0;
  totalSPUsed = 0;
  stamina = STAMINA_MAX;
  damageReduceNotes = 0;
  skillRateBoostNotes = 0;
  currentStrategy = "red";
  strategyChangeCooldown = 0;
  notesProcessedSinceSwitch = 0;
  isPaused = false;

  // --- 永続バフ初期化&50%で発動処理 ---
  permanentScoreBuff = 0;
  if(seededRandom() < 0.5){
    permanentScoreBuff++;
    skillHistory.unshift({text:"[アピール増加永続 5%]", life:180});
    if(skillHistory.length>5) skillHistory.pop();
  }

  // AC状態リセット
  currentSong.acList.forEach(ac=>{
    ac.state = "waiting";
    ac.progress = 0;
    ac.cleared = false;
    ac.tapScore = 0;
    ac.spScore = 0;
  });
  gameState = "countdown";
  resizeCanvas();
  startBtn.style.display = "none";
  retryBtn.style.display = "none";
  reseedBtn.style.display = "none";
}

startBtn.onclick = function() {
  if(gameState === "init"){
    // タイトル画面 → 曲選択へ
    const playerName = localStorage.getItem('player_name');
    if (!playerName) {
      showPlayerNameModal(() => {
        titleBgm.pause();
        gameState = "songSelect";
        resizeCanvas();
      });
    } else {
      titleBgm.pause();
      gameState = "songSelect";
      resizeCanvas();
    }
  } else if(gameState === "songSelect"){
    // 曲選択 → ゲーム開始
    startGame(Date.now());
  }
};
  
// --- リトライボタン挙動 ---
retryBtn.onclick = ()=>{
  gameState = "init";
  startBtn.style.display = "block";
  retryBtn.style.display = "none";
  reseedBtn.style.display = "none";
  resizeCanvas();
  try{ bgm.pause(); }catch(e){}
  bgm.currentTime = 0;
  titleBgm.currentTime = 0;
  titleBgm.play().catch(()=>{});
  permanentScoreBuff = 0;
  stamina = STAMINA_MAX;
  damageReduceNotes = 0;
  skillRateBoostNotes = 0;
  currentStrategy = "red";
  strategyChangeCooldown = 0;
  notesProcessedSinceSwitch = 0;
  currentSong.acList.forEach(ac=>{
    ac.state = "waiting";
    ac.progress = 0;
    ac.cleared = false;
    ac.tapScore = 0;
    ac.spScore = 0;
  });
};

// --- 乱数再現ボタン挙動 ---
reseedBtn.onclick = function() {
  startGame(lastGameSeed); // 保存したシードでゲーム開始
};

// --- ポーズボタン挙動 ---
pauseBtn.onclick = () => {
  if (gameState !== 'playing') return;
  isPaused = true;
  bgm.pause();
  bgmSyncPoint = null;
  pauseBtn.style.display = 'none';
};


// ノーツ出現時にchartIdxを渡すよう修正
function update(dt){
  frame += dt;
  if(gameState==="countdown"){
    countdownSecsAccum -= dt;
    if(countdownSecsAccum <= 0 && countdownValue>0){
      countdownValue--;
      countdownSecsAccum += 60; // 60 dt-units = 1 second at 60fps-equivalent
      if(countdownValue===0){
        setTimeout(()=>{
          gameState="playing";
          pauseBtn.style.display = 'block';
          frame = 0;
          bgm.currentTime = 0;
          bgmSyncPoint = null;
          applyVolume(settingsVolume);
          bgm.play().then(() => {
            // BGMが実際に再生開始したタイミングをaudioContext.currentTimeで記録
            // bgmOffsetは0固定（currentTime=0でplay開始するため）
            // これによりモバイルでもbgm.currentTimeの精度問題を回避できる
            if (audioContext) {
              bgmSyncPoint = { audioCtxTime: audioContext.currentTime, bgmOffset: 0 };
            }
          }).catch(()=>{});
        },1000);
      }
    }
    if(acFailFlashTimer > 0) acFailFlashTimer -= dt;
    return;
  }
  if (gameState === "playing" && !bgm.paused) {
    const bgmNowSec = getAccurateBgmTime();
    while (chartIndex < currentSong.notesChart.length && bgmNowSec >= currentSong.notesChart[chartIndex].time - noteTravelSec + settingsTimingOffset) {
      spawnNote(currentSong.notesChart[chartIndex].side, chartIndex); 
      totalNotesSpawned++;
      chartIndex++;
    }
    updateACOnTime(bgmNowSec);
    if(acFailFlashTimer > 0) acFailFlashTimer -= dt;
  }
  for(const n of notes) n.t += dt;
  const keep=[];for(const n of notes){if(n.t<=n.duration+MISS_WINDOW) keep.push(n);else applyMiss('MISS');}notes=keep;
  if(gameState==="playing" && chartIndex>=currentSong.notesChart.length && notes.length===0){
    if(waitingClearFrame === null){
      waitingClearFrame = frame;
    }
    if(frame - waitingClearFrame >= 120){
      gameState="clear";
      clearStartFrame=frame;
      waitingClearFrame = null;
      let fadeOut = setInterval(() => {
        const curVol = bgmGain ? bgmGain.gain.value : bgm.volume;
        if (curVol > 0.02) { applyVolume(curVol - 0.02); }
        else { bgm.pause(); bgm.currentTime = 0; clearInterval(fadeOut); applyVolume(settingsVolume); }
      }, 50);
    }
  } else {
    waitingClearFrame = null;
  }
  if(gameState==="clear" && frame-clearStartFrame>120){
    gameState="result";
    resultStartFrame=frame;
    resizeCanvas();
    if(score > bestScore) {
      bestScore = score;
      localStorage.setItem('bestScore_' + currentSong.id, bestScore);
      const playerName = localStorage.getItem('player_name');
      if (playerName) {
        submitScore(playerName, score, lastGameSeed, currentSong.id).then(res => {
          if (!res.ok) { console.warn('スコア送信失敗:', res.error); return; }
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed;left:20px;bottom:24px;z-index:9999;background:rgba(99,102,241,0.92);color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:bold;box-shadow:0 4px 16px rgba(0,0,0,0.5);pointer-events:none;';
          toast.textContent = '🏆 ベストスコアを更新！ランキングに送信しました';
          document.body.appendChild(toast);
          setTimeout(() => { toast.remove(); }, 2500);
        }).catch(e => { console.warn('スコア送信エラー:', e); });
      }
    }
  }

  if(spValue>=SP_MAX){ if(!spFullNotified){ triggerSPVisual(); spFullNotified=true; } }
  else spFullNotified=false;
  if(spCountdownTimer>0){ const prevSec=Math.floor(spCountdownTimer/60); spCountdownTimer -= dt; if(spCountdownTimer>0 && Math.floor(spCountdownTimer/60)<prevSec){ spCountdownValue = Math.max(0, spCountdownValue-1); } }
  const clearedNotes = chartIndex - notes.length;
  const targetProgress = currentSong.notesChart.length>0 ? Math.min(1, clearedNotes / currentSong.notesChart.length) : 0;
  progressDisplay += (targetProgress - progressDisplay) * 0.2 * dt;
  skillHistory.forEach(h=>h.life-=dt);skillHistory = skillHistory.filter(h=>h.life>0);
  if(spFlashTimer>0) spFlashTimer -= dt;
  if(spRingTimer>0)  spRingTimer -= dt;
  if(spBoostTimer>0) spBoostTimer -= dt;
  hitRings=hitRings.filter(r=>{r.r+=4*dt; r.alpha-=0.06*dt; return r.alpha>0;});
  particles=particles.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;return p.life>0;});
  popups=popups.filter(p=>{p.timer-=dt; return p.timer>0;});
  }
  // --- ユーティリティ: 同時押しペア情報を取得 ---
function getSimultaneousPairs() {
  // timeが一致し、sideが違う2ノーツのペアを列挙
  const pairs = [];
  for (let i = 0; i < notes.length; i++) {
    const n1 = notes[i];
    if (n1.paired) continue;
    for (let j = i + 1; j < notes.length; j++) {
      const n2 = notes[j];
      if (n2.paired) continue;
      if (n1.chartIdx !== undefined && n2.chartIdx !== undefined) {
        const ni = currentSong.notesChart[n1.chartIdx];
        const nj = currentSong.notesChart[n2.chartIdx];
        if (ni && nj && ni.time === nj.time && ni.side !== nj.side) {
          n1.paired = n2.paired = true;
          pairs.push([n1, n2]);
        }
      }
    }
  }
  notes.forEach(n => delete n.paired);
  return pairs;
}

// 判定本体: 指定座標(mx, my)で一番近いノーツを判定
function judgeNotesAt(mx, my, alreadyHitIdx){
  let bestIdx=-1, bestDist=Infinity, bestTarget=null;
  for(let i=0;i<notes.length;i++){
    if (alreadyHitIdx && alreadyHitIdx.includes(i)) continue;
    const n=notes[i];
    const target=n.side==='left'?leftTarget:rightTarget;
    const pos=cubicBezier(n.path.p0,n.path.p1,n.path.p2,n.path.p3, Math.min(1,n.t/n.duration));
    const judgeDist=Math.hypot(pos.x-mx, pos.y-my);
    if(judgeDist<bestDist){bestDist=judgeDist; bestIdx=i; bestTarget=target;}
  }
  if(bestIdx>=0){
    const baseRaw = calcTapBase();
    const {points,label,reset}=calcTapScoreAndLabel(bestDist, baseRaw);
    if(label!=='MISS'){
      awardHit(bestTarget, points, label, reset, baseRaw, notes[bestIdx].chartIdx);
      notes.splice(bestIdx,1);
      if (alreadyHitIdx) alreadyHitIdx.push(bestIdx);
      return true;
    }
  }
  return false;
}
  
// --- ノーツ描画: 同時押しペア間に白線描画 ---
function drawNotes(){
  // 1. 同時ペアのライン（グラデーション+グロー）
  const pairs = getSimultaneousPairs();
  for (const [n1, n2] of pairs) {
    const pos1 = getNotePos(n1);
    const pos2 = getNotePos(n2);
    const pairAlpha = Math.min(noteMissAlpha(n1), noteMissAlpha(n2));
    if(pairAlpha <= 0) continue;

    // AC判定で各ノーツの色を決める
    const isAc1 = currentSong.acList.some(ac=>ac.state==="cleared"&&n1.chartIdx>=ac.startIdx&&n1.chartIdx<=ac.endIdx);
    const isAc2 = currentSong.acList.some(ac=>ac.state==="cleared"&&n2.chartIdx>=ac.startIdx&&n2.chartIdx<=ac.endIdx);
    const col1 = isAc1 ? "#ffd700" : "#00eaff";
    const col2 = isAc2 ? "#ffd700" : "#00eaff";

    // グロー（薄く細い発光線）
    ctx.save();
    ctx.globalAlpha = 0.22 * pairAlpha;
    ctx.strokeStyle = col1;
    ctx.lineWidth = R * 0.22;
    ctx.lineCap = 'round';
    ctx.shadowColor = col1;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();
    ctx.restore();

    // グラデーション本線
    ctx.save();
    const lineGrad = ctx.createLinearGradient(pos1.x, pos1.y, pos2.x, pos2.y);
    lineGrad.addColorStop(0, col1);
    lineGrad.addColorStop(0.5, "#ffffff");
    lineGrad.addColorStop(1, col2);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = R * 0.09;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85 * pairAlpha;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();
    ctx.restore();
  }

  // 2. 通常ノーツ描画
  for(let i=0;i<notes.length;i++){
    const n = notes[i];
    const noteInfo = currentSong.notesChart[n.chartIdx];
    if(!noteInfo) continue;
    const noteTime = noteInfo.time;
    const idx = n.chartIdx;

    // AC区間に入っているか（indexベースで判定）
    let isAcCleared = false;
    for(const ac of currentSong.acList){
      if(ac.state === "cleared" && ac.startIdx !== -1 && ac.endIdx !== -1 && idx >= ac.startIdx && idx <= ac.endIdx){
        isAcCleared = true;
        break;
      }
    }

    // 色設定
    let mainColor = isAcCleared ? "#ffd700" : "#00eaff";
    let glowColor = isAcCleared ? "rgba(255,220,60,0.7)" : "rgba(0,200,255,0.7)";
    let rimColor  = isAcCleared ? "#ffe777" : "#7fffff";
    let dotColor  = isAcCleared ? "#ffe066" : "#1cd9ee";

    const pos = getNotePos(n);
    const r = R;
    // 目標通過後はフェードアウト (1→0 over 21 frames)
    const missAlpha = noteMissAlpha(n);
    if(missAlpha <= 0) continue;

    // --- グロー ---
    ctx.save();
    ctx.globalAlpha = 0.90 * missAlpha;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 1.15, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(pos.x, pos.y, r * 0.6, pos.x, pos.y, r * 1.2);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(0.7, isAcCleared ? "rgba(255,220,60,0.15)" : "rgba(0,200,255,0.18)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();

    // --- 外枠 ---
    ctx.save();
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = r * 0.18;
    ctx.globalAlpha = 0.82 * missAlpha;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 0.87, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // --- 主円 (中央から外へ暗くなる放射グラデーション) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 0.72, 0, Math.PI * 2);
    const mainGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 0.72);
    mainGrad.addColorStop(0,   isAcCleared ? "#fff9c4" : "#e0fbff");
    mainGrad.addColorStop(0.4, mainColor);
    mainGrad.addColorStop(1,   isAcCleared ? "rgba(60,30,0,0.55)" : "rgba(0,30,60,0.55)");
    ctx.fillStyle = mainGrad;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = r * 0.16;
    ctx.globalAlpha = (isAcCleared ? 0.82 : 0.72) * missAlpha;
    ctx.fill();
    ctx.restore();

    // --- 中心ドット ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.globalAlpha = 0.88 * missAlpha;
    ctx.fill();
    ctx.restore();

    // --- START/FINISHラベル ---
    for(const ac of currentSong.acList){
      if(ac.startIdx === idx){
        ctx.font = `bold ${Math.round(R*0.8)}px system-ui`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#fff";
        ctx.strokeText("START", pos.x, pos.y+R+13);
        ctx.fillStyle = "#ff69b4";
        ctx.fillText("START", pos.x, pos.y+R+13);
      }
      if(ac.endIdx === idx){
        ctx.font = `bold ${Math.round(R*0.8)}px system-ui`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ff69b4";
        ctx.strokeText("FINISH", pos.x, pos.y+R+13);
        ctx.fillStyle = "#fff";
        ctx.fillText("FINISH", pos.x, pos.y+R+13);
      }
    }
  }
}
  
// --- AC通知パネル ---
function drawACMissionNotice(){
  let nowTime = getAccurateBgmTime();
  const ac = currentSong.acList.find(ac =>
    (ac.state === "active" || ac.state === "cleared") &&
    nowTime >= ac.startTime + settingsTimingOffset &&
    (nowTime <= ac.endTime + settingsTimingOffset || (ac.cleared && nowTime <= ac.endTime + settingsTimingOffset + 1.0)));
  if(!ac) return;

  const w = Math.min(cvs.width - 20, Math.max(cvs.width * 0.82, 520));
  const h = Math.max(44, Math.round(cvs.height * 0.055));
  const x = (cvs.width - w) / 2;
  const y = Math.max(56, cvs.height * 0.12);
  const fadeEdge = w * 0.13; // 両端フェード幅

  ctx.save();

  // 両端フェードアウトのグラデーション背景
  const baseColor = ac.cleared ? [255, 215, 0] : [255, 105, 180];
  const [r, g, b] = baseColor;
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0,              `rgba(${r},${g},${b},0)`);
  grad.addColorStop(fadeEdge / w,   `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1 - fadeEdge / w, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1,              `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();

  // 枠線（両端フェード）
  const borderGrad = ctx.createLinearGradient(x, y, x + w, y);
  borderGrad.addColorStop(0,              `rgba(${r},${g},${b},0)`);
  borderGrad.addColorStop(fadeEdge / w,   `rgba(${r},${g},${b},0.85)`);
  borderGrad.addColorStop(1 - fadeEdge / w, `rgba(${r},${g},${b},0.85)`);
  borderGrad.addColorStop(1,              `rgba(${r},${g},${b},0)`);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // テキスト
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.round(h * 0.58);
  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 1;

  let text;
  if (ac.cleared) {
    text = "ミッションクリア！";
  } else if (ac.type === "score") {
    text = ` ${ac.desc}（${(ac.progress|0).toLocaleString('ja-JP')}/${ac.target.toLocaleString('ja-JP')}）`;
  } else if (ac.type === "stamina") {
    const pct = Math.floor(stamina / STAMINA_MAX * 100);
    text = ` ${ac.desc}（現在${pct}%）`;
  } else {
    text = ` ${ac.desc}（${ac.progress|0}/${ac.target}）`;
  }

  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
}

// --- 以降は描画処理など ---
function strokeRainbowText(text,x,y,font){
  ctx.textAlign='center'; ctx.font=font;
  const g=ctx.createLinearGradient(x-100,y,x+100,y);
  const hue=(frame*4)%360;
  for(let i=0;i<=6;i++) g.addColorStop(i/6,`hsl(${(hue+i*60)%360},100%,50%)`);
  ctx.lineWidth=4; ctx.strokeStyle=g;
  ctx.strokeText(text,x,y);
  ctx.fillStyle='#fff'; ctx.fillText(text,x,y);
}
function strokeColoredText(text,x,y,font,color){
  ctx.textAlign='center'; ctx.font=font;
  ctx.lineWidth=4; ctx.strokeStyle=color;
  ctx.strokeText(text,x,y);
  ctx.fillStyle='#fff'; ctx.fillText(text,x,y);
}
function strokeOrangeWhiteText(text,x,y,font){
  ctx.textAlign='center'; ctx.font=font;
  ctx.lineWidth=6; ctx.strokeStyle='#fff';
  ctx.strokeText(text,x,y);
  ctx.fillStyle='#ffa500'; ctx.fillText(text,x,y);
}
  
function drawProgressBarWithAC(){
  const barMarginLeft = 20;
  const barMarginRight = 200;
  const barWidth = Math.max(140, cvs.width - barMarginLeft - barMarginRight);
  const barHeight = 12;
  const x = barMarginLeft;
  const y = 10;

  // 1. グレー下地
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(x, y, barWidth, barHeight);

  // 2. ピンクAC区間
  let lastNoteTime = currentSong.notesChart[currentSong.notesChart.length-1]?.time || 0;
  let fallbackSongLen = lastNoteTime + 3;
  let songLen = (bgm.duration && !isNaN(bgm.duration) && bgm.duration > 1)
    ? bgm.duration
    : fallbackSongLen;
  for(const ac of currentSong.acList){
    let startRatio = (ac.startTime + settingsTimingOffset) / songLen;
    let endRatio   = (ac.endTime   + settingsTimingOffset) / songLen;
    let width      = barWidth * (endRatio - startRatio);
    if(isNaN(startRatio) || isNaN(endRatio) || width <= 0) continue;
    ctx.fillStyle = "#ff69b4";
    ctx.globalAlpha = 0.8;
    ctx.fillRect(
      x + barWidth * startRatio,
      y,
      width,
      barHeight
    );
    ctx.globalAlpha = 1;
  }

  // 3. 水色進捗
  let progress = 0;
  if (bgm.duration && bgm.duration > 0) {
    progress = Math.min(1, getAccurateBgmTime() / bgm.duration);
  }
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(x, y, barWidth * progress, barHeight);

  // 4. 白枠
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);
}
  
function drawSkillHistory(){
  const maxItems = 5;
  const lineH = Math.max(16, Math.round(R*0.6));
  const padding = 6;
  const x = 22;
  const startY = cvs.height - 22 - (maxItems-1)*lineH;
  ctx.textAlign='left';
  ctx.font=`bold ${lineH}px system-ui`;
  const items = skillHistory.slice(0, maxItems);
  for(let i=0;i<items.length;i++){
    const h=items[i];
    let alpha = 1;
    if(h.life < 30) alpha = h.life/30;
    ctx.globalAlpha = alpha;
    const text = h.text;
    const w = ctx.measureText(text).width;
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.fillRect(x-2, startY + i*lineH - (lineH-padding/2), w+16, lineH+padding/2);
    ctx.fillStyle='#e5faff';
    ctx.fillText(text, x, startY + i*lineH);
    ctx.globalAlpha = 1;
  }
}
function drawTargets(){
  for(const t of [leftTarget,rightTarget]){
    ctx.save();
    // 中央から外へ暗くなる放射グラデーション
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
    grad.addColorStop(0,   "rgba(255,255,255,0.22)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.07)");
    grad.addColorStop(1,   "rgba(0,0,0,0.25)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    // 外枠
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles(){
  for(const p of particles){
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * a + 0.5, 0, Math.PI*2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }
}

function drawHitRings(){
  for(const ring of hitRings){
    ctx.strokeStyle=`rgba(255,255,255,${ring.alpha})`;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(ring.x,ring.y,ring.r,0,Math.PI*2); ctx.stroke();
  }
}
function drawSPGauge(){
  const cx=cvs.width/2, cy=cvs.height-10, radius=spRadius;
  const startAngle=Math.PI, endAngle=0;
  ctx.strokeStyle='#fff'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(cx,cy,radius,startAngle,endAngle,false); ctx.stroke();
  const fillRatio=Math.min(1, spValue/SP_MAX);
  const fillEnd=startAngle + Math.PI*fillRatio;
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,radius,startAngle,fillEnd,false); ctx.closePath(); ctx.fill();
  const nx=cx+Math.cos(fillEnd)*(radius-10), ny=cy+Math.sin(fillEnd)*(radius-10);
  ctx.strokeStyle='#fff'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(cx,cy,Math.max(3, radius*0.06),0,Math.PI*2); ctx.fill();

  // 満タン時発光エフェクト
  if(spValue >= SP_MAX){
    ctx.save();
    ctx.globalAlpha = 0.33; // 薄い発光
    ctx.strokeStyle = '#ffff99'; // 薄い黄色
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, radius+6, startAngle, endAngle, false);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  
  if(spFlashTimer>0){
    ctx.fillStyle=`rgba(255,255,255,${spFlashTimer/10})`;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,radius,startAngle,endAngle,false); ctx.closePath(); ctx.fill();
  }
  if(spRingTimer>0){
    const rp=1 - spRingTimer/spRingSpeed;
    const rr=radius + rp*spRingRange;
    ctx.strokeStyle=`rgba(255,255,255,${1-rp})`;
    ctx.lineWidth=6; ctx.beginPath(); ctx.arc(cx,cy,rr,startAngle,endAngle,false); ctx.stroke();
  }
}
function drawPopups(){
  for(const p of popups){
    const a=p.timer/p.duration; ctx.globalAlpha=a;
    if(p.type==='label'){
      let fontSize = Math.max(28, Math.round(R*1.2), Math.round(cvs.height*0.055));
      if(p.text==='CRITICAL'){
        ctx.fillStyle='#FFD700'; ctx.font=`bold ${fontSize}px system-ui`; ctx.textAlign='center';
        ctx.fillText('☆', p.x-fontSize*2, p.y);
        ctx.fillText('☆', p.x+fontSize*2, p.y);
        strokeRainbowText('CRITICAL', p.x, p.y, `bold ${fontSize}px system-ui`);
      }else if(p.text==='WONDERFUL'){
        strokeRainbowText('WONDERFUL', p.x, p.y, `bold ${fontSize}px system-ui`);
      }else if(p.text==='GREAT'){
        strokeColoredText('GREAT', p.x, p.y, `bold ${fontSize}px system-ui`, '#ff69b4');
      }else if(p.text==='NICE'){
        strokeColoredText('NICE', p.x, p.y, `bold ${fontSize}px system-ui`, '#ffd700');
      }else if(p.text==='BAD' || p.text==='MISS'){
        strokeColoredText(p.text, p.x, p.y, `bold ${fontSize}px system-ui`, '#9ca3af');
      }
    }else if(p.type==='score'){
      let fontSize = Math.max(26, Math.round(R*1.0), Math.round(cvs.height*0.045));
      strokeColoredText(p.text, p.x, p.y, `bold ${fontSize}px system-ui`, '#39ff14');
    }else if(p.type==='sp'){
      let fontSize = Math.max(54, Math.round(R*2.1), Math.round(cvs.height*0.11));
      strokeOrangeWhiteText(p.text, p.x, p.y, `bold ${fontSize}px system-ui`);
    }
    ctx.globalAlpha=1;
  }
}
function drawUI(){
  if(gameState!=="playing") return;
  const cx=cvs.width - Math.max(120, Math.round(R*4.5));
  ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.font=`bold ${Math.max(38,Math.round(R*1.7))}px system-ui`; ctx.fillText(`${combo}`, cx, Math.max(40,Math.round(R*1.4)));
  ctx.font=`bold ${Math.max(20,Math.round(R*0.9))}px system-ui`; ctx.fillText('COMBO', cx, Math.max(70,Math.round(R*2.0)));
  ctx.textAlign='right'; ctx.font=`bold ${Math.max(16,Math.round(R*0.7))}px system-ui`;
  ctx.fillText(`SCORE: ${score}`, cvs.width-12, cvs.height-16);
}
function drawOverlays(){
  const f=popups.find(p=>p.type==='flash');
  if(f){
    ctx.fillStyle=`rgba(255,255,255,${f.timer/f.duration*0.6})`;
    ctx.fillRect(0,0,cvs.width,cvs.height);
  }
}
function drawSPCountdown(){
  if(spCountdownTimer<=0) return;
  if(spCountdownValue===0 && Math.floor(frame/8)%2===0) return;
  const x=cvs.width/2, y=Math.round(cvs.height*0.25);
  ctx.textAlign='center';
  ctx.font=`bold ${Math.max(48,Math.round(R*2.0))}px system-ui`;
  const g=ctx.createLinearGradient(x-80,y,x+80,y);
  const hue=(frame*4)%360;
  for(let i=0;i<=6;i++) g.addColorStop(i/6, `hsl(${(hue+i*60)%360},100%,50%)`);
  ctx.lineWidth=8; ctx.strokeStyle=g;
  ctx.strokeText(spCountdownValue, x, y);
  ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fillText(spCountdownValue, x, y);
}

function drawACFailFlash(){
  if(acFailFlashTimer > 0){
    const alpha = Math.min(0.38, acFailFlashTimer/18*0.38);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ff0033";
    ctx.fillRect(0,0,cvs.width,cvs.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
  
  function drawSPBoostFrame() {
  if (typeof spBoostTimer === 'undefined' || spBoostTimer <= 0) return;
  const w = cvs.width, h = cvs.height;
  const maxT = 240;
  const fade = Math.max(0, Math.min(1, spBoostTimer / maxT));
  const t = frame; // use frame for animation

  const colors = [
    "#ff4c4c", "#ffa500", "#ffe93a", "#4cff4c", "#39bfff", "#8b4cff", "#ff6cff", "#ff69b4", "#ffffff"
  ];

  ctx.save();

  // --- レーザー光線（画面中央から放射状） ---
  const cx = w / 2, cy = h / 2;
  const laserCount = 12;
  for (let i = 0; i < laserCount; i++) {
    const baseAngle = (i / laserCount) * Math.PI * 2 + (t * 0.025);
    const color = colors[i % colors.length];
    const laserLen = Math.max(w, h) * 0.7;
    const laserW = 3 + Math.sin(t * 0.1 + i) * 1.5;
    const alpha = (0.12 + Math.sin(t * 0.07 + i * 1.3) * 0.06) * fade;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = laserW;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(baseAngle) * laserLen, cy + Math.sin(baseAngle) * laserLen);
    ctx.stroke();
    ctx.restore();
  }

  // --- ☆星マーク ---
  const starCount = 14;
  for (let i = 0; i < starCount; i++) {
    const seed1 = i * 137.5;
    const seed2 = i * 97.3;
    const px = ((seed1 * 0.618 % 1) * 0.82 + 0.09) * w;
    const py = ((seed2 * 0.618 % 1) * 0.82 + 0.09) * h;
    const phase = t * 0.04 + i * 0.8;
    const size = (14 + Math.sin(phase) * 4) * (0.7 + (i % 3) * 0.3);
    const angle = t * 0.03 + i * 0.5;
    const color = colors[i % colors.length];
    const alpha = (0.30 + Math.sin(phase + 0.5) * 0.15) * fade;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    // 5-pointed star
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const a = (p * 4 * Math.PI / 5) - Math.PI / 2;
      const b = (p * 4 * Math.PI / 5 + 2 * Math.PI / 5) - Math.PI / 2;
      if (p === 0) ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
      else ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      ctx.lineTo(Math.cos(b) * size * 0.42, Math.sin(b) * size * 0.42);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- ◆ダイヤマーク ---
  const diamondCount = 10;
  for (let i = 0; i < diamondCount; i++) {
    const seed1 = i * 223.7 + 55;
    const seed2 = i * 181.1 + 33;
    const px = ((seed1 * 0.618 % 1) * 0.78 + 0.11) * w;
    const py = ((seed2 * 0.618 % 1) * 0.78 + 0.11) * h;
    const phase = t * 0.05 + i * 1.1;
    const size = (10 + Math.sin(phase) * 3) * (0.6 + (i % 4) * 0.25);
    const angle = t * 0.04 + i * 0.7;
    const color = colors[(i + 3) % colors.length];
    const alpha = (0.25 + Math.sin(phase + 1.0) * 0.12) * fade;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 4);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    // diamond
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- 光のフレア（辺縁） ---
  const flareCount = 8;
  for (let i = 0; i < flareCount; i++) {
    const angle = (i / flareCount) * Math.PI * 2 + t * 0.015;
    const r = Math.min(w, h) * (0.42 + Math.sin(t * 0.06 + i) * 0.04);
    const fx = cx + Math.cos(angle) * r;
    const fy = cy + Math.sin(angle) * r;
    const color = colors[(i + 5) % colors.length];
    const flareSize = 8 + Math.sin(t * 0.08 + i * 1.7) * 4;
    const alpha = (0.22 + Math.sin(t * 0.09 + i) * 0.1) * fade;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(fx, fy, flareSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
} 
// 判定回数リザルト左下表示
function drawJudgeCountsResult() {
  const baseX = 30;
  const baseY = cvs.height - 28;
  const lineH = Math.max(14, Math.round(cvs.height * 0.03));
  const labels = ["CRITICAL", "WONDERFUL", "GREAT", "NICE", "BAD", "MISS"];
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `bold ${lineH}px system-ui`;
  // 幅確保
  let maxLabelWidth = 0, maxCountWidth = 0;
  for(const l of labels) {
    const w1 = ctx.measureText(l).width;
    const w2 = ctx.measureText(judgeCount[l].toString()).width;
    if(w1>maxLabelWidth) maxLabelWidth = w1;
    if(w2>maxCountWidth) maxCountWidth = w2;
  }
  const gap = 16;
  for(let i=0;i<labels.length;i++){
    const l = labels[i];
    const y = baseY - lineH * (labels.length - i);
    ctx.textAlign = 'left';
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.82;
    ctx.fillText(l, baseX, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = "#ffd700";
    ctx.globalAlpha = 0.94;
    ctx.fillText(judgeCount[l], baseX + maxLabelWidth + gap + maxCountWidth, y);
  }
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

// --- スタミナバー描画 ---
function drawStaminaBar() {
  if (gameState !== "playing") return;
  const cx = cvs.width / 2;
  const cy = cvs.height - 10;
  const barRadius = spRadius + 14;
  const startAngle = Math.PI;
  const maxAngle = Math.PI * 1.5;

  ctx.save();
  ctx.lineCap = 'round';

  // 黒縁取り（全体の外枠）
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, barRadius, startAngle, maxAngle, false);
  ctx.stroke();

  // 背景（黒下地）
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, barRadius, startAngle, maxAngle, false);
  ctx.stroke();

  // スタミナバー本体
  const ratio = stamina / STAMINA_MAX;
  if (ratio > 0) {
    const endAngle = startAngle + (maxAngle - startAngle) * ratio;
    let color;
    if (ratio >= 0.70) color = '#22c55e';
    else if (ratio >= 0.30) color = '#f97316';
    else color = '#ef4444';

    // バー本体の縁取り
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, barRadius, startAngle, endAngle, false);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, barRadius, startAngle, endAngle, false);
    ctx.stroke();
  }

  ctx.restore();
}

// --- 作戦切り替えアイコン描画 ---
function drawStrategyIcons() {
  if (gameState !== "playing") return;

  const iconW = Math.max(60, Math.round(R * 2.0));
  const iconH = Math.max(80, Math.round(R * 2.7));
  const centerY = cvs.height / 2;
  const canSwitch = strategyChangeCooldown === 0;

  // アイコン色（現在の作戦の逆色 — 赤作戦中は緑アイコン、緑作戦中は赤アイコン）
  const bgColor      = currentStrategy === "red" ? "rgba(10,30,15,0.6)"  : "rgba(30,10,10,0.6)";
  const chevronColor = currentStrategy === "red" ? "#14532d" : "#5c1a2a";
  const labelColor   = currentStrategy === "red" ? "#4ade80" : "#f87171";
  // アイコン下ラベルは「切り替え先」の作戦名を表示
  const labelText    = currentStrategy === "red" ? "ヒーラー" : "アタッカー";
  const labelFontSize = Math.max(10, Math.round(R * 0.48));

  const glowColor = `hsl(${(frame * 4) % 360}, 100%, 65%)`;

  // --- 左アイコン（< シェブロン） ---
  const lx = 0;
  const ly = centerY - iconH / 2;

  ctx.save();
  // 背景
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(lx, ly, iconW, iconH, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 発光エフェクト（切り替え可能時）
  if (canSwitch) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = glowColor;
  }

  // シェブロン < （右2点→左頂点の塗りつぶし三角形）
  ctx.fillStyle = chevronColor;
  ctx.beginPath();
  ctx.moveTo(lx + iconW * 0.76, centerY - iconH * 0.29);
  ctx.lineTo(lx + iconW * 0.24, centerY);
  ctx.lineTo(lx + iconW * 0.76, centerY + iconH * 0.29);
  ctx.closePath();
  ctx.fill();

  // ハイライト線
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();

  // ラベル
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold ${labelFontSize}px system-ui`;
  ctx.fillStyle = labelColor;
  ctx.globalAlpha = 0.9;
  ctx.fillText(labelText, lx + iconW / 2, ly + iconH + labelFontSize + 2);
  ctx.restore();

  // --- 右アイコン（> シェブロン） ---
  const rx = cvs.width - iconW;
  const ry = centerY - iconH / 2;

  ctx.save();
  // 背景
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(rx, ry, iconW, iconH, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 発光エフェクト（切り替え可能時）
  if (canSwitch) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = glowColor;
  }

  // シェブロン > （左2点→右頂点の塗りつぶし三角形）
  ctx.fillStyle = chevronColor;
  ctx.beginPath();
  ctx.moveTo(rx + iconW * 0.24, centerY - iconH * 0.29);
  ctx.lineTo(rx + iconW * 0.76, centerY);
  ctx.lineTo(rx + iconW * 0.24, centerY + iconH * 0.29);
  ctx.closePath();
  ctx.fill();

  // ハイライト線
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();

  // ラベル
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold ${labelFontSize}px system-ui`;
  ctx.fillStyle = labelColor;
  ctx.globalAlpha = 0.9;
  ctx.fillText(labelText, rx + iconW / 2, ry + iconH + labelFontSize + 2);
  ctx.restore();
}

// --- 現在の作戦バッジ描画（進捗バー左下） ---
function drawCurrentStrategyBadge() {
  if (gameState !== "playing") return;

  // スライドアニメーション（easing）
  if (strategyBadgeOffsetX < 0) {
    strategyBadgeOffsetX += (-strategyBadgeOffsetX) * 0.18 + 1.5;
    if (strategyBadgeOffsetX > -0.5) strategyBadgeOffsetX = 0;
  }

  const isRed = currentStrategy === "red";
  const text = isRed ? "⚔ アタッカー" : "✦ ヒーラー";
  const colorA = isRed ? "#ff4444" : "#22c55e";
  const colorB = isRed ? "#991b1b" : "#14532d";
  const glowCol = isRed ? "rgba(255,80,80,0.7)" : "rgba(34,197,94,0.7)";
  const fontSize = Math.max(13, Math.round(R * 0.6));
  const padX = 14, padY = 6;
  const baseX = 20;
  const baseY = 28;

  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui`;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = fontSize + padY * 2;
  const x = baseX + strategyBadgeOffsetX;
  const y = baseY;
  const r = 6;

  // 外側グロー
  ctx.shadowColor = glowCol;
  ctx.shadowBlur = 14;

  // グラデーション背景
  const grad = ctx.createLinearGradient(x, y, x, y + bh);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, r);
  ctx.fill();

  // 上半分ハイライト（光沢）
  ctx.shadowBlur = 0;
  const shine = ctx.createLinearGradient(x, y, x, y + bh * 0.5);
  shine.addColorStop(0, "rgba(255,255,255,0.25)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh * 0.55, [r, r, 0, 0]);
  ctx.fill();

  // 枠線
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, r);
  ctx.stroke();

  // テキスト（ドロップシャドウ風）
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(text, x + padX + 1, y + padY + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + padX, y + padY);

  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawSongSelectScreen() {
  const NUM_CARDS = 3;
  const gap = Math.round(cvs.width * 0.03);
  const cardW = Math.round((cvs.width * 0.72) / NUM_CARDS);
  const jacketSize = Math.round(cardW * 0.72);
  const titleFontSize = Math.max(11, Math.round(cardW * 0.075));
  const scoreFontSize = Math.max(10, Math.round(cardW * 0.065));
  const cardH = jacketSize + titleFontSize + scoreFontSize + 44;
  const totalW = NUM_CARDS * cardW + (NUM_CARDS - 1) * gap;
  const startX = Math.round((cvs.width - totalW) / 2);
  const cardY = Math.round(cvs.height * 0.08);

  // カードデータ（3曲すべて実データ）
  const cards = [
    { songIdx: 0, title: SONGS[0].title, jacketEl: document.getElementById(SONGS[0].jacketId), active: true },
    { songIdx: 1, title: SONGS[1].title, jacketEl: document.getElementById(SONGS[1].jacketId), active: true },
    { songIdx: 2, title: SONGS[2].title, jacketEl: document.getElementById(SONGS[2].jacketId), active: true },
  ];
  songSelectCardBounds = [];

  for (let i = 0; i < NUM_CARDS; i++) {
    const card = cards[i];
    const cardX = startX + i * (cardW + gap);
    const jacketX = Math.round(cardX + (cardW - jacketSize) / 2);
    const jacketY = cardY + 12;
    songSelectCardBounds.push({ songIdx: card.songIdx, active: card.active, x: cardX, y: cardY, w: cardW, h: cardH });

    // カード背景
    ctx.save();
    const isSelected = card.active && card.songIdx === selectedSongIdx;
    if (isSelected) {
      ctx.shadowColor = "rgba(57,255,20,0.3)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(15,23,42,0.92)";
      ctx.strokeStyle = "rgba(57,255,20,0.55)";
      ctx.lineWidth = 2;
    } else if (card.active) {
      ctx.fillStyle = "rgba(15,23,42,0.72)";
      ctx.strokeStyle = "rgba(100,200,139,0.4)";
      ctx.lineWidth = 1.5;
    } else {
      ctx.fillStyle = "rgba(15,23,42,0.5)";
      ctx.strokeStyle = "rgba(100,116,139,0.35)";
      ctx.lineWidth = 1;
    }
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // ジャケット画像
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(jacketX, jacketY, jacketSize, jacketSize, 8);
    ctx.clip();
    if (card.jacketEl && card.jacketEl.complete && card.jacketEl.naturalWidth > 0) {
      ctx.drawImage(card.jacketEl, jacketX, jacketY, jacketSize, jacketSize);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(jacketX, jacketY, jacketSize, jacketSize);
      ctx.fillStyle = "#475569";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(jacketSize * 0.11)}px system-ui`;
      ctx.fillText("NO IMAGE", jacketX + jacketSize / 2, jacketY + jacketSize / 2);
    }
    ctx.restore();

    const textBaseY = jacketY + jacketSize + 14;
    const cx = cardX + cardW / 2;

    // 曲タイトル
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${titleFontSize}px system-ui`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeText(card.title, cx, textBaseY);
    ctx.fillStyle = card.active ? "#ffffff" : "#64748b";
    ctx.fillText(card.title, cx, textBaseY);

    // ベストスコア（選択可能曲のみ）
    if (card.active && card.songIdx >= 0) {
      const cardBest = parseInt(localStorage.getItem('bestScore_' + SONGS[card.songIdx].id) || '0', 10);
      const bsLabel = `BEST: ${cardBest > 0 ? cardBest.toLocaleString('ja-JP') : '---'}`;
      ctx.font = `bold ${scoreFontSize}px system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.strokeText(bsLabel, cx, textBaseY + titleFontSize + 8);
      ctx.fillStyle = "#ffd700";
      ctx.fillText(bsLabel, cx, textBaseY + titleFontSize + 8);
    }
    ctx.restore();
  }
}

function render(){
   ctx.clearRect(0,0,cvs.width,cvs.height);

  // --- タイトル画面 ---
  if(gameState==="init"){
    if(titleImg.complete && titleImg.naturalWidth > 0) {
      ctx.drawImage(titleImg, 0, 0, cvs.width, cvs.height);
    } else {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0,0,cvs.width,cvs.height);
    }
    return;
  }

  // --- 曲選択画面 ---
  if(gameState==="songSelect"){
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0,0,cvs.width,cvs.height);
    if(bgimg.complete && bgimg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.drawImage(bgimg, 0, 0, cvs.width, cvs.height);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    drawSongSelectScreen();

    // --- 左上：ユーザー名表示 ---
    const playerName = localStorage.getItem('player_name') || '';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('👤 ' + playerName, 16, 28);

    // --- 上部中央：平均スコア表示 ---
    const scores = SONGS.map(s => Number(localStorage.getItem('bestScore_' + s.id)) || 0);
    const avg = SONGS.length > 0 ? Math.floor(scores.reduce((a, b) => a + b, 0) / SONGS.length) : 0;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('📊 平均スコア: ' + avg.toLocaleString('ja-JP'), cvs.width / 2, 28);

    // --- 左下：タイトルへ戻るボタン ---
    const backBtnX = 20;
    const backBtnY = cvs.height - 20 - 36;
    const backBtnW = 70;
    const backBtnH = 36;
    songSelectBackBtnBounds = { x: backBtnX, y: backBtnY, w: backBtnW, h: backBtnH };
    ctx.save();
    ctx.fillStyle = 'rgba(30,41,59,0.88)';
    ctx.beginPath();
    ctx.roundRect(backBtnX, backBtnY, backBtnW, backBtnH, 8);
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('《 戻る ', backBtnX + backBtnW / 2, backBtnY + backBtnH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    return;
  }

  // 背景画像20%不透明度）をcanvas全体に描画
  if(bgimg.complete && bgimg.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.drawImage(bgimg, 0, 0, cvs.width, cvs.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0,0,cvs.width,cvs.height);
  }
  
  if(gameState!=="countdown" && gameState!=="playing" && gameState!=="clear" && gameState!=="result") return;

  drawProgressBarWithAC();
  drawTargets();
  drawNotes();
  drawHitRings();
  drawParticles();
  drawSPGauge();
  drawStaminaBar();
  drawStrategyIcons();
  drawCurrentStrategyBadge();
  drawPopups();
  drawUI();
  drawOverlays();
  drawSPBoostFrame();
  drawSkillHistory();
  drawACMissionNotice();
  drawACFailFlash();
  
  if(gameState==="countdown"){
    const txt = countdownValue>0 ? countdownValue : 1;
    ctx.textAlign='center';
    ctx.font=`bold ${Math.round(cvs.height*0.22)}px system-ui`;
    ctx.lineWidth=10; ctx.strokeStyle='#000'; ctx.strokeText(txt, cvs.width/2, cvs.height/2);
    ctx.fillStyle='#fff'; ctx.fillText(txt, cvs.width/2, cvs.height/2);
    return;
  }
  drawSPCountdown();
  if(gameState==="clear"){
    ctx.textAlign='center';
    ctx.font=`bold ${Math.round(cvs.height*0.14)}px system-ui`;
    ctx.lineWidth=10; ctx.strokeStyle='#fff'; ctx.strokeText('CLEAR', cvs.width/2, cvs.height/2);
    ctx.fillStyle='#ffa500'; ctx.fillText('CLEAR', cvs.width/2, cvs.height/2);
    return;
  }

  // --- ポーズオーバーレイ ---
  if(gameState === "playing" && isPaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('⏸ PAUSED', cvs.width / 2, cvs.height / 2 - 60);

    const resumeBtnX = cvs.width / 2 - 90;
    const resumeBtnY = cvs.height / 2 - 10;
    const btnW = 180, btnH = 48;
    ctx.fillStyle = 'rgba(99,102,241,0.92)';
    ctx.beginPath();
    ctx.roundRect(resumeBtnX, resumeBtnY, btnW, btnH, 10);
    ctx.fill();
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶ 再開', cvs.width / 2, resumeBtnY + btnH / 2);
    pauseResumeBtnBounds = { x: resumeBtnX, y: resumeBtnY, w: btnW, h: btnH };

    const titleBtnY = resumeBtnY + btnH + 20;
    ctx.fillStyle = 'rgba(30,41,59,0.92)';
    ctx.beginPath();
    ctx.roundRect(resumeBtnX, titleBtnY, btnW, btnH, 10);
    ctx.fill();
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('⏹ タイトルへ', cvs.width / 2, titleBtnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';
    pauseTitleBtnBounds = { x: resumeBtnX, y: titleBtnY, w: btnW, h: btnH };
    return;
  }
  if(gameState==="result"){
    retryBtn.style.display = "block";
    reseedBtn.style.display = "block"; // 乱数再現ボタン表示
    const t = Math.min(1, (frame - (resultStartFrame||frame)) / 60);
    const scale = 0.8 + 0.2*Math.sin(t*Math.PI/2);
    const alpha = 0.5 + 0.5*t;
    ctx.save();
    ctx.translate(cvs.width/2, cvs.height/2);
    ctx.scale(scale, scale);
    ctx.textAlign='center';

    const h = cvs.height, w = cvs.width;
    // maxWidth in local (pre-scale) coords so text never overflows canvas width
    const safeW = Math.round(w * 0.90 / scale);
    // Font sizes capped by both height and width for narrow screens
    const titleSize = Math.round(h * 0.09);
    const mainSize  = Math.min(Math.round(h * 0.063), Math.round(w * 0.13));
    const subSize   = Math.min(Math.round(h * 0.038), Math.round(w * 0.082));
    // Proportional vertical spacing unit
    const rowH = Math.round(h * 0.065);
    // Subtle depth shadow helpers (result screen only)
    const applyShadow = () => { ctx.shadowColor='rgba(0,0,0,0.45)'; ctx.shadowOffsetX=1; ctx.shadowOffsetY=2; ctx.shadowBlur=2; };
    const clearShadow = () => { ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; ctx.shadowBlur=0; };

    // "RESULT" header
    ctx.font=`bold ${titleSize}px system-ui`;
    ctx.lineWidth=8; ctx.strokeStyle='#000'; applyShadow();
    ctx.strokeText('RESULT', 0, -rowH*2, safeW);
    ctx.fillStyle='#ffa500'; ctx.fillText('RESULT', 0, -rowH*2, safeW); clearShadow();

    // 曲名
    ctx.font = `bold ${mainSize}px system-ui`;
    ctx.lineWidth = 6; ctx.strokeStyle = "#000"; applyShadow();
    ctx.strokeText(currentSong.title, 0, -rowH*0.75, safeW);
    ctx.fillStyle = "#fff"; ctx.fillText(currentSong.title, 0, -rowH*0.75, safeW); clearShadow();

    // SCORE
    ctx.font=`bold ${mainSize}px system-ui`;
    ctx.lineWidth=8; ctx.strokeStyle='#000'; applyShadow();
    ctx.strokeText(`SCORE: ${score}`, 0, rowH*0.25, safeW);
    ctx.fillStyle='#39ff14'; ctx.fillText(`SCORE: ${score}`, 0, rowH*0.25, safeW); clearShadow();

    // BEST SCORE
    ctx.font=`bold ${Math.round(mainSize*0.78)}px system-ui`;
    ctx.lineWidth=6; ctx.strokeStyle="#000"; applyShadow();
    ctx.strokeText(`BEST SCORE: ${bestScore}`, 0, rowH*1.0, safeW);
    ctx.fillStyle="#ffd700"; ctx.fillText(`BEST SCORE: ${bestScore}`, 0, rowH*1.0, safeW); clearShadow();

    // 特技・SP 統計
    ctx.font=`bold ${subSize}px system-ui`;
    ctx.lineWidth=5; ctx.strokeStyle='#000'; applyShadow();
    ctx.strokeText(`特技発動回数: ${skillActivationCount}`, 0, rowH*1.85, safeW);
    ctx.strokeText(`SP使用回数: ${spUseCount}`, 0, rowH*2.45, safeW);
    ctx.fillStyle='#e5faff';
    ctx.fillText(`特技発動回数: ${skillActivationCount}`, 0, rowH*1.85, safeW);
    ctx.fillText(`SP使用回数: ${spUseCount}`, 0, rowH*2.45, safeW); clearShadow();

    ctx.restore();
    drawJudgeCountsResult();
    return;
  } else {
    retryBtn.style.display = "none";
    reseedBtn.style.display = "none";
  }
}
let _loopLastTs = 0;
function loop(ts){
  // dt: elapsed time scaled to 60fps-equivalent units (1.0 = one 60fps frame = 16.667ms)
  // Capped at 3 to prevent huge jumps after tab switching / sleep
  const dt = _loopLastTs ? Math.min((ts - _loopLastTs) / 16.667, 3) : 1;
  _loopLastTs = ts;
  if (!isPaused) update(dt);
  render();
  requestAnimationFrame(loop);
}
(function start(){ requestAnimationFrame(loop); })();
