/**
 * AstroClash - Main Controller
 * Coordinates UI, Asteroids Flight Controls, PeerJS WebRTC Networking, and Match Flow.
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
  const scoreboardList = document.getElementById('scoreboardList');
  const btnMute = document.getElementById('btnMute');
  const btnExit = document.getElementById('btnExit');

  const btnTouchLeft = document.getElementById('btnTouchLeft');
  const btnTouchRight = document.getElementById('btnTouchRight');
  const btnTouchThrust = document.getElementById('btnTouchThrust');
  const btnTouchFire = document.getElementById('btnTouchFire');

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
  let syncInterval = null;

  // --- 1. SETUP PALETTE & STORAGE ---
  function initPlayerSetup() {
    const savedName = localStorage.getItem('astro_clash_name');
    playerNameInput.value = savedName || ('Pilot_' + Math.floor(10 + Math.random() * 90));

    playerNameInput.addEventListener('input', () => {
      localStorage.setItem('astro_clash_name', playerNameInput.value.trim());
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
        tag.textContent = 'AI';
        right.appendChild(tag);
      }

      item.appendChild(left);
      item.appendChild(right);
      lobbyPlayersList.appendChild(item);
    }
  }

  // --- 5. HOSTING ---
  btnCreateRoom.addEventListener('click', async () => {
    const name = playerNameInput.value.trim() || 'Host Pilot';
    btnCreateRoom.disabled = true;
    btnCreateRoom.textContent = 'Launching Room...';
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
      btnCreateRoom.textContent = '⚡ Launch Flight Room';
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
    // Laser firing hooks
    game.onFireLaser = (bullet) => {
      window.networkManager.broadcast({
        type: 'REMOTE_LASER_FIRED',
        bullet
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

    // Client sends their updated flight state
    window.networkManager.on('SHIP_SYNC', (msg) => {
      const p = game.players.get(msg.id);
      if (p && !p.isLocal) {
        p.x = msg.x;
        p.y = msg.y;
        p.vx = msg.vx;
        p.vy = msg.vy;
        p.angle = msg.angle;
        p.thrusting = msg.thrusting;
      }
    });

    // Client fires a laser
    window.networkManager.on('CLIENT_FIRE_LASER', (msg) => {
      game.spawnLaserFromRemote(msg.bullet);
      // Multicast to all other clients
      window.networkManager.broadcast({
        type: 'REMOTE_LASER_FIRED',
        bullet: msg.bullet
      }, msg.fromPeerId);
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

    const name = playerNameInput.value.trim() || 'Pilot Challenger';
    btnJoinRoom.disabled = true;
    joinStatus.textContent = `Connecting to flight room ${code}...`;
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

      joinStatus.textContent = 'Connected! Waiting for host to launch battle...';
      setupClientNetworkHandlers();
    } catch (err) {
      console.error(err);
      btnJoinRoom.disabled = false;
      joinStatus.textContent = err.message || 'Connection failed.';
      joinStatus.style.color = '#ff3366';
    }
  });

  function setupClientNetworkHandlers() {
    // When client shoots, send to host
    game.onFireLaser = (bullet) => {
      window.networkManager.sendToHost({
        type: 'CLIENT_FIRE_LASER',
        bullet
      });
    };

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

    window.networkManager.on('MATCH_START', (msg) => {
      startMatchSequence(msg.duration);
      if (msg.asteroids) {
        game.asteroids = msg.asteroids;
      }
    });

    window.networkManager.on('REMOTE_LASER_FIRED', (msg) => {
      if (msg.bullet && msg.bullet.playerId !== myPlayerId) {
        game.spawnLaserFromRemote(msg.bullet);
      }
    });

    // Authoritative 25Hz world tick from Host
    window.networkManager.on('WORLD_TICK', (msg) => {
      game.timeRemaining = msg.timeRemaining;
      if (msg.asteroids) {
        game.asteroids = msg.asteroids;
      }

      if (msg.players) {
        for (const p of msg.players) {
          if (p.id === myPlayerId) {
            // Local player syncs authoritative score & status
            const local = game.players.get(myPlayerId);
            if (local) {
              local.score = p.score;
              local.kills = p.kills;
              local.deaths = p.deaths;
              local.isAlive = p.isAlive;
              local.shieldTimer = p.shieldTimer;
            }
          } else {
            // Remote ship or bot syncs full flight status
            const remote = game.players.get(p.id) || game.addOrUpdatePlayer(p);
            remote.x = p.x;
            remote.y = p.y;
            remote.vx = p.vx;
            remote.vy = p.vy;
            remote.angle = p.angle;
            remote.thrusting = p.thrusting;
            remote.score = p.score;
            remote.kills = p.kills;
            remote.deaths = p.deaths;
            remote.isAlive = p.isAlive;
            remote.shieldTimer = p.shieldTimer;
          }
        }
      }
      updateHudDisplay();
    });

    window.networkManager.on('MATCH_CONCLUDED', (msg) => {
      concludeMatch(msg.rankings);
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

    const name = playerNameInput.value.trim() || 'Ace Pilot';
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

    hudRoomCode.textContent = 'SOLO';
    startMatchSequence(60);
  });

  // --- 8. MATCH SEQUENCE & TIMER ---
  btnStartGame.addEventListener('click', () => {
    const duration = parseInt(matchDurationSelect.value, 10) || 60;
    game.spawnInitialAsteroids(6);

    window.networkManager.broadcast({
      type: 'MATCH_START',
      duration,
      asteroids: game.asteroids
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

    // Center local player ship and give them a spawn shield
    const local = game.players.get(myPlayerId);
    if (local) {
      local.x = game.V_WIDTH / 2;
      local.y = game.V_HEIGHT / 2;
      local.vx = 0;
      local.vy = 0;
      local.angle = -Math.PI / 2;
      local.isAlive = true;
      local.shieldTimer = 3.0;
    }

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
          if (game.asteroids.length === 0) {
            game.spawnInitialAsteroids(6);
          }
          startHostGameTimer();
          startHostSyncBroadcast();
        } else {
          startClientSyncLoop();
        }
      }
    }, 1000);
  }

  // Host 25Hz Broadcast Loop
  function startHostSyncBroadcast() {
    if (syncInterval) clearInterval(syncInterval);
    if (isSoloMode) return;

    syncInterval = setInterval(() => {
      if (game.state !== 'PLAYING') return;

      const playerList = [];
      for (const p of game.players.values()) {
        playerList.push({
          id: p.id,
          name: p.name,
          color: p.color,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(p.vx),
          vy: Math.round(p.vy),
          angle: Number(p.angle.toFixed(3)),
          thrusting: p.thrusting,
          score: p.score,
          kills: p.kills,
          deaths: p.deaths,
          isAlive: p.isAlive,
          shieldTimer: Number(p.shieldTimer.toFixed(2))
        });
      }

      window.networkManager.broadcast({
        type: 'WORLD_TICK',
        timeRemaining: game.timeRemaining,
        asteroids: game.asteroids,
        players: playerList
      });
    }, 40);
  }

  // Client 28Hz Local Sync to Host
  function startClientSyncLoop() {
    if (syncInterval) clearInterval(syncInterval);

    syncInterval = setInterval(() => {
      if (game.state !== 'PLAYING') return;
      const local = game.players.get(myPlayerId);
      if (!local) return;

      window.networkManager.sendToHost({
        type: 'SHIP_SYNC',
        id: myPlayerId,
        x: Math.round(local.x),
        y: Math.round(local.y),
        vx: Math.round(local.vx),
        vy: Math.round(local.vy),
        angle: Number(local.angle.toFixed(3)),
        thrusting: local.thrusting
      });
    }, 35);
  }

  function startHostGameTimer() {
    if (matchInterval) clearInterval(matchInterval);

    matchInterval = setInterval(() => {
      if (game.state !== 'PLAYING') return;

      game.timeRemaining--;
      updateHudDisplay();

      if (game.timeRemaining <= 0) {
        clearInterval(matchInterval);
        if (syncInterval) clearInterval(syncInterval);

        const rankings = computeRankings();

        if (!isSoloMode && window.networkManager && window.networkManager.isHost) {
          window.networkManager.broadcast({
            type: 'MATCH_CONCLUDED',
            rankings
          });
        }

        concludeMatch(rankings);
      }
    }, 1000);
  }

  function computeRankings() {
    const ranking = [];
    for (const player of game.players.values()) {
      ranking.push({
        id: player.id,
        name: player.name,
        color: player.color,
        score: player.score,
        kills: player.kills,
        deaths: player.deaths
      });
    }
    ranking.sort((a, b) => b.score - a.score || b.kills - a.kills);
    return ranking;
  }

  function concludeMatch(rankings) {
    game.state = 'GAME_OVER';
    if (matchInterval) clearInterval(matchInterval);
    if (syncInterval) clearInterval(syncInterval);
    if (window.soundManager) {
      window.soundManager.stopThrustSound();
      window.soundManager.playVictory();
    }

    const winner = rankings[0] || { name: 'Nobody', color: '#fff', score: 0, kills: 0 };
    winnerName.textContent = winner.name;
    winnerName.style.color = winner.color;
    winnerScore.textContent = `Score: ${winner.score} • ${winner.kills} Kills`;

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

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '12px';

      const killsSpan = document.createElement('span');
      killsSpan.style.color = 'var(--text-muted)';
      killsSpan.style.fontSize = '0.85rem';
      killsSpan.textContent = `${r.kills} Kills`;

      const scoreSpan = document.createElement('span');
      scoreSpan.style.fontWeight = '700';
      scoreSpan.style.color = r.color;
      scoreSpan.textContent = `${r.score} pts`;

      right.appendChild(killsSpan);
      right.appendChild(scoreSpan);

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
    game.spawnInitialAsteroids(6);

    if (!isSoloMode && window.networkManager.isHost) {
      window.networkManager.broadcast({
        type: 'MATCH_START',
        duration,
        asteroids: game.asteroids
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
    if (confirm('Leave current battle and return to lobby?')) {
      handleUserLeaveMatch();
    }
  });

  function handleUserLeaveMatch() {
    if (!isSoloMode && window.networkManager && window.networkManager.isConnected) {
      if (window.networkManager.isHost) {
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
    if (syncInterval) clearInterval(syncInterval);
    game.state = 'LOBBY';
    game.reset();
    if (window.soundManager) {
      window.soundManager.stopThrustSound();
    }

    gameOverScreen.classList.add('hidden');
    gameHud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    btnJoinRoom.disabled = false;
    joinStatus.textContent = '';
    btnCreateRoom.disabled = false;
    btnCreateRoom.textContent = '⚡ Launch Flight Room';
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

    scoreboardList.innerHTML = '';
    const sortedPlayers = Array.from(game.players.values()).sort((a, b) => b.score - a.score);

    for (const player of sortedPlayers) {
      const pill = document.createElement('div');
      pill.className = 'pilot-score-pill';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.backgroundColor = player.color;

      const name = document.createElement('span');
      name.textContent = player.id === myPlayerId ? `${player.name} (You)` : player.name;

      const score = document.createElement('span');
      score.className = 'score-num';
      score.textContent = player.score;

      const kills = document.createElement('span');
      kills.className = 'kills-tag';
      kills.textContent = `${player.kills}K`;

      pill.appendChild(dot);
      pill.appendChild(name);
      pill.appendChild(score);
      pill.appendChild(kills);
      scoreboardList.appendChild(pill);
    }
  }

  setInterval(() => {
    if (game.state === 'PLAYING') {
      updateHudDisplay();
    }
  }, 250);

  // --- 10. INPUT HANDLERS (ASTEROIDS CONTROLS) ---

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      game.localInput.rotLeft = true;
      e.preventDefault();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      game.localInput.rotRight = true;
      e.preventDefault();
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      game.localInput.thrust = true;
      e.preventDefault();
    } else if (e.code === 'Space') {
      if (!e.repeat) {
        game.localInput.shoot = true;
      }
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      game.localInput.rotLeft = false;
      e.preventDefault();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      game.localInput.rotRight = false;
      e.preventDefault();
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      game.localInput.thrust = false;
      if (window.soundManager) window.soundManager.stopThrustSound();
      e.preventDefault();
    } else if (e.code === 'Space') {
      game.localInput.shoot = false;
      e.preventDefault();
    }
  });

  // Mobile / Touch Button Listeners
  function bindTouchButton(element, onPress, onRelease) {
    if (!element) return;
    element.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPress();
    });
    element.addEventListener('pointerup', (e) => {
      e.preventDefault();
      onRelease();
    });
    element.addEventListener('pointercancel', (e) => {
      e.preventDefault();
      onRelease();
    });
  }

  bindTouchButton(btnTouchLeft,
    () => { game.localInput.rotLeft = true; },
    () => { game.localInput.rotLeft = false; }
  );

  bindTouchButton(btnTouchRight,
    () => { game.localInput.rotRight = true; },
    () => { game.localInput.rotRight = false; }
  );

  bindTouchButton(btnTouchThrust,
    () => { game.localInput.thrust = true; },
    () => {
      game.localInput.thrust = false;
      if (window.soundManager) window.soundManager.stopThrustSound();
    }
  );

  bindTouchButton(btnTouchFire,
    () => {
      game.localInput.shoot = true;
      if (game.state === 'PLAYING') {
        game.fireLaser(myPlayerId);
      }
    },
    () => { game.localInput.shoot = false; }
  );
});
