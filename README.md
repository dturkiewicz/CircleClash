# ⭕ Circle Clash: Multiplayer Territory Conquest

A real-time, 100% serverless multiplayer HTML5 canvas game. Players click/touch and hold to expand territorial circles and release to lock in their claimed ground. If two expanding circles collide before releasing, **both POP** in an explosion of sparks!

Built with **HTML5 Canvas**, **Web Audio API**, and **PeerJS (WebRTC DataChannels)** for direct peer-to-peer browser networking with zero backend costs.

---

## 🎮 How to Play

1. **Expand**: Click & hold (or touch & hold on mobile, or hold `Spacebar`). Your colored circle expands outward from where you clicked.
2. **The Clash**: If your expanding circle touches an opponent's *currently expanding* circle, both pop and you lose that attempt!
3. **Lock In**: Release to solidify your circle as permanent territory on the arena.
4. **Win**: When the countdown timer reaches zero, the player with the highest percentage of arena coverage wins the crown! 👑

---

## 🚀 Quick Start (Play Right Away)

### Option 1: Run Locally with Node.js
No `npm install` needed! Uses built-in Node standard library:

```bash
npm start
```
or:
```bash
node server.js
```

Then open:
- **Local Machine**: [http://localhost:3000](http://localhost:3000)
- **Same Wi-Fi / LAN (Phones & other PCs)**: The console will print your network IP (e.g., `http://192.168.1.50:3000`).

---

### Option 2: 100% Free Cloud Deployment (GitHub Pages / Netlify / Vercel)

Since Circle Clash uses PeerJS WebRTC, **no backend server is needed**:
1. **GitHub Pages**:
   - Push this folder to a GitHub repository.
   - Go to **Settings** > **Pages** > Select branch `main` and root `/`.
   - Your game is live worldwide over HTTPS!
2. **Netlify / Vercel**:
   - Drag and drop this folder directly into the Netlify or Vercel dashboard.

---

## 🌐 Instant Sharing & Rooms

- **Host a Room**: Click **"Host Game"** $\rightarrow$ Click **"Create Room"**. The game generates a 5-character Room Code (e.g. `WARP7`) and gives you a 1-click **"Copy Link"** button.
- **Join a Room**: Share the link (`https://.../?room=WARP7`) with friends. Opening the link will auto-fill the code so they can join immediately!
- **Solo Practice Mode**: Click the **"Solo Practice"** tab to instantly play against 2 intelligent AI bots.

---

## 🛠️ Technology Stack

- **Graphics**: HTML5 `<canvas>` rendering at a smooth 60 FPS with responsive virtual resolution ($1600 \times 900$) and letterboxing.
- **Sound**: Web Audio API synthesizer for procedural sound effects (rising expansion oscillator, bass pop blast, claim chimes, countdown beeps, and victory fanfare).
- **Networking**: PeerJS WebRTC DataChannels for low-latency peer-to-peer communication.
- **Coverage Engine**: Off-screen color-indexing buffer calculating exact real-time territory ownership percentages.
