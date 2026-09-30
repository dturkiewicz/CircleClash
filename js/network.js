/**
 * NetworkManager using PeerJS (WebRTC DataChannels)
 * Handles P2P room hosting, joining, state synchronization, and messaging.
 */
class NetworkManager {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.myId = null;
    this.hostConn = null; // Client's connection to host
    this.clients = new Map(); // Host's connections to clients: peerId -> conn
    this.callbacks = {};
    this.isConnected = false;
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }

  // Generate clean 5-character room code (avoiding ambiguous chars like 0, O, 1, I)
  generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getPeerIdForRoom(roomCode) {
    return `cclash-${roomCode.toLowerCase()}`;
  }

  // --- HOST A NEW GAME ---
  hostGame(playerInfo) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.roomCode = this.generateRoomCode();
      const hostPeerId = this.getPeerIdForRoom(this.roomCode);

      // Create Peer using PeerJS public cloud signaling
      try {
        this.peer = new Peer(hostPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });
      } catch (err) {
        return reject(err);
      }

      this.peer.on('open', (id) => {
        this.myId = id;
        this.isConnected = true;
        console.log(`[Host] Created room ${this.roomCode} with peer ID: ${id}`);
        resolve({ roomCode: this.roomCode, peerId: id });
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingClientConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[Host] Peer error:', err);
        if (err.type === 'unavailable-id') {
          // In rare case room code collided, retry with another code
          this.hostGame(playerInfo).then(resolve).catch(reject);
        } else {
          this.trigger('error', { message: 'Peer connection error: ' + (err.message || err.type) });
          reject(err);
        }
      });
    });
  }

  handleIncomingClientConnection(conn) {
    console.log(`[Host] Client connecting: ${conn.peer}`);

    conn.on('open', () => {
      this.clients.set(conn.peer, conn);

      conn.on('data', (data) => {
        this.handleClientMessage(conn.peer, data);
      });

      conn.on('close', () => {
        console.log(`[Host] Client disconnected: ${conn.peer}`);
        this.clients.delete(conn.peer);
        this.trigger('player_disconnected', { peerId: conn.peer });
        this.broadcast({
          type: 'player_left',
          peerId: conn.peer
        });
      });
    });
  }

  handleClientMessage(fromPeerId, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'join':
        this.trigger('client_join_request', {
          peerId: fromPeerId,
          player: data.player,
          sendAccept: (gameState) => {
            this.sendTo(fromPeerId, {
              type: 'joined_ok',
              gameState
            });
            // Inform everyone else about new player
            this.broadcast({
              type: 'player_joined',
              player: data.player
            }, fromPeerId);
          }
        });
        break;

      case 'start_expand':
        this.trigger('client_start_expand', { peerId: fromPeerId, data: data.payload });
        break;

      case 'release_expand':
        this.trigger('client_release_expand', { peerId: fromPeerId, data: data.payload });
        break;

      case 'cursor_move':
        this.trigger('client_cursor_move', { peerId: fromPeerId, data: data.payload });
        break;

      default:
        this.trigger('client_message', { peerId: fromPeerId, data });
        break;
    }
  }

  // --- JOIN AN EXISTING GAME ---
  joinGame(roomCode, playerInfo) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.roomCode = roomCode.toUpperCase().trim();
      const targetHostPeerId = this.getPeerIdForRoom(this.roomCode);

      try {
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });
      } catch (err) {
        return reject(err);
      }

      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timed out. Check room code or host availability.'));
      }, 12000);

      this.peer.on('open', (myPeerId) => {
        this.myId = myPeerId;
        console.log(`[Client] Connecting to host: ${targetHostPeerId}`);

        this.hostConn = this.peer.connect(targetHostPeerId, {
          reliable: true
        });

        this.hostConn.on('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          console.log('[Client] Connected to host!');

          // Send join handshake
          this.sendToHost({
            type: 'join',
            player: playerInfo
          });

          this.hostConn.on('data', (data) => {
            this.handleHostMessage(data, resolve);
          });

          this.hostConn.on('close', () => {
            console.warn('[Client] Lost connection to host');
            this.isConnected = false;
            this.trigger('host_disconnected');
          });
        });

        this.hostConn.on('error', (err) => {
          clearTimeout(connectionTimeout);
          console.error('[Client] Connection error:', err);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(connectionTimeout);
        console.error('[Client] Peer error:', err);
        let msg = 'Failed to connect.';
        if (err.type === 'peer-unavailable') {
          msg = `Room "${this.roomCode}" not found. Verify the code with the host.`;
        }
        reject(new Error(msg));
      });
    });
  }

  handleHostMessage(data, resolvePromise) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'joined_ok':
        if (resolvePromise) resolvePromise(data.gameState);
        this.trigger('joined_success', data.gameState);
        break;

      case 'player_joined':
        this.trigger('player_joined', data.player);
        break;

      case 'player_left':
        this.trigger('player_left', { peerId: data.peerId });
        break;

      case 'game_start':
        this.trigger('game_start', data.settings);
        break;

      case 'sync_state':
        this.trigger('sync_state', data.state);
        break;

      case 'expand_started':
        this.trigger('remote_expand_start', data.payload);
        break;

      case 'expand_released':
        this.trigger('remote_expand_release', data.payload);
        break;

      case 'expand_popped':
        this.trigger('remote_expand_pop', data.payload);
        break;

      case 'territory_claimed':
        this.trigger('remote_territory_claimed', data.payload);
        break;

      case 'game_over':
        this.trigger('game_over', data.results);
        break;

      default:
        this.trigger('host_message', data);
        break;
    }
  }

  // --- SENDING METHODS ---

  sendToHost(data) {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(data);
    }
  }

  sendTo(peerId, data) {
    const conn = this.clients.get(peerId);
    if (conn && conn.open) {
      conn.send(data);
    }
  }

  broadcast(data, excludePeerId = null) {
    for (const [peerId, conn] of this.clients.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(data);
      }
    }
  }

  destroy() {
    this.stopAllExpands?.();
    if (this.hostConn) {
      try { this.hostConn.close(); } catch (e) {}
    }
    for (const conn of this.clients.values()) {
      try { conn.close(); } catch (e) {}
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.clients.clear();
    this.isConnected = false;
  }
}

window.networkManager = new NetworkManager();
