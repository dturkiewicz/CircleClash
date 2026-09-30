/**
 * Circle Clash - Territory Conquest Game Engine
 * Manages canvas rendering, physics, collision detection, and territory coverage.
 */
class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Virtual Arena Resolution
    this.V_WIDTH = 1600;
    this.V_HEIGHT = 900;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Game Config
    this.GROWTH_RATE = 110; // pixels per second
    this.MAX_RADIUS = 280;  // maximum circle radius
    this.MIN_RADIUS = 20;   // minimum circle radius to claim

    // State
    this.state = 'LOBBY'; // LOBBY, COUNTDOWN, PLAYING, GAME_OVER
    this.players = new Map(); // id -> Player
    this.localPlayerId = null;
    this.territories = []; // array of { id, playerId, color, x, y, r, timestamp }
    this.particles = [];
    this.ripples = [];
    this.floatingTexts = [];
    this.screenShake = 0;

    // Coverage & Timers
    this.coverageStats = {}; // playerId -> percentage
    this.timeRemaining = 60;
    this.matchDuration = 60;
    this.countdown = 3;
    this.coverageCanvas = document.createElement('canvas');
    this.coverageCanvas.width = 160;
    this.coverageCanvas.height = 90;
    this.coverageCtx = this.coverageCanvas.getContext('2d', { willReadFrequently: true });
    this.lastCoverageCheck = 0;

    // Bot AI loop timer
    this.botTimer = null;

    // Animation loop binding
    this.lastFrameTime = performance.now();
    this.rafId = null;

    this.setupResizeListener();
  }

  setupResizeListener() {
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    this.canvas.width = windowW * dpr;
    this.canvas.height = windowH * dpr;

    // Scale maintaining 16:9 aspect ratio with letterboxing
    const scaleX = (windowW * dpr) / this.V_WIDTH;
    const scaleY = (windowH * dpr) / this.V_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);

    this.offsetX = (this.canvas.width - this.V_WIDTH * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.V_HEIGHT * this.scale) / 2;
  }

  // Convert client screen mouse/touch coords to virtual game arena coords
  screenToVirtual(screenX, screenY) {
    const dpr = window.devicePixelRatio || 1;
    const canvasX = screenX * dpr - this.offsetX;
    const canvasY = screenY * dpr - this.offsetY;
    return {
      x: Math.max(0, Math.min(this.V_WIDTH, canvasX / this.scale)),
      y: Math.max(0, Math.min(this.V_HEIGHT, canvasY / this.scale))
    };
  }

  initLocalPlayer(info) {
    this.localPlayerId = info.id;
    this.addOrUpdatePlayer({
      id: info.id,
      peerId: info.peerId,
      name: info.name,
      color: info.color,
      isHost: info.isHost,
      isLocal: true,
      expanding: null
    });
  }

  addOrUpdatePlayer(playerData) {
    const existing = this.players.get(playerData.id) || {};
    this.players.set(playerData.id, {
      ...existing,
      ...playerData,
      expanding: playerData.expanding || existing.expanding || null
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  // --- EXPANSION & MECHANICS ---

  startExpand(playerId, x, y) {
    if (this.state !== 'PLAYING') return;
    const player = this.players.get(playerId);
    if (!player) return;

    player.expanding = {
      x,
      y,
      r: 10,
      startTime: performance.now(),
      maxR: this.MAX_RADIUS
    };

    if (window.soundManager) {
      window.soundManager.startExpandSound(playerId);
    }
  }

  releaseExpand(playerId) {
    if (this.state !== 'PLAYING') return;
    const player = this.players.get(playerId);
    if (!player || !player.expanding) return;

    const { x, y, r } = player.expanding;
    player.expanding = null;

    if (window.soundManager) {
      window.soundManager.stopExpandSound(playerId);
    }

    if (r >= this.MIN_RADIUS) {
      const territory = {
        id: 't_' + Math.random().toString(36).substring(2, 9),
        playerId: player.id,
        color: player.color,
        x,
        y,
        r,
        timestamp: Date.now()
      };

      this.territories.push(territory);

      // Add shockwave ripple
      this.ripples.push({
        x,
        y,
        r,
        maxR: r + 35,
        color: player.color,
        alpha: 0.8
      });

      if (window.soundManager) {
        window.soundManager.playClaim(r);
      }

      return territory;
    }
    return null;
  }

  popPlayer(playerId, x, y, radius, cause = 'collision') {
    const player = this.players.get(playerId);
    if (!player) return;

    player.expanding = null;

    if (window.soundManager) {
      window.soundManager.stopExpandSound(playerId);
      window.soundManager.playPop();
    }

    // Spawn sparks / pop particles
    this.createExplosion(x, y, player.color, Math.min(45, Math.max(16, radius / 3)));

    // Camera shake
    this.screenShake = Math.min(18, 6 + radius * 0.06);

    // Floating POP text
    this.floatingTexts.push({
      x,
      y: y - 20,
      text: 'POPPED!',
      color: '#ff3366',
      alpha: 1,
      vy: -1.5,
      life: 50
    });
  }

  createExplosion(x, y, color, count = 24) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color,
        alpha: 1,
        friction: 0.94,
        gravity: 0.08,
        decay: 0.02 + Math.random() * 0.02
      });
    }
  }

  // --- BOT MANAGEMENT ---
  addBot() {
    const botColors = ['#00f0ff', '#ff0077', '#39ff14', '#ffe600', '#bf00ff', '#ff5722'];
    const botNames = ['PixelBot', 'NexusAI', 'Vortex', 'Echo', 'NeonDrift', 'Blitz'];

    // Pick unused color/name if possible
    const usedColors = new Set([...this.players.values()].map(p => p.color));
    const availableColors = botColors.filter(c => !usedColors.has(c));
    const botColor = availableColors[0] || botColors[Math.floor(Math.random() * botColors.length)];

    const botId = 'bot_' + Math.random().toString(36).substring(2, 7);
    const botName = botNames[this.players.size % botNames.length] + ' [BOT]';

    const bot = {
      id: botId,
      name: botName,
      color: botColor,
      isHost: false,
      isBot: true,
      isLocal: false,
      expanding: null,
      botState: 'IDLE',
      botTimer: performance.now() + 1000 + Math.random() * 2000
    };

    this.players.set(botId, bot);
    return bot;
  }

  updateBots(now) {
    if (this.state !== 'PLAYING') return;

    for (const player of this.players.values()) {
      if (!player.isBot) continue;

      if (player.botState === 'IDLE' && now >= player.botTimer) {
        // Pick smart placement: random position away from arena edges
        const padding = 120;
        const x = padding + Math.random() * (this.V_WIDTH - padding * 2);
        const y = padding + Math.random() * (this.V_HEIGHT - padding * 2);

        this.startExpand(player.id, x, y);
        player.botState = 'GROWING';
        // Target hold duration: 0.8 to 2.2 seconds
        player.botHoldDuration = 800 + Math.random() * 1400;
        player.botExpandStartTime = now;
      } else if (player.botState === 'GROWING' && player.expanding) {
        const elapsed = now - player.botExpandStartTime;

        // Check if any opponent expanding circle is getting dangerously close
        let emergencyRelease = false;
        for (const other of this.players.values()) {
          if (other.id !== player.id && other.expanding) {
            const dx = player.expanding.x - other.expanding.x;
            const dy = player.expanding.y - other.expanding.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < (player.expanding.r + other.expanding.r + 30)) {
              emergencyRelease = true;
              break;
            }
          }
        }

        if (elapsed >= player.botHoldDuration || emergencyRelease || player.expanding.r >= this.MAX_RADIUS * 0.9) {
          const territory = this.releaseExpand(player.id);
          player.botState = 'IDLE';
          player.botTimer = now + 400 + Math.random() * 1200;

          if (territory && window.networkManager?.isHost) {
            window.networkManager.broadcast({
              type: 'territory_claimed',
              payload: territory
            });
          }
        }
      }
    }
  }

  // --- COLLISION DETECTION (Expanding vs Expanding) ---
  checkExpandingCollisions() {
    const expandingPlayers = [...this.players.values()].filter(p => p.expanding);
    const poppedIds = new Set();

    for (let i = 0; i < expandingPlayers.length; i++) {
      for (let j = i + 1; j < expandingPlayers.length; j++) {
        const p1 = expandingPlayers[i];
        const p2 = expandingPlayers[j];

        const dx = p1.expanding.x - p2.expanding.x;
        const dy = p1.expanding.y - p2.expanding.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < (p1.expanding.r + p2.expanding.r)) {
          // Touch! Both pop!
          poppedIds.add(p1.id);
          poppedIds.add(p2.id);
        }
      }
    }

    for (const id of poppedIds) {
      const p = this.players.get(id);
      if (p && p.expanding) {
        const { x, y, r } = p.expanding;
        this.popPlayer(id, x, y, r, 'collision');

        // If host, broadcast pop
        if (window.networkManager && window.networkManager.isHost) {
          window.networkManager.broadcast({
            type: 'expand_popped',
            payload: { playerId: id, x, y, r }
          });
        }
      }
    }
  }

  // --- TERRITORY COVERAGE TRACKER ---
  updateCoverage() {
    const w = this.coverageCanvas.width;
    const h = this.coverageCanvas.height;
    const scaleX = w / this.V_WIDTH;
    const scaleY = h / this.V_HEIGHT;

    // Draw background neutral color
    this.coverageCtx.fillStyle = '#000000';
    this.coverageCtx.fillRect(0, 0, w, h);

    // Map each player to unique color index for fast pixel lookup
    const colorMap = new Map();
    let idx = 1;
    for (const player of this.players.values()) {
      colorMap.set(player.id, idx);
      idx++;
    }

    // Render placed territories in order onto low-res canvas
    for (const t of this.territories) {
      const mappedId = colorMap.get(t.playerId);
      if (!mappedId) continue;

      this.coverageCtx.fillStyle = `rgb(${mappedId}, 0, 0)`;
      this.coverageCtx.beginPath();
      this.coverageCtx.arc(t.x * scaleX, t.y * scaleY, t.r * scaleX, 0, Math.PI * 2);
      this.coverageCtx.fill();
    }

    // Count pixels
    const imgData = this.coverageCtx.getImageData(0, 0, w, h).data;
    const totalPixels = w * h;
    const pixelCounts = {};

    for (let i = 0; i < imgData.length; i += 4) {
      const val = imgData[i];
      if (val > 0) {
        pixelCounts[val] = (pixelCounts[val] || 0) + 1;
      }
    }

    // Compute percentage per player
    const stats = {};
    for (const [playerId, mappedId] of colorMap.entries()) {
      const count = pixelCounts[mappedId] || 0;
      stats[playerId] = ((count / totalPixels) * 100).toFixed(1);
    }

    this.coverageStats = stats;
  }

  // --- MAIN LOOP ---
  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const loop = (now) => {
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      this.update(now, dt);
      this.render();

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  update(now, dt) {
    // 1. Update expanding circles
    if (this.state === 'PLAYING') {
      for (const player of this.players.values()) {
        if (player.expanding) {
          const elapsed = (now - player.expanding.startTime) / 1000;
          player.expanding.r = Math.min(
            player.expanding.maxR,
            10 + elapsed * this.GROWTH_RATE
          );
        }
      }

      // 2. Collision checks (Only Host or Local game runs authoritative collision)
      if (!window.networkManager || window.networkManager.isHost) {
        this.checkExpandingCollisions();
        this.updateBots(now);
      }

      // 3. Periodic Territory Coverage check (every 300ms)
      if (now - this.lastCoverageCheck > 300) {
        this.updateCoverage();
        this.lastCoverageCheck = now;
      }
    }

    // 4. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 5. Update shockwave ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 2.5;
      r.alpha -= 0.025;
      if (r.alpha <= 0 || r.r >= r.maxR) {
        this.ripples.splice(i, 1);
      }
    }

    // 6. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= 1;
      ft.alpha = ft.life / 50;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 7. Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }
  }

  // --- RENDERING ---
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Clear whole screen with deep void background
    ctx.fillStyle = '#080a10';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply arena transform & screen shake
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Draw Arena Boundary & Grid
    this.drawArenaGrid(ctx);

    // 2. Draw Claimed Territories
    this.drawTerritories(ctx);

    // 3. Draw Shockwave Ripples
    for (const rip of this.ripples) {
      ctx.strokeStyle = rip.color;
      ctx.globalAlpha = Math.max(0, rip.alpha);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 4. Draw Expanding Circles (Glowing & Pulsing)
    this.drawExpandingCircles(ctx);

    // 5. Draw Particles
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 6. Draw Floating Texts
    for (const ft of this.floatingTexts) {
      ctx.font = 'bold 22px "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 7. Draw Countdown Overlay if Starting
    if (this.state === 'COUNTDOWN') {
      this.drawCountdownOverlay(ctx);
    }

    ctx.restore();
  }

  drawArenaGrid(ctx) {
    // Arena background box
    ctx.fillStyle = '#0d111a';
    ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);

    // Subtle neon grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 50;

    ctx.beginPath();
    for (let x = 0; x <= this.V_WIDTH; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.V_HEIGHT);
    }
    for (let y = 0; y <= this.V_HEIGHT; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.V_WIDTH, y);
    }
    ctx.stroke();

    // Arena glowing border
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, this.V_WIDTH, this.V_HEIGHT);
    ctx.shadowBlur = 0;
  }

  drawTerritories(ctx) {
    for (const t of this.territories) {
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.85;

      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();

      // Border highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }
  }

  drawExpandingCircles(ctx) {
    const now = performance.now();

    for (const player of this.players.values()) {
      if (!player.expanding) continue;

      const { x, y, r } = player.expanding;
      const pulse = Math.sin(now * 0.015) * 3;

      ctx.save();

      // Outer glow aura
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 18;

      // Translucent expanding body
      ctx.fillStyle = player.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Vibrant pulsing border
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 4 + pulse;
      ctx.stroke();

      // Inner energy core
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Player name tag above expanding bubble
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, x, y - r - 12);

      ctx.restore();
    }
  }

  drawCountdownOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 30;

    const text = this.countdown > 0 ? this.countdown : 'CLASH!';
    ctx.fillText(text, this.V_WIDTH / 2, this.V_HEIGHT / 2);

    ctx.restore();
  }

  reset() {
    this.territories = [];
    this.particles = [];
    this.ripples = [];
    this.floatingTexts = [];
    this.coverageStats = {};
    for (const p of this.players.values()) {
      p.expanding = null;
    }
  }
}

window.GameEngine = GameEngine;
