const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.io - Note: Vercel does not support persistent WebSockets
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const fs = require('fs');

// Helpers for Serverless check
const IS_VERCEL = process.env.VERCEL === '1';

// ==================== AUTH SYSTEM ====================
const USERS_FILE = path.join(__dirname, 'users.json');
const DATA_FILE = path.join(__dirname, 'game_data.json');

// Initialize users DB
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ coins: 0, kill_count: 0 }));

function getUsers() {
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; }
}
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.warn("Could not save users to local file (Normal on Vercel):", e.message);
    }
}

function getGameData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { coins: 0, kill_count: 0 };
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch { return { coins: 0, kill_count: 0 }; }
}
function saveGameData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.warn("Could not save game data to local file (Normal on Vercel):", e.message);
    }
}

app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const users = getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username already exists' });
    users.push({ username, password });
    saveUsers(users);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, username: user.username });
});

// ==================== STATS SYSTEM (Ported from Flask) ====================
app.get('/api/get-stats', (req, res) => {
    res.json(getGameData());
});

app.post('/api/update-coins', (req, res) => {
    const { amount, absolute } = req.body;
    let data = getGameData();
    if (absolute) {
        data.coins = Math.max(0, amount);
    } else {
        data.coins = Math.max(0, data.coins + amount);
        if (amount > 0) data.kill_count = (data.kill_count || 0) + 1;
    }
    saveGameData(data);
    res.json({ status: "success", new_balance: data.coins });
});

// ==================== LOBBY SYSTEM ====================
const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function getRoomData(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return null;
    return {
        code: room.code,
        hostId: room.hostId,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            ready: p.ready,
            isHost: p.id === room.hostId,
            avatar: p.avatar
        })),
        gameStarted: room.gameStarted,
        maxPlayers: room.maxPlayers
    };
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    let currentRoom = null;

    socket.on('create-room', ({ playerName, avatar }) => {
        let code;
        do { code = generateRoomCode(); } while (rooms.has(code));

        const room = {
            code,
            hostId: socket.id,
            players: [{ id: socket.id, name: playerName, ready: false, avatar: avatar || 0 }],
            gameStarted: false,
            maxPlayers: 4,
            createdAt: Date.now()
        };
        rooms.set(code, room);
        currentRoom = code;
        socket.join(code);
        socket.emit('room-created', getRoomData(code));
        console.log(`Room ${code} created by ${playerName}`);
    });

    socket.on('join-room', ({ roomCode, playerName, avatar }) => {
        const code = roomCode.toUpperCase();
        const room = rooms.get(code);

        if (!room) return socket.emit('join-error', 'Room not found! Check your code.');
        if (room.players.length >= room.maxPlayers && !room.players.find(p => p.name === playerName)) {
            return socket.emit('join-error', 'Room is full!');
        }

        const existingPlayer = room.players.find(p => p.name === playerName);
        if (existingPlayer) {
            // Reconnecting/Rejoining: update ID
            existingPlayer.id = socket.id;
            console.log(`${playerName} rejoined room ${code} (ID updated)`);
        } else {
            room.players.push({ id: socket.id, name: playerName, ready: false, avatar: avatar || 0 });
            console.log(`${playerName} joined room ${code}`);
        }

        currentRoom = code;
        socket.join(code);

        // Tell the joiner to show the room view
        socket.emit('room-joined', getRoomData(code));

        // If game is already in progress, tell the joiner to start immediately
        if (room.gameStarted) {
            socket.emit('game-starting', getRoomData(code));
        }

        // Tell everyone (including joiner) to update player list
        io.to(code).emit('room-updated', getRoomData(code));
        io.to(code).emit('chat-message', { sender: 'SYSTEM', text: `${playerName} ${existingPlayer ? 're-established connection' : 'joined the lobby!'}`, type: 'system' });
    });

    socket.on('toggle-ready', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = !player.ready;
            // Immediate sync of ready state
            io.to(currentRoom).emit('room-updated', getRoomData(currentRoom));
        }
    });

    socket.on('chat-message', (text) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            io.to(currentRoom).emit('chat-message', {
                sender: player.name,
                text,
                type: 'player'
            });
        }
    });

    socket.on('start-game', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;
        room.gameStarted = true;
        io.to(currentRoom).emit('game-starting', getRoomData(currentRoom));
        io.to(currentRoom).emit('chat-message', { sender: 'SYSTEM', text: 'Game is starting!', type: 'system' });
    });

    // ============ IN-GAME SYNC ============
    socket.on('player-move', (data) => {
        if (!currentRoom) return;
        // Broadcast this player's position/rotation to all others in the room
        socket.to(currentRoom).emit('player-moved', {
            id: socket.id,
            x: data.x, y: data.y, z: data.z,
            ry: data.ry,
            name: data.name,
            avatar: data.avatar,
            health: data.health,
            weapon: data.weapon,
            isDriving: data.isDriving
        });
    });

    socket.on('player-shoot', (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('player-shot', {
            id: socket.id,
            weapon: data.weapon,
            x: data.x, y: data.y, z: data.z,
            dx: data.dx, dy: data.dy, dz: data.dz
        });
    });

    socket.on('player-hit-zombie', (data) => {
        if (!currentRoom) return;
        // Broadcast to EVERYONE in the room including the sender to ensure state consistency
        io.to(currentRoom).emit('zombie-hit-sync', {
            id: socket.id,
            zombieIndex: data.zombieIndex,
            damage: data.damage
        });
    });

    socket.on('wave-cleared-sync', (wave) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('wave-cleared-sync', wave);
    });

    socket.on('wave-start-sync', (wave) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('wave-start-sync', wave);
    });

    socket.on('leave-room', () => {
        leaveRoom(socket);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        // Notify room that player left so their mesh gets removed
        if (currentRoom) {
            io.to(currentRoom).emit('player-left', { id: socket.id });
        }
        leaveRoom(socket);
    });

    function leaveRoom(sock) {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find(p => p.id === sock.id);
        const playerName = player ? player.name : 'Unknown';
        room.players = room.players.filter(p => p.id !== sock.id);

        if (room.players.length === 0) {
            rooms.delete(currentRoom);
            console.log(`Room ${currentRoom} dissolved (empty)`);
        } else {
            // Transfer host if needed
            if (room.hostId === sock.id) {
                room.hostId = room.players[0].id;
                io.to(currentRoom).emit('chat-message', { sender: 'SYSTEM', text: `${room.players[0].name} is now the host!`, type: 'system' });
            }
            io.to(currentRoom).emit('room-updated', getRoomData(currentRoom));
            io.to(currentRoom).emit('chat-message', { sender: 'SYSTEM', text: `${playerName} left the lobby.`, type: 'system' });
        }

        sock.leave(currentRoom);
        currentRoom = null;
    }
});

// Cleanup stale rooms every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.createdAt > 3600000) { // 1 hour
            rooms.delete(code);
            console.log(`Stale room ${code} cleaned up`);
        }
    }
}, 300000);

// ==================== START SERVER (Production guard) ====================
if (!IS_VERCEL) {
    server.listen(PORT, () => {
        console.log(`Game server running on http://localhost:${PORT}`);
        console.log(`Lobby system active with Socket.IO`);
    });
}

// Export for Vercel Serverless
module.exports = app;

