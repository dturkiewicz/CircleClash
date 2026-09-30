/**
 * NetworkManager using PeerJS (WebRTC DataChannels)
 * Simplified, reliable, flat-event networking layer.
 */
class NetworkManager {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.myId = null;
    this.hostConn = null;
    this.clients = new Map(); // peerId -> DataConnection
    this.callbacks = {};
    this.isConnected = false;
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      for (const cb of this.callbacks[event]) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

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

  // --- HOST GAME ---
  hostGame(playerInfo) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.roomCode = this.generateRoomCode();
      const hostPeerId = this.getPeerIdForRoom(this.roomCode);

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
        console.log(`[Host] Created room ${this.roomCode}`);
        resolve({ roomCode: this.roomCode, peerId: id });
      });

      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.clients.set(conn.peer, conn);

          conn.on('data', (msg) => {
            if (msg && msg.type) {
              this.trigger(msg.type, { ...msg, fromPeerId: conn.peer });
            }
          });

          conn.on('close', () => {
            this.clients.delete(conn.peer);
            this.trigger('PLAYER_LEFT', { peerId: conn.peer });
          });
        });
      });

      this.peer.on('error', (err) => {
        console.error('[Host] Peer error:', err);
        if (err.type === 'unavailable-id') {
          this.hostGame(playerInfo).then(resolve).catch(reject);
        } else {
          this.trigger('ERROR', { message: err.message || err.type });
          reject(err);
        }
      });
    });
  }

  // --- JOIN GAME ---
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

      const timer = setTimeout(() => {
        reject(new Error('Connection timed out. Check room code.'));
      }, 12000);

      this.peer.on('open', (myPeerId) => {
        this.myId = myPeerId;

        this.hostConn = this.peer.connect(targetHostPeerId, {
          reliable: true
        });

        this.hostConn.on('open', () => {
          clearTimeout(timer);
          this.isConnected = true;
          console.log('[Client] Connected to host!');

          // Send join handshake
          this.sendToHost({
            type: 'JOIN_REQUEST',
            player: playerInfo
          });

          this.hostConn.on('data', (msg) => {
            if (msg && msg.type) {
              if (msg.type === 'JOIN_ACCEPTED' && resolve) {
                resolve(msg.gameState);
              }
              this.trigger(msg.type, msg);
            }
          });

          this.hostConn.on('close', () => {
            if (this.isConnected) {
              this.isConnected = false;
              this.trigger('HOST_DISCONNECTED', { message: 'Host disconnected from the match.' });
            }
          });

          // Detect raw WebRTC disconnection immediately
          if (this.hostConn.peerConnection) {
            this.hostConn.peerConnection.addEventListener('connectionstatechange', () => {
              const state = this.hostConn.peerConnection?.connectionState;
              if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                if (this.isConnected) {
                  this.isConnected = false;
                  this.trigger('HOST_DISCONNECTED', { message: 'Host disconnected from the match.' });
                }
              }
            });
          }
        });

        this.hostConn.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timer);
        let msg = 'Failed to connect.';
        if (err.type === 'peer-unavailable') {
          msg = `Room "${this.roomCode}" not found. Verify the code with the host.`;
        }
        reject(new Error(msg));
      });
    });
  }

  // --- SENDING METHODS ---
  sendToHost(msg) {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg);
    }
  }

  sendTo(peerId, msg) {
    const conn = this.clients.get(peerId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  broadcast(msg, excludePeerId = null) {
    for (const [peerId, conn] of this.clients.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(msg);
      }
    }
  }

  destroy() {
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
