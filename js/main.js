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
  const lobbyBanner = document.getElementById('lobbyBanner');

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

  // Session
  let myPlayerId = 'p_' + Math.random().toString(36).substring(2, 8);
  let isSoloMode = false;
  let matchInterval = null;
  window.isUserHolding = false;

  // --- 1. SETUP PALETTE & STORAGE ---
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

  // --- 3. AUDIO CONTROLS ---
  function updateMuteButton() {
    btnMute.textContent = window.soundManager.isMuted ? '🔇' : '🔊';
  }
  updateMuteButton();

  btnMute.addEventListener('click', () => {
    window.soundManager.toggleMute();
    updateMuteButton();
  });

  // --- 4. LOBBY LIST ---
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

  // --- 5. HOSTING ---
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

  btnAddBot.addEventListener('click', () => {
    if (game.players.size >= 8) return;
    const bot = game.addBot();
    refreshLobbyPlayersList();

    window.networkManager.broadcast({
      type: 'PLAYER_JOINED',
      player: bot
    });
  });

  function setupHostNetworkHandlers() {
    // Bot events replicate directly to all connected clients
    game.onBotExpandStart = (botId, x, y) => {
      window.networkManager.broadcast({
        type: 'EXPAND_START',
        playerId: botId,
        x,
        y
      });
    };

    game.onBotExpandStop = (botId, territory) => {
      window.networkManager.broadcast({
        type: 'EXPAND_RELEASE',
        playerId: botId,
        territory
      });
    };

    game.onPlayerPop = (playerId, x, y, r) => {
      window.networkManager.broadcast({
        type: 'PLAYER_POPPED',
        playerId,
        x,
        y,
        r
      });
    };

    // Client requests to join
    window.networkManager.on('JOIN_REQUEST', (msg) => {
      const player = msg.player;
      player.peerId = msg.fromPeerId;
      game.addOrUpdatePlayer(player);
      refreshLobbyPlayersList();

      // Accept client and send current state
      window.networkManager.sendTo(msg.fromPeerId, {
        type: 'JOIN_ACCEPTED',
        gameState: {
          players: Array.from(game.players.values()),
          territories: game.territories,
          duration: parseInt(matchDurationSelect.value, 10)
        }
      });

      // Notify other clients
      window.networkManager.broadcast({
        type: 'PLAYER_JOINED',
        player
      }, msg.fromPeerId);
    });

    window.networkManager.on('PLAYER_LEFT', (msg) => {
      for (const [id, p] of game.players.entries()) {
        if (p.peerId === msg.peerId) {
          game.removePlayer(id);
          break;
        }
      }
      refreshLobbyPlayersList();
      window.networkManager.broadcast({
        type: 'PLAYER_LEFT',
        peerId: msg.peerId
      });
    });

    // Client starts expansion
    window.networkManager.on('EXPAND_START', (msg) => {
      game.startExpand(msg.playerId, msg.x, msg.y);
      // Replicate to all other clients
      window.networkManager.broadcast({
        type: 'EXPAND_START',
        playerId: msg.playerId,
        x: msg.x,
        y: msg.y
      }, msg.fromPeerId);
    });

    // Client releases expansion -> Host authoritatively locks territory
    window.networkManager.on('REQUEST_RELEASE', (msg) => {
      const territory = game.releaseExpand(msg.playerId);
      // Broadcast release event (with territory if successfully claimed) to ALL clients
      window.networkManager.broadcast({
        type: 'EXPAND_RELEASE',
        playerId: msg.playerId,
        territory
      });
    });
  }

  // --- 6. JOINING ---
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

      game.initLocalPlayer({
        id: myPlayerId,
        peerId: window.networkManager.myId,
        name,
        color: selectedColor,
        isHost: false
      });

      hudRoomCode.textContent = code;

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
    window.networkManager.on('PLAYER_JOINED', (msg) => {
      game.addOrUpdatePlayer(msg.player);
    });

    window.networkManager.on('PLAYER_LEFT', (msg) => {
      for (const [id, p] of game.players.entries()) {
        if (p.peerId === msg.peerId) {
          game.removePlayer(id);
          break;
        }
      }
    });

    window.networkManager.on('GAME_START', (msg) => {
      startMatchSequence(msg.duration);
    });

    window.networkManager.on('EXPAND_START', (msg) => {
      if (msg.playerId !== myPlayerId) {
        game.startExpand(msg.playerId, msg.x, msg.y);
      }
    });

    window.networkManager.on('EXPAND_RELEASE', (msg) => {
      game.stopExpand(msg.playerId);
      if (msg.territory) {
        game.claimTerritory(msg.territory);
      }
    });

    window.networkManager.on('PLAYER_POPPED', (msg) => {
      game.popPlayer(msg.playerId, msg.x, msg.y, msg.r);
      if (msg.playerId === myPlayerId) {
        window.isUserHolding = false;
      }
    });

    window.networkManager.on('TIME_SYNC', (msg) => {
      game.timeRemaining = msg.time;
      if (msg.scores) game.coverageStats = msg.scores;
      updateHudDisplay();
    });

    window.networkManager.on('GAME_OVER', (msg) => {
      concludeMatch(msg.results);
    });

    function handleHostDeparture(reason) {
      showLobbyNotice(reason);
      if (window.networkManager) {
        window.networkManager.destroy();
      }
      returnToLobby();
      switchTab('join');
    }

    window.networkManager.on('HOST_CLOSED_ROOM', (msg) => {
      handleHostDeparture(msg.message || 'Host ended the match. Returned to main menu.');
    });

    window.networkManager.on('HOST_DISCONNECTED', (msg) => {
      handleHostDeparture(msg.message || 'Host disconnected. Returned to main menu.');
    });
  }

  // --- 7. SOLO PRACTICE ---
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

    game.addBot();
    game.addBot();

    hudRoomCode.textContent = 'PRACTICE';
    startMatchSequence(60);
  });

  // --- 8. MATCH SEQUENCE & TIMER ---
  btnStartGame.addEventListener('click', () => {
    const duration = parseInt(matchDurationSelect.value, 10) || 60;
    window.networkManager.broadcast({
      type: 'GAME_START',
      duration
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

        if (isSoloMode || window.networkManager.isHost) {
          startHostGameTimer();
        }
      }
    }, 1000);
  }

  function startHostGameTimer() {
    if (matchInterval) clearInterval(matchInterval);

    matchInterval = setInterval(() => {
      if (game.state !== 'PLAYING') return;

      game.timeRemaining--;
      updateHudDisplay();

      // Host periodically syncs time and scores to clients
      if (!isSoloMode && window.networkManager && window.networkManager.isHost) {
        window.networkManager.broadcast({
          type: 'TIME_SYNC',
          time: game.timeRemaining,
          scores: game.coverageStats
        });
      }

      if (game.timeRemaining <= 0) {
        clearInterval(matchInterval);
        game.updateCoverage();

        const results = computeRankings();

        if (!isSoloMode && window.networkManager && window.networkManager.isHost) {
          window.networkManager.broadcast({
            type: 'GAME_OVER',
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

    const canRestart = isSoloMode || (window.networkManager && window.networkManager.isHost);
    btnPlayAgain.style.display = canRestart ? 'flex' : 'none';
  }

  btnPlayAgain.addEventListener('click', () => {
    const duration = parseInt(matchDurationSelect.value, 10) || 60;
    if (!isSoloMode && window.networkManager.isHost) {
      window.networkManager.broadcast({
        type: 'GAME_START',
        duration
      });
    }
    startMatchSequence(duration);
  });

  function showLobbyNotice(msg) {
    if (lobbyBanner) {
      lobbyBanner.textContent = `ℹ️ ${msg}`;
      lobbyBanner.style.display = 'block';
      setTimeout(() => {
        lobbyBanner.style.display = 'none';
      }, 7000);
    }
  }

  btnReturnLobby.addEventListener('click', handleUserLeaveMatch);
  btnExit.addEventListener('click', () => {
    if (confirm('Leave current match and return to lobby?')) {
      handleUserLeaveMatch();
    }
  });

  function handleUserLeaveMatch() {
    if (!isSoloMode && window.networkManager && window.networkManager.isConnected) {
      if (window.networkManager.isHost) {
        // Host broadcasts to all clients that room is closing
        window.networkManager.broadcast({
          type: 'HOST_CLOSED_ROOM',
          message: 'The host has ended the match.'
        });
      }
      setTimeout(() => {
        if (window.networkManager) {
          window.networkManager.destroy();
        }
      }, 50);
    }
    returnToLobby();
  }

  // Handle browser tab / window closure
  window.addEventListener('beforeunload', () => {
    if (!isSoloMode && window.networkManager && window.networkManager.isConnected) {
      if (window.networkManager.isHost) {
        window.networkManager.broadcast({
          type: 'HOST_CLOSED_ROOM',
          message: 'The host has left the match.'
        });
      }
      window.networkManager.destroy();
    }
  });

  function returnToLobby() {
    if (matchInterval) clearInterval(matchInterval);
    game.state = 'LOBBY';
    game.reset();
    window.soundManager.stopAllExpands();
    window.isUserHolding = false;

    gameOverScreen.classList.add('hidden');
    gameHud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    btnJoinRoom.disabled = false;
    joinStatus.textContent = '';
    btnCreateRoom.disabled = false;
    btnCreateRoom.textContent = '⚡ Create Room';
    hostSetupView.style.display = 'block';
    hostLobbyView.style.display = 'none';

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

  setInterval(() => {
    if (game.state === 'PLAYING') {
      updateHudDisplay();
    }
  }, 250);

  // --- 10. INPUT HANDLERS ---

  function handleStart(clientX, clientY) {
    if (game.state !== 'PLAYING') return;
    if (window.isUserHolding) return;

    window.isUserHolding = true;
    const pos = game.screenToVirtual(clientX, clientY);

    // 1. Immediately expand locally for 0ms lag
    game.startExpand(myPlayerId, pos.x, pos.y);

    // 2. Broadcast or send to host
    if (!isSoloMode && window.networkManager) {
      if (window.networkManager.isHost) {
        window.networkManager.broadcast({
          type: 'EXPAND_START',
          playerId: myPlayerId,
          x: pos.x,
          y: pos.y
        });
      } else {
        window.networkManager.sendToHost({
          type: 'EXPAND_START',
          playerId: myPlayerId,
          x: pos.x,
          y: pos.y
        });
      }
    }
  }

  function handleRelease() {
    if (!window.isUserHolding) return;
    window.isUserHolding = false;

    if (game.state !== 'PLAYING') return;

    if (isSoloMode) {
      game.releaseExpand(myPlayerId);
    } else if (window.networkManager.isHost) {
      const territory = game.releaseExpand(myPlayerId);
      window.networkManager.broadcast({
        type: 'EXPAND_RELEASE',
        playerId: myPlayerId,
        territory
      });
    } else {
      // Client immediately stops expanding locally
      game.stopExpand(myPlayerId);

      // Client requests authoritative host to release and claim
      window.networkManager.sendToHost({
        type: 'REQUEST_RELEASE',
        playerId: myPlayerId
      });
    }
  }

  // Mouse Listeners
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
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
