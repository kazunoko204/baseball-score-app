import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0jfaU5TygflvFeYz6Y7j1beVnSV-AF8E",
  authDomain: "baseball-score-app-698e7.firebaseapp.com",
  projectId: "baseball-score-app-698e7",
  storageBucket: "baseball-score-app-698e7.firebasestorage.app",
  messagingSenderId: "903549341305",
  appId: "1:903549341305:web:f76b0171f3b555143a0ea8"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const playersCol = collection(db, "players");
const gamesCol = collection(db, "games");
const uniformsCol = collection(db, "uniforms");
const setupDraftRef = doc(db, "setup", "current");

const UNIFORM_SIZES = ['S', 'M', 'L', 'O', 'XO'];

const AT_BAT_TYPES = ['single', 'double', 'triple', 'homerun', 'walk', 'hbp', 'strikeout', 'out'];

const OUTCOME_LABELS = {
  single: '単打', double: '二塁打', triple: '三塁打', homerun: '本塁打',
  walk: '四球', hbp: '死球', strikeout: '三振', out: 'その他アウト',
  steal: '盗塁', error: 'エラー'
};

let players = [];
let games = [];
let uniforms = [];
let currentGameId = null;
let currentGameData = null;
let unsubscribeGame = null;
let setupData = null;
let unsubscribeSetup = null;

const modalOverlay = document.getElementById('modalOverlay');
const modalBox = document.getElementById('modalBox');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  if (id !== 'view-game' && unsubscribeGame) {
    unsubscribeGame();
    unsubscribeGame = null;
    currentGameId = null;
    currentGameData = null;
  }
  if (id !== 'view-setup' && unsubscribeSetup) {
    unsubscribeSetup();
    unsubscribeSetup = null;
    setupData = null;
  }
}

function showModal() {
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalBox.innerHTML = '';
}

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

async function updateGameInTransaction(gameId, updater) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const updates = updater(snap.data());
    if (updates) tx.update(gameRef, updates);
  });
}

// ---------- リアルタイム同期 ----------

onSnapshot(playersCol, snap => {
  players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!document.getElementById('view-players').classList.contains('hidden')) renderPlayers();
  if (!document.getElementById('view-setup').classList.contains('hidden')) renderSetupPlayerSelect();
  if (!document.getElementById('view-uniforms').classList.contains('hidden')) renderUniforms();
});

onSnapshot(uniformsCol, snap => {
  uniforms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!document.getElementById('view-uniforms').classList.contains('hidden')) renderUniforms();
});

onSnapshot(gamesCol, snap => {
  games = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!document.getElementById('view-home').classList.contains('hidden')) renderHome();
  if (!document.getElementById('view-aggregate').classList.contains('hidden')) renderAggregateList();
});

// ---------- ホーム画面 ----------

function renderHome() {
  const list = document.getElementById('gameList');
  if (games.length === 0) {
    list.innerHTML = '<p class="empty">まだ試合がありません</p>';
    return;
  }
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map(g => `
    <div class="list-row">
      <div class="list-row-main">
        <span class="game-date">${escapeHtml(g.date)}</span>
        <span class="game-opponent">vs ${escapeHtml(g.opponent || '(相手未設定)')}</span>
      </div>
      <button class="btn btn-small openGameBtn" data-id="${g.id}">開く</button>
      <button class="btn btn-small btn-danger deleteGameBtn" data-id="${g.id}">削除</button>
    </div>
  `).join('');
}

document.getElementById('btnNewGame').addEventListener('click', openSetup);
document.getElementById('btnPlayers').addEventListener('click', () => {
  renderPlayers();
  showView('view-players');
});
document.getElementById('btnAggregate').addEventListener('click', () => {
  renderAggregateList();
  showView('view-aggregate');
});

document.getElementById('gameList').addEventListener('click', async e => {
  if (e.target.classList.contains('openGameBtn')) {
    openGame(e.target.dataset.id);
  }
  if (e.target.classList.contains('deleteGameBtn')) {
    if (confirm('この試合を削除しますか？元に戻せません。')) {
      await deleteDoc(doc(db, 'games', e.target.dataset.id));
    }
  }
});

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    showView(btn.dataset.back);
    if (btn.dataset.back === 'view-home') renderHome();
  });
});

// ---------- 選手管理画面 ----------

function renderPlayers() {
  const list = document.getElementById('playerList');
  if (players.length === 0) {
    list.innerHTML = '<p class="empty">選手が登録されていません</p>';
    return;
  }
  list.innerHTML = players.map(p => `
    <div class="list-row">
      <div class="list-row-main">
        <input type="text" class="edit-name" data-id="${p.id}" value="${escapeHtml(p.name)}">
        <span class="player-number-display">背番号: ${escapeHtml(p.number || '未設定')}</span>
      </div>
      <button class="btn btn-small btn-danger deletePlayerBtn" data-id="${p.id}">削除</button>
    </div>
  `).join('');
}

document.getElementById('addPlayerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const nameInput = document.getElementById('newPlayerName');
  const name = nameInput.value.trim();
  if (!name) return;
  await addDoc(playersCol, { name, number: '' });
  nameInput.value = '';
});

document.getElementById('playerList').addEventListener('click', async e => {
  if (e.target.classList.contains('deletePlayerBtn')) {
    const id = e.target.dataset.id;
    if (confirm('この選手をマスタから削除しますか？（過去の試合記録は残ります）')) {
      await deleteDoc(doc(db, 'players', id));
    }
  }
});

document.getElementById('playerList').addEventListener('change', async e => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('edit-name')) {
    await updateDoc(doc(db, 'players', id), { name: e.target.value.trim() });
  }
});

// ---------- ユニフォーム管理画面 ----------

document.getElementById('btnUniforms').addEventListener('click', () => {
  renderUniforms();
  showView('view-uniforms');
});

function renderUniforms() {
  const list = document.getElementById('uniformList');
  if (players.length === 0) {
    list.innerHTML = '<p class="empty">選手が登録されていません</p>';
    return;
  }
  const sizeOptions = (selected) => UNIFORM_SIZES.map(s =>
    `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`
  ).join('');
  list.innerHTML = players.map(p => {
    const u = uniforms.find(x => x.id === p.id) || {};
    const cap = u.cap || 'なし';
    return `
    <div class="list-row uniform-row" data-id="${p.id}">
      <div class="list-row-main">
        <strong>${escapeHtml(p.name)}</strong>
        <label>帽子
          <select class="uni-cap" data-id="${p.id}">
            <option value="なし" ${cap === 'なし' ? 'selected' : ''}>なし</option>
            <option value="あり" ${cap === 'あり' ? 'selected' : ''}>あり</option>
          </select>
        </label>
        <label>上
          <select class="uni-top" data-id="${p.id}">
            <option value="">未設定</option>
            ${sizeOptions(u.top)}
          </select>
        </label>
        <label>背番号
          <input type="text" class="uni-number" data-id="${p.id}" inputmode="numeric" maxlength="2" value="${escapeHtml(u.number || '')}" style="max-width:4em;">
        </label>
        <label>下
          <select class="uni-bottom" data-id="${p.id}">
            <option value="">未設定</option>
            ${sizeOptions(u.bottom)}
          </select>
        </label>
      </div>
    </div>
  `;
  }).join('');
}

document.getElementById('uniformList').addEventListener('change', async e => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('uni-cap')) {
    await setDoc(doc(db, 'uniforms', id), { cap: e.target.value }, { merge: true });
  } else if (e.target.classList.contains('uni-top')) {
    await setDoc(doc(db, 'uniforms', id), { top: e.target.value }, { merge: true });
  } else if (e.target.classList.contains('uni-bottom')) {
    await setDoc(doc(db, 'uniforms', id), { bottom: e.target.value }, { merge: true });
  } else if (e.target.classList.contains('uni-number')) {
    const number = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    e.target.value = number;
    await setDoc(doc(db, 'uniforms', id), { number }, { merge: true });
    await updateDoc(doc(db, 'players', id), { number });
  }
});

// ---------- 試合セットアップ画面 ----------

function defaultSetupData() {
  return { date: new Date().toISOString().slice(0, 10), opponent: '', lineup: [] };
}

function openSetup() {
  if (unsubscribeSetup) unsubscribeSetup();
  unsubscribeSetup = onSnapshot(setupDraftRef, snap => {
    setupData = snap.exists() ? snap.data() : defaultSetupData();
    renderSetupFields();
    renderSetupPlayerSelect();
    renderSetupLineup();
  });
  showView('view-setup');
}

function renderSetupFields() {
  const dateEl = document.getElementById('setupDate');
  const oppEl = document.getElementById('setupOpponent');
  if (document.activeElement !== dateEl) dateEl.value = setupData.date || new Date().toISOString().slice(0, 10);
  if (document.activeElement !== oppEl) oppEl.value = setupData.opponent || '';
}

document.getElementById('setupDate').addEventListener('change', e => {
  setDoc(setupDraftRef, { date: e.target.value }, { merge: true });
});

document.getElementById('setupOpponent').addEventListener('change', e => {
  setDoc(setupDraftRef, { opponent: e.target.value.trim() }, { merge: true });
});

function renderSetupPlayerSelect() {
  const sel = document.getElementById('setupPlayerSelect');
  const lineup = (setupData && setupData.lineup) || [];
  const inLineupIds = new Set(lineup.map(l => l.playerId));
  const available = players.filter(p => !inLineupIds.has(p.id));
  if (available.length === 0) {
    sel.innerHTML = '<option value="">(追加できる選手がいません)</option>';
    return;
  }
  sel.innerHTML = available.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name)}${p.number ? (' #' + escapeHtml(p.number)) : ''}</option>`
  ).join('');
}

async function addToSetupLineup(player, position) {
  await runTransaction(db, async tx => {
    const snap = await tx.get(setupDraftRef);
    const data = snap.exists() ? snap.data() : defaultSetupData();
    const lineup = [...(data.lineup || []), {
      slot: (data.lineup || []).length + 1, playerId: player.id, playerName: player.name, playerNumber: player.number, position
    }];
    tx.set(setupDraftRef, { ...data, lineup });
  });
}

document.getElementById('btnAddLineup').addEventListener('click', () => {
  const sel = document.getElementById('setupPlayerSelect');
  const posSel = document.getElementById('setupPositionSelect');
  const pid = sel.value;
  if (!pid) return;
  const p = players.find(pl => pl.id === pid);
  if (!p) return;
  addToSetupLineup(p, posSel.value);
});

function renderSetupLineup() {
  const list = document.getElementById('setupLineupList');
  const lineup = (setupData && setupData.lineup) || [];
  if (lineup.length === 0) {
    list.innerHTML = '<p class="empty">打順に選手を追加してください</p>';
    return;
  }
  list.innerHTML = lineup.map((l, idx) => `
    <div class="list-row">
      <div class="list-row-main">${l.slot}番 ${escapeHtml(l.playerName)}${l.playerNumber ? (' #' + escapeHtml(l.playerNumber)) : ''} (${escapeHtml(l.position || '')})</div>
      <button class="btn btn-small moveUpBtn" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-small moveDownBtn" data-idx="${idx}" ${idx === lineup.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="btn btn-small btn-danger removeLineupBtn" data-idx="${idx}">削除</button>
    </div>
  `).join('');
}

async function removeFromSetupLineup(idx) {
  await runTransaction(db, async tx => {
    const snap = await tx.get(setupDraftRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const lineup = [...(data.lineup || [])];
    lineup.splice(idx, 1);
    lineup.forEach((l, i) => l.slot = i + 1);
    tx.set(setupDraftRef, { ...data, lineup });
  });
}

async function moveSetupLineup(idx, dir) {
  await runTransaction(db, async tx => {
    const snap = await tx.get(setupDraftRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const lineup = [...(data.lineup || [])];
    const j = idx + dir;
    if (j < 0 || j >= lineup.length) return;
    [lineup[idx], lineup[j]] = [lineup[j], lineup[idx]];
    lineup.forEach((l, i) => l.slot = i + 1);
    tx.set(setupDraftRef, { ...data, lineup });
  });
}

document.getElementById('setupLineupList').addEventListener('click', e => {
  const idx = Number(e.target.dataset.idx);
  if (Number.isNaN(idx)) return;
  if (e.target.classList.contains('removeLineupBtn')) {
    removeFromSetupLineup(idx);
  } else if (e.target.classList.contains('moveUpBtn')) {
    moveSetupLineup(idx, -1);
  } else if (e.target.classList.contains('moveDownBtn')) {
    moveSetupLineup(idx, 1);
  }
});

document.getElementById('btnStartGame').addEventListener('click', async () => {
  const lineup = (setupData && setupData.lineup) || [];
  if (lineup.length === 0) {
    alert('打順に選手を1人以上追加してください');
    return;
  }
  const date = (setupData && setupData.date) || new Date().toISOString().slice(0, 10);
  const opponent = (setupData && setupData.opponent) || '';
  const gameData = {
    date, opponent,
    lineup: lineup.map(l => ({ ...l })),
    participants: lineup.map(l => ({ playerId: l.playerId, playerName: l.playerName, playerNumber: l.playerNumber })),
    currentBatterIndex: 0,
    events: []
  };
  const ref = await addDoc(gamesCol, gameData);
  await deleteDoc(setupDraftRef);
  openGame(ref.id);
});

// ---------- 試合詳細・ライブ入力画面 ----------

function getCurrentGame() {
  return currentGameData;
}

function openGame(id) {
  currentGameId = id;
  if (unsubscribeGame) unsubscribeGame();
  unsubscribeGame = onSnapshot(doc(db, 'games', id), snap => {
    currentGameData = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    renderGame();
  });
  showView('view-game');
}

function renderGame() {
  const game = getCurrentGame();
  if (!game) return;
  document.getElementById('gameHeaderInfo').innerHTML =
    `<h2>${escapeHtml(game.date)} vs ${escapeHtml(game.opponent || '(相手未設定)')}</h2>`;

  const batter = game.lineup[game.currentBatterIndex];
  document.getElementById('currentBatterName').textContent = batter
    ? `${batter.slot}番 ${batter.playerName}${batter.playerNumber ? (' #' + batter.playerNumber) : ''}`
    : '-';

  renderLineupDisplay(game);
  renderEventLog(game);
}

function renderLineupDisplay(game) {
  const el = document.getElementById('lineupDisplay');
  el.innerHTML = game.lineup.map((l, idx) => `
    <div class="list-row ${idx === game.currentBatterIndex ? 'current-batter-row' : ''}">
      <div class="list-row-main">${l.slot}番 ${escapeHtml(l.playerName)}${l.playerNumber ? (' #' + escapeHtml(l.playerNumber)) : ''} (${escapeHtml(l.position || '')})</div>
      <button class="btn btn-small subBtn" data-idx="${idx}">交代</button>
    </div>
  `).join('');
}

document.getElementById('lineupDisplay').addEventListener('click', e => {
  if (e.target.classList.contains('subBtn')) {
    openSubstitutionModal(Number(e.target.dataset.idx));
  }
});

function openSubstitutionModal(slotIdx) {
  const game = getCurrentGame();
  const currentIds = new Set(game.lineup.map(l => l.playerId));
  const candidates = players.filter(p => !currentIds.has(p.id));
  if (candidates.length === 0) {
    modalBox.innerHTML = `<p>交代できる選手がいません（全選手が出場中です）</p><button class="btn btn-block" id="modalCancel">閉じる</button>`;
  } else {
    modalBox.innerHTML = `<h3>交代する選手を選択</h3>` +
      candidates.map(p => `<button class="btn btn-block pickPlayerBtn" data-id="${p.id}">${escapeHtml(p.name)}${p.number ? (' #' + escapeHtml(p.number)) : ''}</button>`).join('') +
      `<button class="btn btn-block" id="modalCancel">キャンセル</button>`;
  }
  showModal();
  modalBox.querySelectorAll('.pickPlayerBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = players.find(pl => pl.id === btn.dataset.id);
      closeModal();
      await updateGameInTransaction(currentGameId, data => {
        const lineup = data.lineup.map((l, i) => i === slotIdx
          ? { slot: l.slot, playerId: p.id, playerName: p.name, playerNumber: p.number, position: l.position }
          : l);
        let participants = data.participants || [];
        if (!participants.some(pp => pp.playerId === p.id)) {
          participants = [...participants, { playerId: p.id, playerName: p.name, playerNumber: p.number }];
        }
        return { lineup, participants };
      });
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

document.getElementById('outcomeButtons').addEventListener('click', e => {
  const type = e.target.dataset.type;
  if (!type) return;
  openRbiModal(type);
});

function openRbiModal(type) {
  const game = getCurrentGame();
  const batter = game.lineup[game.currentBatterIndex];
  modalBox.innerHTML = `<h3>${escapeHtml(batter.playerName)} - ${OUTCOME_LABELS[type]}</h3><p>打点は？</p>` +
    [0, 1, 2, 3, 4].map(n => `<button class="btn btn-block rbiBtn" data-n="${n}">${n}点</button>`).join('') +
    `<button class="btn btn-block" id="modalCancel">キャンセル</button>`;
  showModal();
  modalBox.querySelectorAll('.rbiBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rbi = Number(btn.dataset.n);
      closeModal();
      finalizeAtBat(type, rbi);
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

async function finalizeAtBat(type, rbi) {
  await updateGameInTransaction(currentGameId, data => {
    const batter = data.lineup[data.currentBatterIndex];
    const events = [...(data.events || []), {
      id: uid(), playerId: batter.playerId, playerName: batter.playerName, playerNumber: batter.playerNumber,
      type, rbi, ts: Date.now()
    }];
    const currentBatterIndex = (data.currentBatterIndex + 1) % data.lineup.length;
    return { events, currentBatterIndex };
  });
}

document.getElementById('btnSteal').addEventListener('click', () => openParticipantPicker('steal'));
document.getElementById('btnError').addEventListener('click', () => openParticipantPicker('error'));

function openParticipantPicker(type) {
  const game = getCurrentGame();
  modalBox.innerHTML = `<h3>${type === 'steal' ? '盗塁' : 'エラー'} - 選手を選択</h3>` +
    game.participants.map(p => `<button class="btn btn-block pickPlayerBtn" data-id="${p.playerId}">${escapeHtml(p.playerName)}${p.playerNumber ? (' #' + escapeHtml(p.playerNumber)) : ''}</button>`).join('') +
    `<button class="btn btn-block" id="modalCancel">キャンセル</button>`;
  showModal();
  modalBox.querySelectorAll('.pickPlayerBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = game.participants.find(pp => pp.playerId === btn.dataset.id);
      closeModal();
      recordParticipantEvent(type, p);
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

async function recordParticipantEvent(type, participant) {
  await updateGameInTransaction(currentGameId, data => {
    const events = [...(data.events || []), {
      id: uid(), playerId: participant.playerId, playerName: participant.playerName, playerNumber: participant.playerNumber,
      type, rbi: null, ts: Date.now()
    }];
    return { events };
  });
}

document.getElementById('btnUndo').addEventListener('click', async () => {
  const game = getCurrentGame();
  if (!game.events || game.events.length === 0) return;
  const last = game.events[game.events.length - 1];
  if (!confirm(`直前の記録（${last.playerName} - ${OUTCOME_LABELS[last.type]}）を取り消しますか？`)) return;
  await updateGameInTransaction(currentGameId, data => {
    const events = [...(data.events || [])];
    if (events.length === 0) return null;
    const removed = events.pop();
    let currentBatterIndex = data.currentBatterIndex;
    if (AT_BAT_TYPES.includes(removed.type)) {
      currentBatterIndex = (currentBatterIndex - 1 + data.lineup.length) % data.lineup.length;
    }
    return { events, currentBatterIndex };
  });
});

function renderEventLog(game) {
  const el = document.getElementById('eventLog');
  const events = game.events || [];
  if (events.length === 0) {
    el.innerHTML = '<p class="empty">記録がありません</p>';
    return;
  }
  const rows = [...events].reverse();
  el.innerHTML = rows.map(ev => `
    <div class="list-row">
      <div class="list-row-main">
        ${escapeHtml(ev.playerName)} -
        <select class="editTypeSelect" data-id="${ev.id}">
          ${Object.keys(OUTCOME_LABELS).map(k => `<option value="${k}" ${k === ev.type ? 'selected' : ''}>${OUTCOME_LABELS[k]}</option>`).join('')}
        </select>
        ${AT_BAT_TYPES.includes(ev.type) ? `<input type="number" class="editRbiInput" data-id="${ev.id}" min="0" max="4" value="${ev.rbi ?? 0}">打点` : ''}
      </div>
      <button class="btn btn-small btn-danger deleteEventBtn" data-id="${ev.id}">削除</button>
    </div>
  `).join('');
}

document.getElementById('eventLog').addEventListener('change', async e => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('editTypeSelect')) {
    const newType = e.target.value;
    await updateGameInTransaction(currentGameId, data => {
      const events = (data.events || []).map(ev => {
        if (ev.id !== id) return ev;
        const nowAtBat = AT_BAT_TYPES.includes(newType);
        return { ...ev, type: newType, rbi: nowAtBat ? (ev.rbi ?? 0) : null };
      });
      return { events };
    });
  }
  if (e.target.classList.contains('editRbiInput')) {
    const rbi = Number(e.target.value);
    await updateGameInTransaction(currentGameId, data => {
      const events = (data.events || []).map(ev => ev.id === id ? { ...ev, rbi } : ev);
      return { events };
    });
  }
});

document.getElementById('eventLog').addEventListener('click', async e => {
  if (e.target.classList.contains('deleteEventBtn')) {
    const id = e.target.dataset.id;
    if (!confirm('この記録を削除しますか？')) return;
    await updateGameInTransaction(currentGameId, data => {
      const events = (data.events || []).filter(ev => ev.id !== id);
      return { events };
    });
  }
});

document.getElementById('btnDeleteGame').addEventListener('click', async () => {
  if (!confirm('この試合を削除しますか？元に戻せません。')) return;
  const gameId = currentGameId;
  showView('view-home');
  await deleteDoc(doc(db, 'games', gameId));
});

// ---------- 集計・CSV出力画面 ----------

function renderAggregateList() {
  const el = document.getElementById('aggregateGameList');
  if (games.length === 0) {
    el.innerHTML = '<p class="empty">試合がありません</p>';
    return;
  }
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = sorted.map(g => `
    <label class="list-row checkbox-row">
      <input type="checkbox" class="aggGameCheck" data-id="${g.id}" checked>
      ${escapeHtml(g.date)} vs ${escapeHtml(g.opponent || '(相手未設定)')}
    </label>
  `).join('');
}

document.getElementById('btnGenerateCsv').addEventListener('click', () => {
  const checked = [...document.querySelectorAll('.aggGameCheck:checked')].map(c => c.dataset.id);
  const selectedGames = games.filter(g => checked.includes(g.id));
  if (selectedGames.length === 0) {
    alert('試合を1つ以上選択してください');
    return;
  }
  downloadCsv(buildCsv(selectedGames));
});

function buildCsv(selectedGames) {
  const statsByPlayer = {};
  function ensure(pid, name, number) {
    if (!statsByPlayer[pid]) {
      statsByPlayer[pid] = {
        name, number, games: 0, pa: 0, single: 0, double: 0, triple: 0, homerun: 0,
        walk: 0, hbp: 0, strikeout: 0, out: 0, rbi: 0, steal: 0, error: 0
      };
    }
    return statsByPlayer[pid];
  }

  selectedGames.forEach(game => {
    (game.participants || []).forEach(p => {
      ensure(p.playerId, p.playerName, p.playerNumber).games++;
    });
    (game.events || []).forEach(ev => {
      const s = ensure(ev.playerId, ev.playerName, ev.playerNumber);
      switch (ev.type) {
        case 'single': s.pa++; s.single++; s.rbi += ev.rbi || 0; break;
        case 'double': s.pa++; s.double++; s.rbi += ev.rbi || 0; break;
        case 'triple': s.pa++; s.triple++; s.rbi += ev.rbi || 0; break;
        case 'homerun': s.pa++; s.homerun++; s.rbi += ev.rbi || 0; break;
        case 'walk': s.pa++; s.walk++; s.rbi += ev.rbi || 0; break;
        case 'hbp': s.pa++; s.hbp++; s.rbi += ev.rbi || 0; break;
        case 'strikeout': s.pa++; s.strikeout++; s.rbi += ev.rbi || 0; break;
        case 'out': s.pa++; s.out++; s.rbi += ev.rbi || 0; break;
        case 'steal': s.steal++; break;
        case 'error': s.error++; break;
      }
    });
  });

  const header = ['選手名', '背番号', '試合数', '打席', '打数', '安打', '二塁打', '三塁打', '本塁打', '四球', '死球', '三振', '打点', '盗塁', 'エラー', '打率', '出塁率', '長打率', 'OPS'];
  const rows = Object.values(statsByPlayer).map(s => {
    const hits = s.single + s.double + s.triple + s.homerun;
    const ab = s.pa - s.walk - s.hbp;
    const tb = s.single + s.double * 2 + s.triple * 3 + s.homerun * 4;
    const avg = ab > 0 ? hits / ab : 0;
    const obp = s.pa > 0 ? (hits + s.walk + s.hbp) / s.pa : 0;
    const slg = ab > 0 ? tb / ab : 0;
    const ops = obp + slg;
    return [
      s.name, s.number || '', s.games, s.pa, ab, hits, s.double, s.triple, s.homerun,
      s.walk, s.hbp, s.strikeout, s.rbi, s.steal, s.error,
      avg.toFixed(3), obp.toFixed(3), slg.toFixed(3), ops.toFixed(3)
    ];
  });

  const escapeCsv = v => {
    const str = String(v);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  return [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
}

function downloadCsv(csvString) {
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  a.href = url;
  a.download = `成績集計_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- 初期化 ----------

showView('view-home');
