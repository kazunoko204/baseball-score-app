const AT_BAT_TYPES = ['single', 'double', 'triple', 'homerun', 'walk', 'hbp', 'strikeout', 'out'];

const OUTCOME_LABELS = {
  single: '単打', double: '二塁打', triple: '三塁打', homerun: '本塁打',
  walk: '四球', hbp: '死球', strikeout: '三振', out: 'その他アウト',
  steal: '盗塁', error: 'エラー'
};

let players = [];
let games = [];
let currentGameId = null;
let setupState = null;

const modalOverlay = document.getElementById('modalOverlay');
const modalBox = document.getElementById('modalBox');

function load() {
  players = JSON.parse(localStorage.getItem('sb_players_v1') || '[]');
  games = JSON.parse(localStorage.getItem('sb_games_v1') || '[]');
}

function savePlayers() {
  localStorage.setItem('sb_players_v1', JSON.stringify(players));
}

function saveGames() {
  localStorage.setItem('sb_games_v1', JSON.stringify(games));
}

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

document.getElementById('gameList').addEventListener('click', e => {
  if (e.target.classList.contains('openGameBtn')) {
    openGame(e.target.dataset.id);
  }
  if (e.target.classList.contains('deleteGameBtn')) {
    if (confirm('この試合を削除しますか？元に戻せません。')) {
      games = games.filter(g => g.id !== e.target.dataset.id);
      saveGames();
      renderHome();
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
        <input type="text" class="edit-number" data-id="${p.id}" value="${escapeHtml(p.number || '')}" placeholder="背番号" style="max-width:5em;">
      </div>
      <button class="btn btn-small btn-danger deletePlayerBtn" data-id="${p.id}">削除</button>
    </div>
  `).join('');
}

document.getElementById('addPlayerForm').addEventListener('submit', e => {
  e.preventDefault();
  const nameInput = document.getElementById('newPlayerName');
  const numberInput = document.getElementById('newPlayerNumber');
  const name = nameInput.value.trim();
  if (!name) return;
  players.push({ id: uid(), name, number: numberInput.value.trim() });
  savePlayers();
  nameInput.value = '';
  numberInput.value = '';
  renderPlayers();
});

document.getElementById('playerList').addEventListener('click', e => {
  if (e.target.classList.contains('deletePlayerBtn')) {
    const id = e.target.dataset.id;
    if (confirm('この選手をマスタから削除しますか？（過去の試合記録は残ります）')) {
      players = players.filter(p => p.id !== id);
      savePlayers();
      renderPlayers();
    }
  }
});

document.getElementById('playerList').addEventListener('change', e => {
  const id = e.target.dataset.id;
  const p = players.find(pl => pl.id === id);
  if (!p) return;
  if (e.target.classList.contains('edit-name')) p.name = e.target.value.trim();
  if (e.target.classList.contains('edit-number')) p.number = e.target.value.trim();
  savePlayers();
});

// ---------- 試合セットアップ画面 ----------

function openSetup() {
  setupState = { lineup: [] };
  document.getElementById('setupDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('setupOpponent').value = '';
  renderSetupPlayerSelect();
  renderSetupLineup();
  showView('view-setup');
}

function renderSetupPlayerSelect() {
  const sel = document.getElementById('setupPlayerSelect');
  const inLineupIds = new Set(setupState.lineup.map(l => l.playerId));
  const available = players.filter(p => !inLineupIds.has(p.id));
  if (available.length === 0) {
    sel.innerHTML = '<option value="">(追加できる選手がいません)</option>';
    return;
  }
  sel.innerHTML = available.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name)}${p.number ? (' #' + escapeHtml(p.number)) : ''}</option>`
  ).join('');
}

document.getElementById('btnAddLineup').addEventListener('click', () => {
  const sel = document.getElementById('setupPlayerSelect');
  const pid = sel.value;
  if (!pid) return;
  const p = players.find(pl => pl.id === pid);
  if (!p) return;
  setupState.lineup.push({ slot: setupState.lineup.length + 1, playerId: p.id, playerName: p.name, playerNumber: p.number });
  renderSetupPlayerSelect();
  renderSetupLineup();
});

function renderSetupLineup() {
  const list = document.getElementById('setupLineupList');
  if (setupState.lineup.length === 0) {
    list.innerHTML = '<p class="empty">打順に選手を追加してください</p>';
    return;
  }
  list.innerHTML = setupState.lineup.map((l, idx) => `
    <div class="list-row">
      <div class="list-row-main">${l.slot}番 ${escapeHtml(l.playerName)}${l.playerNumber ? (' #' + escapeHtml(l.playerNumber)) : ''}</div>
      <button class="btn btn-small moveUpBtn" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-small moveDownBtn" data-idx="${idx}" ${idx === setupState.lineup.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="btn btn-small btn-danger removeLineupBtn" data-idx="${idx}">削除</button>
    </div>
  `).join('');
}

document.getElementById('setupLineupList').addEventListener('click', e => {
  const idx = Number(e.target.dataset.idx);
  if (Number.isNaN(idx)) return;
  if (e.target.classList.contains('removeLineupBtn')) {
    setupState.lineup.splice(idx, 1);
  } else if (e.target.classList.contains('moveUpBtn') && idx > 0) {
    [setupState.lineup[idx - 1], setupState.lineup[idx]] = [setupState.lineup[idx], setupState.lineup[idx - 1]];
  } else if (e.target.classList.contains('moveDownBtn') && idx < setupState.lineup.length - 1) {
    [setupState.lineup[idx + 1], setupState.lineup[idx]] = [setupState.lineup[idx], setupState.lineup[idx + 1]];
  } else {
    return;
  }
  setupState.lineup.forEach((l, i) => l.slot = i + 1);
  renderSetupPlayerSelect();
  renderSetupLineup();
});

document.getElementById('btnStartGame').addEventListener('click', () => {
  const date = document.getElementById('setupDate').value || new Date().toISOString().slice(0, 10);
  const opponent = document.getElementById('setupOpponent').value.trim();
  if (setupState.lineup.length === 0) {
    alert('打順に選手を1人以上追加してください');
    return;
  }
  const game = {
    id: uid(),
    date, opponent,
    lineup: setupState.lineup.map(l => ({ ...l })),
    participants: setupState.lineup.map(l => ({ playerId: l.playerId, playerName: l.playerName, playerNumber: l.playerNumber })),
    currentBatterIndex: 0,
    events: []
  };
  games.push(game);
  saveGames();
  openGame(game.id);
});

// ---------- 試合詳細・ライブ入力画面 ----------

function getCurrentGame() {
  return games.find(g => g.id === currentGameId);
}

function openGame(id) {
  currentGameId = id;
  renderGame();
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
      <div class="list-row-main">${l.slot}番 ${escapeHtml(l.playerName)}${l.playerNumber ? (' #' + escapeHtml(l.playerNumber)) : ''}</div>
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
    btn.addEventListener('click', () => {
      const p = players.find(pl => pl.id === btn.dataset.id);
      game.lineup[slotIdx].playerId = p.id;
      game.lineup[slotIdx].playerName = p.name;
      game.lineup[slotIdx].playerNumber = p.number;
      if (!game.participants.some(pp => pp.playerId === p.id)) {
        game.participants.push({ playerId: p.id, playerName: p.name, playerNumber: p.number });
      }
      saveGames();
      closeModal();
      renderGame();
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

document.getElementById('outcomeButtons').addEventListener('click', e => {
  const type = e.target.dataset.type;
  if (!type) return;
  const game = getCurrentGame();
  const batter = game.lineup[game.currentBatterIndex];
  openRbiModal(type, batter);
});

function openRbiModal(type, batter) {
  modalBox.innerHTML = `<h3>${escapeHtml(batter.playerName)} - ${OUTCOME_LABELS[type]}</h3><p>打点は？</p>` +
    [0, 1, 2, 3, 4].map(n => `<button class="btn btn-block rbiBtn" data-n="${n}">${n}点</button>`).join('') +
    `<button class="btn btn-block" id="modalCancel">キャンセル</button>`;
  showModal();
  modalBox.querySelectorAll('.rbiBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      finalizeAtBat(type, Number(btn.dataset.n), batter);
      closeModal();
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

function finalizeAtBat(type, rbi, batter) {
  const game = getCurrentGame();
  game.events.push({
    id: uid(), playerId: batter.playerId, playerName: batter.playerName, playerNumber: batter.playerNumber,
    type, rbi, ts: Date.now()
  });
  game.currentBatterIndex = (game.currentBatterIndex + 1) % game.lineup.length;
  saveGames();
  renderGame();
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
      game.events.push({ id: uid(), playerId: p.playerId, playerName: p.playerName, playerNumber: p.playerNumber, type, rbi: null, ts: Date.now() });
      saveGames();
      closeModal();
      renderGame();
    });
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
}

document.getElementById('btnUndo').addEventListener('click', () => {
  const game = getCurrentGame();
  if (game.events.length === 0) return;
  const last = game.events[game.events.length - 1];
  if (!confirm(`直前の記録（${last.playerName} - ${OUTCOME_LABELS[last.type]}）を取り消しますか？`)) return;
  game.events.pop();
  if (AT_BAT_TYPES.includes(last.type)) {
    game.currentBatterIndex = (game.currentBatterIndex - 1 + game.lineup.length) % game.lineup.length;
  }
  saveGames();
  renderGame();
});

function renderEventLog(game) {
  const el = document.getElementById('eventLog');
  if (game.events.length === 0) {
    el.innerHTML = '<p class="empty">記録がありません</p>';
    return;
  }
  const rows = game.events.map((ev, idx) => ({ ev, idx })).reverse();
  el.innerHTML = rows.map(({ ev, idx }) => `
    <div class="list-row">
      <div class="list-row-main">
        ${escapeHtml(ev.playerName)} -
        <select class="editTypeSelect" data-idx="${idx}">
          ${Object.keys(OUTCOME_LABELS).map(k => `<option value="${k}" ${k === ev.type ? 'selected' : ''}>${OUTCOME_LABELS[k]}</option>`).join('')}
        </select>
        ${AT_BAT_TYPES.includes(ev.type) ? `<input type="number" class="editRbiInput" data-idx="${idx}" min="0" max="4" value="${ev.rbi ?? 0}">打点` : ''}
      </div>
      <button class="btn btn-small btn-danger deleteEventBtn" data-idx="${idx}">削除</button>
    </div>
  `).join('');
}

document.getElementById('eventLog').addEventListener('change', e => {
  const idx = Number(e.target.dataset.idx);
  const game = getCurrentGame();
  const ev = game.events[idx];
  if (!ev) return;
  if (e.target.classList.contains('editTypeSelect')) {
    const nowAtBat = AT_BAT_TYPES.includes(e.target.value);
    ev.type = e.target.value;
    ev.rbi = nowAtBat ? (ev.rbi ?? 0) : null;
    saveGames();
    renderGame();
  }
  if (e.target.classList.contains('editRbiInput')) {
    ev.rbi = Number(e.target.value);
    saveGames();
  }
});

document.getElementById('eventLog').addEventListener('click', e => {
  if (e.target.classList.contains('deleteEventBtn')) {
    const idx = Number(e.target.dataset.idx);
    const game = getCurrentGame();
    if (!confirm('この記録を削除しますか？')) return;
    game.events.splice(idx, 1);
    saveGames();
    renderGame();
  }
});

document.getElementById('btnDeleteGame').addEventListener('click', () => {
  if (!confirm('この試合を削除しますか？元に戻せません。')) return;
  games = games.filter(g => g.id !== currentGameId);
  saveGames();
  showView('view-home');
  renderHome();
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
    game.participants.forEach(p => {
      ensure(p.playerId, p.playerName, p.playerNumber).games++;
    });
    game.events.forEach(ev => {
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

load();
renderHome();
showView('view-home');
