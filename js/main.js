/**
 * Circle Clash - Main Controller
 * Coordinates UI, User Input, Networking, and Game Loop.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const canvas = document.getElementById('gameCanvas');
  const gameHud = document.getElementById('gameHud');
  const lobbyScreen = document.getElementById('lobbyScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');

  const playerNameInput = document.getElementById('playerNameInput');
  const colorPicker = document.getElementById('colorPicker');

  const tabHost = document.getElementById('tabHost');
  const tabJoin = document.getElementById('tabJoin');
  const tabSolo = document.getElementById('tabSolo');
  const panelHost = document.getElementById('panelHost');
  const panelJoin = document.getElementById('panelJoin');
  const panelSolo = document.getElementById('panelSolo');

  const hostSetupView = document.getElementById('hostSetupView');
  const hostLobbyView = document.getElementById('hostLobbyView');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const displayRoomCode = document.getElementById('displayRoomCode');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const lobbyPlayersList = document.getElementById('lobbyPlayersList');
  const playerCount = document.getElementById('playerCount');
  const btnAddBot = document.getElementById('btnAddBot');
  const btnStartGame = document.getElementById('btnStartGame');
  const matchDurationSelect = document.getElementById('matchDuration');

  const roomCodeInput = document.getElementById('roomCodeInput');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const joinStatus = document.getElementById('joinStatus');

  const btnStartSolo = document.getElementById('btnStartSolo');
  const lobbyError = document.getElementById('lobbyError');

  const timerText = document.getElementById('timerText');
  const hudTimer = document.getElementById('hudTimer');
  const hudRoomBadge = document.getElementById('hudRoomBadge');
  const hudRoomCode = document.getElementById('hudRoomCode');
  const territoryBar = document.getElementById('territoryBar');
  const territoryLabels = document.getElementById('territoryLabels');
  const btnMute = document.getElementById('btnMute');
  const btnExit = document.getElementById('btnExit');

  const winnerName = document.getElementById('winnerName');
  const winnerScore = document.getElementById('winnerScore');
  const leaderboardResults = document.getElementById('leaderboardResults');
  const btnPlayAgain = document.getElementById('btnPlayAgain');
  const btnReturnLobby = document.getElementById('btnReturnLobby');

  // Initialize Engine
  const game = new GameEngine(canvas);
  game.startLoop();

  // Colors
  const PALETTE = ['#00f0ff', '#ff0077', '#39ff14', '#ffe600', '#bf00ff', '#ff5722'];
  let selectedColor = PALETTE[0];

  // Current session info
  let myPlayerId = 'p_' + Math.random().toString(36).substring(2, 8);
  let isSoloMode = false;
  let matchInterval = null;
  let isHolding = false;
  let holdVirtualPos = null;

  // --- 1. SETUP PALETTE & LOCAL STORAGE ---
  function initPlayerSetup() {
    const savedName = localStorage.getItem('circle_clash_name');
    playerNameInput.value = savedName || ('Player_' + Math.floor(10 + Math.random() * 90));

    playerNameInput.addEventListener('input', () => {
      localStorage.setItem('circle_clash_name', playerNameInput.value.trim());
    });

    colorPicker.innerHTML = '';
    PALETTE.forEach((color, idx) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-option' + (idx === 0 ? ' selected' : '');
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
        swatch.classList.add('selected');
        selectedColor = color;
      });
      colorPicker.appendChild(swatch);
    });

    // Check URL parameters for direct room join
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      roomCodeInput.value = roomParam.toUpperCase();
      switchTab('join');
    }
  }
  initPlayerSetup();

  // --- 2. TAB SWITCHING ---
  function switchTab(tab) {
    tabHost.classList.toggle('active', tab === 'host');
    tabJoin.classList.toggle('active', tab === 'join');
    tabSolo.classList.toggle('active', tab === 'solo');

    panelHost.style.display = tab === 'host' ? 'block' : 'none';
    panelJoin.style.display = tab === 'join' ? 'block' : 'none';
    panelSolo.style.display = tab === 'solo' ? 'block' : 'none';

    lobbyError.style.display = 'none';
  }

  tabHost.addEventListener('click', () => switchTab('host'));
  tabJoin.addEventListener('click', () => switchTab('join'));
  tabSolo.addEventListener('click', () => switchTab('solo'));

  // --- 3. AUDIO & MUTE CONTROLS ---
  function updateMuteButton() {
    btnMute.textContent = window.soundManager.isMuted ? '🔇' : '🔊';
  }
  updateMuteButton();

  btnMute.addEventListener('click', () => {
    window.soundManager.toggleMute();
    updateMuteButton();
  });

  // --- 4. LOBBY PLAYERS LIST UI ---
  function refreshLobbyPlayersList() {
    lobbyPlayersList.innerHTML = '';
    playerCount.textContent = game.players.size;

    for (const player of game.players.values()) {
      const item = document.createElement('div');
      item.className = 'player-item';

      const left = document.createElement('div');
      left.className = 'player-item-left';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.backgroundColor = player.color;

      const name = document.createElement('span');
      name.textContent = player.name;
      if (player.id === myPlayerId) {
        name.textContent += ' (You)';
      }

      left.appendChild(dot);
      left.appendChild(name);

      const right = document.createElement('div');
      if (player.isHost) {
        const tag = document.createElement('span');
        tag.className = 'badge-tag';
        tag.textContent = 'HOST';
        right.appendChild(tag);
      } else if (player.isBot) {
        const tag = document.createElement('span');
        tag.className = 'badge-tag';
        tag.style.background = 'rgba(255, 255, 255, 0.15)';
        tag.style.color = '#ccc';
        tag.textContent = 'BOT';
        right.appendChild(tag);
      }

      item.appendChild(left);
      item.appendChild(right);
      lobbyPlayersList.appendChild(item);
    }
  }

  // --- 5. HOSTING A GAME ---
  btnCreateRoom.addEventListener('click', async () => {
    const name = playerNameInput.value.trim() || 'Host';
    btnCreateRoom.disabled = true;
    btnCreateRoom.textContent = 'Initializing Room...';
    window.soundManager.init();

    try {
      const res = await window.networkManager.hostGame({
        id: myPlayerId,
        name,
        color: selectedColor,
        isHost: true
      });

      // Update Engine
      game.initLocalPlayer({
        id: myPlayerId,
        peerId: res.peerId,
        name,
        color: selectedColor,
        isHost: true
      });

      displayRoomCode.textContent = res.roomCode;
      hudRoomCode.textContent = res.roomCode;

      hostSetupView.style.display = 'none';
      hostLobbyView.style.display = 'block';
      refreshLobbyPlayersList();

      setupHostNetworkHandlers();
    } catch (err) {
      console.error(err);
      lobbyError.textContent = 'Failed to create room: ' + err.message;
      lobbyError.style.display = 'block';
      btnCreateRoom.disabled = false;
      btnCreateRoom.textContent = '⚡ Create Room';
    }
  });

  // Copy Invite Link
  btnCopyInvite.addEventListener('click', () => {
    const code = displayRoomCode.textContent;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      btnCopyInvite.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyInvite.textContent = '📋 Copy Link'; }, 2000);
    });
  });

  hudRoomBadge.addEventListener('click', () => {
    const code = hudRoomCode.textContent;
    if (code && code !== 'ROOM') {
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      navigator.clipboard.writeText(url).then(() => {
        const original = hudRoomCode.textContent;
        hudRoomCode.textContent = 'COPIED!';
        setTimeout(() => { hudRoomCode.textContent = original; }, 1500);
      });
    }
  });

  // Add Practice Bot (in Host lobby)
  btnAddBot.addEventListener('click', () => {
    if (game.players.size >= 8) return;
    const bot = game.addBot();
    refreshLobbyPlayersList();

    window.networkManager.broadcast({
      type: 'player_joined',
      player: bot
    });
  });

  function setupHostNetworkHandlers() {
    // Replicate bot expansions to all connected clients
    game.onBotExpandStart = (botId, x, y) => {
      window.networkManager.broadcast({
        type: 'expand_started',
        payload: { playerId: botId, x, y }
      });
    };

    game.onBotExpandRelease = (botId, territory) => {
      window.networkManager.broadcast({
        type: 'expand_released',
        payload: { playerId: botId, territory }
      });
    };

    game.onPlayerPopped = (playerId, x, y, r) => {
      window.networkManager.broadcast({
        type: 'expand_popped',
        payload: { playerId, x, y, r }
      });
    };

    window.networkManager.on('client_join_request', ({ peerId, player, sendAccept }) => {
      player.peerId = peerId;
      game.addOrUpdatePlayer(player);
      refreshLobbyPlayersList();

      sendAccept({
        players: Array.from(game.players.values()),
        territories: game.territories,
        duration: parseInt(matchDurationSelect.value, 10)
      });
    });

    window.networkManager.on('player_disconnected', ({ peerId }) => {
      for (const [id, p] of game.players.entries()) {
        if (p.peerId === peerId) {
          game.stopExpandLocally(id);
          game.removePlayer(id);
          break;
        }
      }
      refreshLobbyPlayersList();
    });

    window.networkManager.on('client_start_expand', ({ peerId, data }) => {
      game.startExpand(data.playerId, data.x, data.y);
      window.networkManager.broadcast({
        type: 'expand_started',
        payload: data
      }, peerId);
    });

    window.networkManager.on('client_release_expand', ({ peerId, data }) => {
      const territory = game.releaseExpand(data.playerId);
      // Authoritatively broadcast release event to all clients
      window.networkManager.broadcast({
        type: 'expand_released',
        payload: {
          playerId: data.playerId,
          territory: territory || null
        }
      });
    });
  }

  // --- 6. JOINING A GAME ---
  btnJoinRoom.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code || code.length < 3) {
      joinStatus.textContent = 'Please enter a valid room code.';
      joinStatus.style.color = '#ff3366';
      return;
    }

    const name = playerNameInput.value.trim() || 'Challenger';
    btnJoinRoom.disabled = true;
    joinStatus.textContent = `Connecting to room ${code}...`;
    joinStatus.style.color = 'var(--accent-cyan)';
    window.soundManager.init();

    try {
      const gameState = await window.networkManager.joinGame(code, {
        id: myPlayerId,
        name,
        color: selectedColor,
        isHost: false
      });

      // Initialize game state with host data
      game.initLocalPlayer({
        id: myPlayerId,
        peerId: window.networkManager.myId,
        name,
        color: selectedColor,
        isHost: false
      });

      hudRoomCode.textContent = code;

      // Populate other players
      if (gameState && gameState.players) {
        for (const p of gameState.players) {
          game.addOrUpdatePlayer(p);
        }
      }

      joinStatus.textContent = 'Connected! Waiting for host to start match...';
      setupClientNetworkHandlers();
    } catch (err) {
      console.error(err);
      btnJoinRoom.disabled = false;
      joinStatus.textContent = err.message || 'Connection failed.';
      joinStatus.style.color = '#ff3366';
    }
  });

  function setupClientNetworkHandlers() {
    window.networkManager.on('player_joined', (player) => {
      game.addOrUpdatePlayer(player);
    });

    window.networkManager.on('player_left', ({ peerId }) => {
      for (const [id, p] of game.players.entries()) {
        if (p.peerId === peerId) {
          game.stopExpandLocally(id);
          game.removePlayer(id);
          break;
        }
      }
    });

    window.networkManager.on('game_start', (settings) => {
      startMatchSequence(settings.duration);
    });

    window.networkManager.on('remote_expand_start', (data) => {
      game.startExpand(data.playerId, data.x, data.y);
    });

    window.networkManager.on('remote_expand_release', (payload) => {
      // 1. Immediately stop expanding animation and sound
      game.stopExpandLocally(payload.playerId);
      // 2. Commit territory if claimed
      if (payload.territory) {
        game.commitTerritory(payload.territory);
      }
    });

    window.networkManager.on('remote_expand_pop', (data) => {
      game.popPlayer(data.playerId, data.x, data.y, data.r);
      if (data.playerId === myPlayerId) {
        isHolding = false;
      }
    });

    window.networkManager.on('remote_territory_claimed', (territory) => {
      game.commitTerritory(territory);
    });

    window.networkManager.on('sync_state', (state) => {
      game.timeRemaining = state.timeRemaining;
      game.coverageStats = state.coverageStats;
      if (state.activeExpanding) {
        game.reconcileActiveExpanding(state.activeExpanding);
      }
      updateHudDisplay();
    });

    window.networkManager.on('game_over', (results) => {
      concludeMatch(results);
    });

    window.networkManager.on('host_disconnected', () => {
      alert('Host disconnected from the match.');
      returnToLobby();
    });
  }

  // --- 7. SOLO PRACTICE MODE ---
  btnStartSolo.addEventListener('click', () => {
    isSoloMode = true;
    window.soundManager.init();

    const name = playerNameInput.value.trim() || 'Player';
    game.reset();
    game.players.clear();

    game.initLocalPlayer({
      id: myPlayerId,
      name,
      color: selectedColor,
      isHost: true
    });

    // Add 2 bots for competition
    game.addBot();
    game.addBot();

    hudRoomCode.textContent = 'PRACTICE';
    startMatchSequence(60);
  });

  // --- 8. MATCH SEQUENCE & TIMER ---
  btnStartGame.addEventListener('click', () => {
    const duration = parseInt(matchDurationSelect.value, 10) || 60;
    window.networkManager.broadcast({
      type: 'game_start',
      settings: { duration }
    });
    startMatchSequence(duration);
  });

  function startMatchSequence(duration) {
    lobbyScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');

    game.reset();
    game.state = 'COUNTDOWN';
    game.countdown = 3;
    game.matchDuration = duration;
    game.timeRemaining = duration;

    window.soundManager.playBeep(false);

    const countdownInterval = setInterval(() => {
      game.countdown--;
      if (game.countdown > 0) {
        window.soundManager.playBeep(false);
      } else if (game.countdown === 0) {
        window.soundManager.playBeep(true);
      } else {
        clearInterval(countdownInterval);
        game.state = 'PLAYING';

        // Host handles timer and sync
        if (isSoloMode || window.networkManager.isHost) {
          startHostGameTimer();
        }
      }
    }, 1000);
  }

  let syncInterval = null;

  function startHostGameTimer() {
    if (matchInterval) clearInterval(matchInterval);
    if (syncInterval) clearInterval(syncInterval);

    // Fast state sync (10Hz) to keep expanding circles and coverage aligned
    if (!isSoloMode && window.networkManager && window.networkManager.isHost) {
      syncInterval = setInterval(() => {
        if (game.state !== 'PLAYING') return;

        const activeExpanding = [];
        for (const p of game.players.values()) {
          if (p.expanding) {
            activeExpanding.push({
              playerId: p.id,
              x: Math.round(p.expanding.x),
              y: Math.round(p.expanding.y),
              r: Math.round(p.expanding.r)
            });
          }
        }

        window.networkManager.broadcast({
          type: 'sync_state',
          state: {
            timeRemaining: game.timeRemaining,
            coverageStats: game.coverageStats,
            activeExpanding
          }
        });
      }, 100);
    }

    matchInterval = setInterval(() => {
      if (game.state !== 'PLAYING') return;

      game.timeRemaining--;
      updateHudDisplay();

      if (game.timeRemaining <= 0) {
        clearInterval(matchInterval);
        if (syncInterval) clearInterval(syncInterval);
        game.updateCoverage();

        // Calculate rankings
        const results = computeRankings();

        if (!isSoloMode && window.networkManager && window.networkManager.isHost) {
          window.networkManager.broadcast({
            type: 'game_over',
            results
          });
        }

        concludeMatch(results);
      }
    }, 1000);
  }

  function computeRankings() {
    const ranking = [];
    for (const player of game.players.values()) {
      const pct = parseFloat(game.coverageStats[player.id] || 0);
      ranking.push({
        id: player.id,
        name: player.name,
        color: player.color,
        score: pct
      });
    }
    ranking.sort((a, b) => b.score - a.score);
    return ranking;
  }

  function concludeMatch(rankings) {
    game.state = 'GAME_OVER';
    if (matchInterval) clearInterval(matchInterval);
    if (syncInterval) clearInterval(syncInterval);
    window.soundManager.stopAllExpands();
    window.soundManager.playVictory();

    const winner = rankings[0] || { name: 'Nobody', color: '#fff', score: 0 };
    winnerName.textContent = winner.name;
    winnerName.style.color = winner.color;
    winnerScore.textContent = `Controlled ${winner.score}% of the arena`;

    leaderboardResults.innerHTML = '';
    rankings.forEach((r, rank) => {
      const row = document.createElement('div');
      row.className = 'result-row';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.backgroundColor = r.color;

      const title = document.createElement('span');
      title.textContent = `#${rank + 1} ${r.name}`;

      left.appendChild(dot);
      left.appendChild(title);

      const right = document.createElement('span');
      right.style.fontWeight = '700';
      right.style.color = r.color;
      right.textContent = `${r.score}%`;

      row.appendChild(left);
      row.appendChild(right);
      leaderboardResults.appendChild(row);
    });

    gameOverScreen.classList.remove('hidden');

    // Only host or solo can click Play Again
    const canRestart = isSoloMode || (window.networkManager && window.networkManager.isHost);
    btnPlayAgain.style.display = canRestart ? 'flex' : 'none';
  }

  btnPlayAgain.addEventListener('click', () => {
    const duration = parseInt(matchDurationSelect.value, 10) || 60;
    if (!isSoloMode && window.networkManager.isHost) {
      window.networkManager.broadcast({
        type: 'game_start',
        settings: { duration }
      });
    }
    startMatchSequence(duration);
  });

  btnReturnLobby.addEventListener('click', returnToLobby);
  btnExit.addEventListener('click', () => {
    if (confirm('Leave current match and return to lobby?')) {
      returnToLobby();
    }
  });

  function returnToLobby() {
    if (matchInterval) clearInterval(matchInterval);
    if (syncInterval) clearInterval(syncInterval);
    game.state = 'LOBBY';
    game.reset();
    window.soundManager.stopAllExpands();

    gameOverScreen.classList.add('hidden');
    gameHud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    if (isSoloMode) {
      isSoloMode = false;
    }
  }

  // --- 9. HUD UPDATES ---
  function updateHudDisplay() {
    const mins = Math.floor(game.timeRemaining / 60);
    const secs = game.timeRemaining % 60;
    timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (game.timeRemaining <= 10) {
      hudTimer.classList.add('urgent');
    } else {
      hudTimer.classList.remove('urgent');
    }

    // Update territory bar & labels
    territoryBar.innerHTML = '';
    territoryLabels.innerHTML = '';

    for (const player of game.players.values()) {
      const pct = parseFloat(game.coverageStats[player.id] || 0);

      if (pct > 0) {
        const seg = document.createElement('div');
        seg.className = 'territory-segment';
        seg.style.width = `${pct}%`;
        seg.style.backgroundColor = player.color;
        territoryBar.appendChild(seg);
      }

      const lbl = document.createElement('div');
      lbl.className = 'territory-label-item';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.backgroundColor = player.color;

      const txt = document.createElement('span');
      txt.textContent = `${player.name}: ${pct}%`;

      lbl.appendChild(dot);
      lbl.appendChild(txt);
      territoryLabels.appendChild(lbl);
    }
  }

  // Periodically refresh HUD during render loop
  setInterval(() => {
    if (game.state === 'PLAYING') {
      updateHudDisplay();
    }
  }, 250);

  // --- 10. USER INPUT HANDLERS (MOUSE, TOUCH, KEYBOARD) ---

  function handleStart(clientX, clientY) {
    if (game.state !== 'PLAYING') return;
    if (isHolding) return;

    isHolding = true;
    holdVirtualPos = game.screenToVirtual(clientX, clientY);

    game.startExpand(myPlayerId, holdVirtualPos.x, holdVirtualPos.y);

    if (!isSoloMode && window.networkManager) {
      if (window.networkManager.isHost) {
        window.networkManager.broadcast({
          type: 'expand_started',
          payload: { playerId: myPlayerId, x: holdVirtualPos.x, y: holdVirtualPos.y }
        });
      } else {
        window.networkManager.sendToHost({
          type: 'start_expand',
          payload: { playerId: myPlayerId, x: holdVirtualPos.x, y: holdVirtualPos.y }
        });
      }
    }
  }

  function handleRelease() {
    if (!isHolding) return;
    isHolding = false;

    if (game.state !== 'PLAYING') return;

    if (isSoloMode) {
      game.releaseExpand(myPlayerId);
    } else if (window.networkManager.isHost) {
      const territory = game.releaseExpand(myPlayerId);
      window.networkManager.broadcast({
        type: 'expand_released',
        payload: { playerId: myPlayerId, territory }
      });
    } else {
      // Client immediately stops expanding locally
      game.stopExpandLocally(myPlayerId);

      // Client sends release to host for authoritative territory decision
      window.networkManager.sendToHost({
        type: 'release_expand',
        payload: { playerId: myPlayerId }
      });
    }
  }

  // Mouse Listeners
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
      handleStart(e.clientX, e.clientY);
    }
  });

  window.addEventListener('mouseup', () => {
    handleRelease();
  });

  // Touch Listeners
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    handleRelease();
  });

  window.addEventListener('touchcancel', () => {
    handleRelease();
  });

  // Keyboard Spacebar Listeners
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      // Center of arena or current mouse position
      const center = { x: game.V_WIDTH / 2, y: game.V_HEIGHT / 2 };
      handleStart(window.innerWidth / 2, window.innerHeight / 2);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      handleRelease();
    }
  });
});
