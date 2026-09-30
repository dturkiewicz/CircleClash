/**
 * AstroClash - Asteroids 2D Multiplayer Game Engine
 * 60 FPS Canvas engine featuring classic Asteroids inertial physics,
 * screen-wrapping toroidal space, vector-style ships, craggy asteroids, and bot AI.
 */
class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Virtual Arena Resolution (16:9 widescreen)
    this.V_WIDTH = 1600;
    this.V_HEIGHT = 900;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Physics Tuning (True Asteroids Feel)
    this.ROT_SPEED = 4.4;      // radians/sec (~250 deg/sec)
    this.THRUST_ACCEL = 440;   // px/sec^2
    this.DRAG = 0.992;         // slight space damping per frame
    this.MAX_SPEED = 480;      // max velocity cap
    this.BULLET_SPEED = 780;   // laser speed px/sec
    this.BULLET_LIFE = 1.35;   // laser lifetime in seconds
    this.FIRE_COOLDOWN = 0.18; // seconds between shots
    this.SHIP_RADIUS = 20;     // collision radius

    // Game State
    this.state = 'LOBBY';      // LOBBY, COUNTDOWN, PLAYING, GAME_OVER
    this.players = new Map();  // id -> Player
    this.localPlayerId = null;
    this.asteroids = [];       // array of Asteroids
    this.bullets = [];         // array of Bullets
    this.particles = [];       // visual debris particles
    this.floatingTexts = [];   // floating combat labels
    this.screenShake = 0;

    // Background Starfield (Parallax twinkling stars)
    this.stars = this.generateStarfield(120);

    // Match Timers
    this.timeRemaining = 60;
    this.matchDuration = 60;
    this.countdown = 3;

    // Host Callbacks / Hooks
    this.onFireLaser = null;
    this.onEntityDestroyed = null;
    this.onPlayerKilled = null;

    // Input state for local player
    this.localInput = {
      rotLeft: false,
      rotRight: false,
      thrust: false,
      shoot: false
    };

    // Loop
    this.lastFrameTime = performance.now();
    this.rafId = null;

    this.setupResizeListener();
  }

  generateStarfield(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * this.V_WIDTH,
        y: Math.random() * this.V_HEIGHT,
        size: Math.random() * 1.8 + 0.6,
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 2 + 1,
        seed: Math.random() * Math.PI * 2
      });
    }
    return stars;
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

    const scaleX = (windowW * dpr) / this.V_WIDTH;
    const scaleY = (windowH * dpr) / this.V_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);

    this.offsetX = (this.canvas.width - this.V_WIDTH * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.V_HEIGHT * this.scale) / 2;
  }

  screenToVirtual(screenX, screenY) {
    const dpr = window.devicePixelRatio || 1;
    const canvasX = screenX * dpr - this.offsetX;
    const canvasY = screenY * dpr - this.offsetY;
    return {
      x: Math.max(0, Math.min(this.V_WIDTH, canvasX / this.scale)),
      y: Math.max(0, Math.min(this.V_HEIGHT, canvasY / this.scale))
    };
  }

  // --- PLAYER MANAGEMENT ---
  initLocalPlayer(info) {
    this.localPlayerId = info.id;
    this.addOrUpdatePlayer({
      id: info.id,
      peerId: info.peerId,
      name: info.name,
      color: info.color,
      isHost: info.isHost,
      isLocal: true
    });
  }

  addOrUpdatePlayer(playerData) {
    const existing = this.players.get(playerData.id) || {};
    const player = {
      id: playerData.id,
      name: playerData.name || existing.name || 'Pilot',
      color: playerData.color || existing.color || '#00f0ff',
      isHost: playerData.isHost ?? existing.isHost ?? false,
      isLocal: playerData.isLocal ?? existing.isLocal ?? false,
      isBot: playerData.isBot ?? existing.isBot ?? false,
      // Spatial & Flight Physics
      x: playerData.x ?? existing.x ?? (this.V_WIDTH * (0.25 + Math.random() * 0.5)),
      y: playerData.y ?? existing.y ?? (this.V_HEIGHT * (0.25 + Math.random() * 0.5)),
      vx: playerData.vx ?? existing.vx ?? 0,
      vy: playerData.vy ?? existing.vy ?? 0,
      angle: playerData.angle ?? existing.angle ?? (-Math.PI / 2), // Default point up
      thrusting: playerData.thrusting ?? existing.thrusting ?? false,
      // Combat & Status
      score: playerData.score ?? existing.score ?? 0,
      kills: playerData.kills ?? existing.kills ?? 0,
      deaths: playerData.deaths ?? existing.deaths ?? 0,
      isAlive: playerData.isAlive ?? existing.isAlive ?? true,
      respawnTimer: playerData.respawnTimer ?? existing.respawnTimer ?? 0,
      shieldTimer: playerData.shieldTimer ?? existing.shieldTimer ?? 3.0, // 3s spawn shield
      lastFireTime: existing.lastFireTime ?? 0,
      // Bot specific state
      botTargetId: existing.botTargetId ?? null,
      botNextDecision: existing.botNextDecision ?? 0
    };
    this.players.set(playerData.id, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  // --- ASTEROIDS CREATION & LIFECYCLE ---
  createAsteroid(x, y, size = 3, vx = null, vy = null) {
    // size 3: Large (r ~ 55), size 2: Med (r ~ 32), size 1: Small (r ~ 18)
    const baseRadius = size === 3 ? 55 : size === 2 ? 32 : 18;
    const speed = size === 3 ? (35 + Math.random() * 40) : size === 2 ? (60 + Math.random() * 60) : (90 + Math.random() * 90);
    const moveAngle = Math.random() * Math.PI * 2;

    const asteroidVx = vx !== null ? vx : Math.cos(moveAngle) * speed;
    const asteroidVy = vy !== null ? vy : Math.sin(moveAngle) * speed;

    // Generate polygonal craggy vertices
    const vertexCount = 10 + Math.floor(Math.random() * 5);
    const shapeOffsets = [];
    for (let i = 0; i < vertexCount; i++) {
      shapeOffsets.push(0.8 + Math.random() * 0.4); // 80% to 120% radius jitter
    }

    return {
      id: 'ast_' + Math.random().toString(36).substring(2, 9),
      x: x !== null ? x : Math.random() * this.V_WIDTH,
      y: y !== null ? y : Math.random() * this.V_HEIGHT,
      vx: asteroidVx,
      vy: asteroidVy,
      radius: baseRadius,
      size: size,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.5,
      points: size === 3 ? 20 : size === 2 ? 50 : 100,
      shapeOffsets: shapeOffsets
    };
  }

  spawnInitialAsteroids(count = 6) {
    this.asteroids = [];
    for (let i = 0; i < count; i++) {
      // Spawn near edges to leave center safe for initial player spawn
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = Math.random() * this.V_WIDTH; y = 30; }
      else if (edge === 1) { x = this.V_WIDTH - 30; y = Math.random() * this.V_HEIGHT; }
      else if (edge === 2) { x = Math.random() * this.V_WIDTH; y = this.V_HEIGHT - 30; }
      else { x = 30; y = Math.random() * this.V_HEIGHT; }

      this.asteroids.push(this.createAsteroid(x, y, 3));
    }
  }

  maintainAsteroidPopulation(targetLargeCount = 5) {
    const largeCount = this.asteroids.filter(a => a.size === 3).length;
    if (largeCount < targetLargeCount && Math.random() < 0.03) {
      // Spawn an asteroid at random border
      const edge = Math.floor(Math.random() * 4);
      let x = edge % 2 === 0 ? Math.random() * this.V_WIDTH : (edge === 1 ? this.V_WIDTH - 20 : 20);
      let y = edge % 2 === 1 ? Math.random() * this.V_HEIGHT : (edge === 0 ? 20 : this.V_HEIGHT - 20);
      this.asteroids.push(this.createAsteroid(x, y, 3));
    }
  }

  // --- BULLETS & SHOOTING ---
  fireLaser(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || this.state !== 'PLAYING') return null;

    const now = performance.now() / 1000;
    if (now - player.lastFireTime < this.FIRE_COOLDOWN) return null;
    player.lastFireTime = now;

    // Bullet origin at ship nose
    const noseDist = 24;
    const bx = player.x + Math.cos(player.angle) * noseDist;
    const by = player.y + Math.sin(player.angle) * noseDist;

    // Bullet velocity is ship velocity + projectile forward velocity
    const bvx = Math.cos(player.angle) * this.BULLET_SPEED + player.vx * 0.25;
    const bvy = Math.sin(player.angle) * this.BULLET_SPEED + player.vy * 0.25;

    const bullet = {
      id: 'b_' + Math.random().toString(36).substring(2, 8),
      playerId: player.id,
      color: player.color,
      x: bx,
      y: by,
      vx: bvx,
      vy: bvy,
      angle: player.angle,
      life: this.BULLET_LIFE,
      spawnTime: now
    };

    this.bullets.push(bullet);

    // Audio chirp for local player
    if (player.id === this.localPlayerId && window.soundManager) {
      window.soundManager.playLaser();
    }

    if (this.onFireLaser) {
      this.onFireLaser(bullet);
    }

    return bullet;
  }

  spawnLaserFromRemote(bulletData) {
    this.bullets.push({
      ...bulletData,
      life: bulletData.life || this.BULLET_LIFE,
      spawnTime: performance.now() / 1000
    });
    if (window.soundManager) {
      window.soundManager.playLaser();
    }
  }

  // --- EXPLOSIONS & DEBRIS PARTICLES ---
  createVectorExplosion(x, y, color, count = 20, isShip = false) {
    // 1. Shards / Vector lines
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * (isShip ? 280 : 180);
      this.particles.push({
        type: 'line',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 4 + Math.random() * (isShip ? 12 : 8),
        angle: angle,
        rotSpeed: (Math.random() - 0.5) * 12,
        color: color,
        alpha: 1,
        decay: 0.8 + Math.random() * 0.8 // lifetime seconds
      });
    }

    // 2. High-speed spark dots
    for (let i = 0; i < Math.floor(count * 0.7); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * (isShip ? 340 : 200);
      this.particles.push({
        type: 'dot',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2,
        color: '#ffffff',
        alpha: 1,
        decay: 0.4 + Math.random() * 0.5
      });
    }

    this.screenShake = Math.min(22, this.screenShake + (isShip ? 14 : 7));
  }

  // --- BOT MANAGEMENT ---
  addBot() {
    const botColors = ['#00f0ff', '#ff0077', '#39ff14', '#ffe600', '#bf00ff', '#ff5722'];
    const botNames = ['StarDrifter', 'NovaBlade', 'VoidAce', 'Pulsar', 'QuantumWing', 'Vortex9'];

    const usedColors = new Set([...this.players.values()].map(p => p.color));
    const availableColors = botColors.filter(c => !usedColors.has(c));
    const botColor = availableColors[0] || botColors[Math.floor(Math.random() * botColors.length)];

    const botId = 'bot_' + Math.random().toString(36).substring(2, 7);
    const botName = botNames[this.players.size % botNames.length] + ' [AI]';

    const bot = {
      id: botId,
      name: botName,
      color: botColor,
      isHost: false,
      isBot: true,
      isLocal: false,
      x: this.V_WIDTH * (0.2 + Math.random() * 0.6),
      y: this.V_HEIGHT * (0.2 + Math.random() * 0.6),
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      thrusting: false,
      score: 0,
      kills: 0,
      deaths: 0,
      isAlive: true,
      respawnTimer: 0,
      shieldTimer: 3.0,
      lastFireTime: 0,
      botNextDecision: 0
    };

    this.players.set(botId, bot);
    return bot;
  }

  updateBots(now, dt) {
    if (this.state !== 'PLAYING') return;

    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.isAlive) continue;

      // 1. Find nearest target (nearest asteroid or enemy ship)
      let bestTarget = null;
      let bestDist = Infinity;

      // Look at asteroids first
      for (const ast of this.asteroids) {
        const dx = ast.x - bot.x;
        const dy = ast.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = ast;
        }
      }

      // Also consider enemy players
      for (const other of this.players.values()) {
        if (other.id !== bot.id && other.isAlive) {
          const dx = other.x - bot.x;
          const dy = other.y - bot.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist * 0.8) { // slightly prioritize enemy ships
            bestDist = dist;
            bestTarget = other;
          }
        }
      }

      if (!bestTarget) continue;

      // 2. Compute angle to target
      const targetAngle = Math.atan2(bestTarget.y - bot.y, bestTarget.x - bot.x);
      let angleDiff = targetAngle - bot.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Rotate towards target
      if (Math.abs(angleDiff) > 0.08) {
        bot.angle += Math.sign(angleDiff) * this.ROT_SPEED * dt;
      }

      // Check for incoming collision hazard (emergency evasion)
      let emergencyEvade = false;
      if (bestDist < 90) {
        emergencyEvade = true;
      }

      // 3. Thrust in bursts when facing target or evading
      if (emergencyEvade) {
        // Thrust sideways/away
        bot.thrusting = true;
        bot.vx += Math.cos(bot.angle + Math.PI / 2) * this.THRUST_ACCEL * dt;
        bot.vy += Math.sin(bot.angle + Math.PI / 2) * this.THRUST_ACCEL * dt;
      } else if (Math.abs(angleDiff) < 0.45 && bestDist > 160) {
        const currentSpeed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
        if (currentSpeed < 260) {
          bot.thrusting = true;
          bot.vx += Math.cos(bot.angle) * this.THRUST_ACCEL * dt;
          bot.vy += Math.sin(bot.angle) * this.THRUST_ACCEL * dt;
        } else {
          bot.thrusting = false;
        }
      } else {
        bot.thrusting = false;
      }

      // 4. Shoot when aligned
      if (Math.abs(angleDiff) < 0.22 && bestDist < 650) {
        this.fireLaser(bot.id);
      }
    }
  }

  // --- COLLISION DETECTION (AUTHORITATIVE) ---
  checkCollisions() {
    if (this.state !== 'PLAYING') return;

    // 1. Bullets vs Asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      let bulletHit = false;

      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const ast = this.asteroids[ai];
        const dx = b.x - ast.x;
        const dy = b.y - ast.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= ast.radius * ast.radius) {
          // HIT!
          bulletHit = true;
          const shooter = this.players.get(b.playerId);
          if (shooter) {
            shooter.score += ast.points;
            if (shooter.id === this.localPlayerId && window.soundManager) {
              window.soundManager.playScorePing();
            }
          }

          // Spawn floating score
          this.floatingTexts.push({
            x: ast.x,
            y: ast.y - 15,
            text: `+${ast.points}`,
            color: '#ffe600',
            alpha: 1,
            vy: -40,
            life: 0.9
          });

          // Explosion sound & particles
          if (window.soundManager) {
            window.soundManager.playExplosion('asteroid');
          }
          this.createVectorExplosion(ast.x, ast.y, '#9bb2d4', ast.size * 10);

          // Split asteroid if size > 1
          if (ast.size > 1) {
            const nextSize = ast.size - 1;
            const splitAngle1 = Math.random() * Math.PI * 2;
            const splitAngle2 = splitAngle1 + Math.PI * 0.75 + Math.random() * 0.5;
            const splitSpeed = 80 + Math.random() * 60;

            const a1 = this.createAsteroid(
              ast.x + Math.cos(splitAngle1) * 15,
              ast.y + Math.sin(splitAngle1) * 15,
              nextSize,
              Math.cos(splitAngle1) * splitSpeed,
              Math.sin(splitAngle1) * splitSpeed
            );
            const a2 = this.createAsteroid(
              ast.x + Math.cos(splitAngle2) * 15,
              ast.y + Math.sin(splitAngle2) * 15,
              nextSize,
              Math.cos(splitAngle2) * splitSpeed,
              Math.sin(splitAngle2) * splitSpeed
            );

            this.asteroids.splice(ai, 1, a1, a2);
          } else {
            this.asteroids.splice(ai, 1);
          }

          if (this.onEntityDestroyed) {
            this.onEntityDestroyed({
              type: 'asteroid',
              id: ast.id,
              x: ast.x,
              y: ast.y,
              killerId: b.playerId,
              points: ast.points
            });
          }

          break; // bullet can only hit one asteroid
        }
      }

      if (bulletHit) {
        this.bullets.splice(bi, 1);
        continue;
      }

      // 2. Bullets vs Ships (PvP Combat)
      for (const targetPlayer of this.players.values()) {
        if (!targetPlayer.isAlive || targetPlayer.shieldTimer > 0) continue;
        if (targetPlayer.id === b.playerId) continue; // don't shoot yourself

        const dx = b.x - targetPlayer.x;
        const dy = b.y - targetPlayer.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= this.SHIP_RADIUS * this.SHIP_RADIUS) {
          // SHIP DESTROYED BY LASER!
          this.bullets.splice(bi, 1);
          this.killShip(targetPlayer, b.playerId, 'laser');
          break;
        }
      }
    }

    // 3. Ships vs Asteroids (Collision)
    for (const player of this.players.values()) {
      if (!player.isAlive || player.shieldTimer > 0) continue;

      for (const ast of this.asteroids) {
        const dx = player.x - ast.x;
        const dy = player.y - ast.y;
        const distSq = dx * dx + dy * dy;
        const hitRadius = this.SHIP_RADIUS + ast.radius * 0.85;

        if (distSq <= hitRadius * hitRadius) {
          // SHIP DESTROYED BY ASTEROID CRASH!
          this.killShip(player, null, 'asteroid');
          break;
        }
      }
    }
  }

  killShip(victim, killerId = null, reason = 'laser') {
    victim.isAlive = false;
    victim.deaths += 1;
    victim.respawnTimer = 2.0; // 2 second respawn delay
    victim.vx = 0;
    victim.vy = 0;

    // Credit killer
    let killerName = 'Space Hazard';
    if (killerId) {
      const killer = this.players.get(killerId);
      if (killer) {
        killer.score += 250;
        killer.kills += 1;
        killerName = killer.name;
        if (killer.id === this.localPlayerId && window.soundManager) {
          window.soundManager.playScorePing();
        }
      }
    }

    // Audio & Visual explosion
    if (window.soundManager) {
      window.soundManager.playExplosion('ship');
    }
    this.createVectorExplosion(victim.x, victim.y, victim.color, 35, true);

    // Floating text
    this.floatingTexts.push({
      x: victim.x,
      y: victim.y - 25,
      text: killerId ? `💥 BLASTED BY ${killerName.toUpperCase()}!` : '💥 CRUSHED BY ASTEROID!',
      color: '#ff3366',
      alpha: 1,
      vy: -35,
      life: 1.5
    });

    if (this.onPlayerKilled) {
      this.onPlayerKilled(victim.id, killerId, reason);
    }
  }

  respawnShip(player) {
    player.isAlive = true;
    player.respawnTimer = 0;
    player.shieldTimer = 3.0; // 3 seconds invulnerability
    player.x = this.V_WIDTH / 2 + (Math.random() - 0.5) * 400;
    player.y = this.V_HEIGHT / 2 + (Math.random() - 0.5) * 300;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;

    if (player.id === this.localPlayerId && window.soundManager) {
      window.soundManager.playRespawn();
    }
  }

  // --- GAME LOOP ---
  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const loop = (now) => {
      const dt = Math.min(0.08, (now - this.lastFrameTime) / 1000);
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
    // 1. Process Local Player Controls
    const local = this.players.get(this.localPlayerId);
    if (local && local.isAlive && this.state === 'PLAYING') {
      // Rotation
      if (this.localInput.rotLeft) {
        local.angle -= this.ROT_SPEED * dt;
      }
      if (this.localInput.rotRight) {
        local.angle += this.ROT_SPEED * dt;
      }

      // Thrust
      local.thrusting = this.localInput.thrust;
      if (local.thrusting) {
        local.vx += Math.cos(local.angle) * this.THRUST_ACCEL * dt;
        local.vy += Math.sin(local.angle) * this.THRUST_ACCEL * dt;

        // Thrust audio
        if (window.soundManager) {
          window.soundManager.startThrustSound();
        }
      } else {
        if (window.soundManager) {
          window.soundManager.stopThrustSound();
        }
      }

      // Shoot
      if (this.localInput.shoot) {
        this.fireLaser(local.id);
      }
    }

    // 2. Update All Ships Physics & Status
    for (const player of this.players.values()) {
      if (!player.isAlive) {
        // Respawn countdown
        if (player.respawnTimer > 0) {
          player.respawnTimer -= dt;
          if (player.respawnTimer <= 0) {
            this.respawnShip(player);
          }
        }
        continue;
      }

      // Decay shield
      if (player.shieldTimer > 0) {
        player.shieldTimer = Math.max(0, player.shieldTimer - dt);
      }

      // Inertial damping (slight space drag)
      player.vx *= Math.pow(this.DRAG, dt * 60);
      player.vy *= Math.pow(this.DRAG, dt * 60);

      // Speed cap
      const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (speed > this.MAX_SPEED) {
        player.vx = (player.vx / speed) * this.MAX_SPEED;
        player.vy = (player.vy / speed) * this.MAX_SPEED;
      }

      // Apply velocity
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Toroidal Screen Wrapping
      if (player.x < 0) player.x += this.V_WIDTH;
      else if (player.x > this.V_WIDTH) player.x -= this.V_WIDTH;
      if (player.y < 0) player.y += this.V_HEIGHT;
      else if (player.y > this.V_HEIGHT) player.y -= this.V_HEIGHT;
    }

    // 3. Update Asteroids
    for (const ast of this.asteroids) {
      ast.x += ast.vx * dt;
      ast.y += ast.vy * dt;
      ast.rot += ast.rotSpeed * dt;

      // Wrap asteroids around edges
      if (ast.x < -ast.radius) ast.x += this.V_WIDTH + ast.radius * 2;
      else if (ast.x > this.V_WIDTH + ast.radius) ast.x -= this.V_WIDTH + ast.radius * 2;
      if (ast.y < -ast.radius) ast.y += this.V_HEIGHT + ast.radius * 2;
      else if (ast.y > this.V_HEIGHT + ast.radius) ast.y -= this.V_HEIGHT + ast.radius * 2;
    }

    // 4. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Wrap bullets
      if (b.x < 0) b.x += this.V_WIDTH;
      else if (b.x > this.V_WIDTH) b.x -= this.V_WIDTH;
      if (b.y < 0) b.y += this.V_HEIGHT;
      else if (b.y > this.V_HEIGHT) b.y -= this.V_HEIGHT;

      if (b.life <= 0) {
        this.bullets.splice(i, 1);
      }
    }

    // 5. Host-Authoritative Collisions & Bots
    if (!window.networkManager || window.networkManager.isHost) {
      this.checkCollisions();
      this.updateBots(now, dt);
      if (this.state === 'PLAYING') {
        this.maintainAsteroidPopulation();
      }
    }

    // 6. Update Debris Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.96, dt * 60);
      p.vy *= Math.pow(0.96, dt * 60);
      if (p.rotSpeed) p.angle += p.rotSpeed * dt;
      p.alpha -= dt / p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 7. Update Floating Combat Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      ft.alpha = Math.max(0, ft.life / 0.9);
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 8. Screen Shake
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 30);
    }
  }

  // --- RENDERING ---
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Deep space black void
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Starfield
    this.drawStarfield(ctx);

    // 2. Arena Boundary Glow
    this.drawArenaBorder(ctx);

    // 3. Asteroids
    this.drawAsteroids(ctx);

    // 4. Lasers / Bullets
    this.drawBullets(ctx);

    // 5. Spaceships
    this.drawShips(ctx);

    // 6. Debris Particles
    this.drawParticles(ctx);

    // 7. Floating Combat Labels
    this.drawFloatingTexts(ctx);

    // 8. Countdown Overlay
    if (this.state === 'COUNTDOWN') {
      this.drawCountdownOverlay(ctx);
    }

    ctx.restore();
  }

  drawStarfield(ctx) {
    const now = performance.now() * 0.002;
    for (const star of this.stars) {
      const twinkle = Math.sin(now * star.twinkleSpeed + star.seed) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, star.alpha * twinkle)})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawArenaBorder(ctx) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.V_WIDTH, this.V_HEIGHT);
    ctx.shadowBlur = 0;
  }

  drawAsteroids(ctx) {
    for (const ast of this.asteroids) {
      ctx.save();
      ctx.translate(ast.x, ast.y);
      ctx.rotate(ast.rot);

      const numPts = ast.shapeOffsets.length;
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const a = (i / numPts) * Math.PI * 2;
        const r = ast.radius * ast.shapeOffsets[i];
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Asteroid fill (dark void rock)
      ctx.fillStyle = '#0f1422';
      ctx.fill();

      // Vector wireframe glow
      ctx.strokeStyle = '#8fa4be';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#4a6b8f';
      ctx.shadowBlur = 6;
      ctx.stroke();

      ctx.restore();
    }
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);

      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;

      // Glow beam
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      // Core white laser
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      ctx.restore();
    }
  }

  drawShips(ctx) {
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;

      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);

      // --- 1. Thruster Plume Flame ---
      if (player.thrusting) {
        const flameLength = 16 + Math.random() * 12;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-10 - flameLength, 0);
        ctx.lineTo(-10, 5);
        ctx.closePath();

        ctx.fillStyle = '#ff7700';
        ctx.shadowColor = '#ff5500';
        ctx.shadowBlur = 16;
        ctx.fill();

        // Inner white/cyan core
        ctx.beginPath();
        ctx.moveTo(-9, -2.5);
        ctx.lineTo(-9 - flameLength * 0.55, 0);
        ctx.lineTo(-9, 2.5);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      // --- 2. Crude Triangle Spaceship ---
      // Classic vector ship: nose at (24, 0), right wing at (-16, 14), indent at (-8, 0), left wing at (-16, -14)
      ctx.beginPath();
      ctx.moveTo(24, 0);      // Front nose
      ctx.lineTo(-16, 14);    // Right wing
      ctx.lineTo(-8, 0);      // Rear indent
      ctx.lineTo(-16, -14);   // Left wing
      ctx.closePath();

      // Translucent cockpit dark fill
      ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
      ctx.fill();

      // Neon vector outline
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2.6;
      ctx.shadowColor = player.color;
      ctx.shadowBlur = player.isLocal ? 16 : 8;
      ctx.stroke();

      // --- 3. Invulnerability Shield ---
      if (player.shieldTimer > 0) {
        const pulse = Math.sin(performance.now() * 0.015) * 0.2 + 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, this.SHIP_RADIUS + 9, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${pulse * 0.85})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 14;
        ctx.stroke();
      }

      ctx.restore();

      // --- 4. Player Name & Score Tag ---
      ctx.save();
      ctx.font = 'bold 13px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(`${player.name} (${player.score})`, player.x, player.y - 28);
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;

      if (p.type === 'line') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-p.length / 2, 0);
        ctx.lineTo(p.length / 2, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  drawFloatingTexts(ctx) {
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
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

    const text = this.countdown > 0 ? this.countdown : 'LAUNCH!';
    ctx.fillText(text, this.V_WIDTH / 2, this.V_HEIGHT / 2);
    ctx.restore();
  }

  reset() {
    this.asteroids = [];
    this.bullets = [];
    this.particles = [];
    this.floatingTexts = [];
    for (const p of this.players.values()) {
      p.score = 0;
      p.kills = 0;
      p.deaths = 0;
      p.vx = 0;
      p.vy = 0;
      p.angle = -Math.PI / 2;
      p.isAlive = true;
      p.shieldTimer = 3.0;
      p.thrusting = false;
    }
  }
}

window.GameEngine = GameEngine;
