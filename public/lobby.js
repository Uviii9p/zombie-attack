// ========== LOBBY CLIENT ==========
(function () {
    const AVATARS = ['🪖', '💀', '🎖️', '🔫'];
    let socket = null;
    let selectedAvatar = 0;
    let currentRoomData = null;
    let mySocketId = null;
    let isReady = false;

    // DOM Elements
    const lobbyScreen = document.getElementById('lobby-screen');
    const lobbyEntry = document.getElementById('lobby-entry');
    const lobbyRoom = document.getElementById('lobby-room');
    const menuScreen = document.getElementById('menu-screen');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const playerNameInput = document.getElementById('player-name-input');
    const roomCodeInput = document.getElementById('room-code-input');
    const lobbyError = document.getElementById('lobby-error');
    const roomCodeText = document.getElementById('room-code-text');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const playersGrid = document.getElementById('players-grid');
    const readyBtn = document.getElementById('ready-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    // Avatar selection
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedAvatar = parseInt(opt.dataset.avatar);
            localStorage.setItem('ds_avatar', selectedAvatar);
        });
    });

    // Show lobby
    if (multiplayerBtn) {
        multiplayerBtn.addEventListener('click', () => {
            menuScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            lobbyEntry.classList.remove('hidden');
            lobbyRoom.classList.add('hidden');
            lobbyError.textContent = '';
            connectSocket();
        });
    }

    // Back to menu
    if (lobbyBackBtn) {
        lobbyBackBtn.addEventListener('click', () => {
            lobbyScreen.classList.add('hidden');
            menuScreen.classList.remove('hidden');
            if (socket) socket.disconnect();
        });
    }

    function connectSocket() {
        if (socket && socket.connected) return;

        // Use Railway backend even if on Vercel to support WebSockets
        const BACKEND_URL = window.location.hostname.includes('vercel.app')
            ? 'https://web-production-53a37.up.railway.app'
            : window.location.origin;

        socket = io(BACKEND_URL);

        socket.on('connect', () => {
            mySocketId = socket.id;
            console.log('Connected to lobby server:', mySocketId);
        });

        socket.on('connect_error', (error) => {
            console.error('Socket Connection Error:', error);
            lobbyError.textContent = 'Multiplayer server unreachable. Use Solo Play or deploy to Railway!';
            lobbyError.style.display = 'block';
        });

        socket.on('room-created', (data) => {
            currentRoomData = data;
            window.isLobbyHost = (data.hostId === mySocketId);
            showRoom(data);
        });

        socket.on('room-joined', (data) => {
            currentRoomData = data;
            window.isLobbyHost = (data.hostId === mySocketId);
            showRoom(data);
        });

        socket.on('room-updated', (data) => {
            currentRoomData = data;
            window.isLobbyHost = (data.hostId === mySocketId);
            renderPlayers(data);
            updateHostControls(data);
        });

        socket.on('join-error', (msg) => {
            lobbyError.textContent = msg;
            lobbyError.style.display = 'block';
            setTimeout(() => { lobbyError.style.display = 'none'; }, 3000);
        });

        socket.on('chat-message', (msg) => {
            addChatMessage(msg);
        });

        socket.on('game-starting', (data) => {
            if (data.gameStarted) {
                // Rejoin: skip countdown
                lobbyScreen.classList.add('hidden');
                window.lobbySocket = socket;
                window.lobbyPlayerName = playerNameInput.value.trim();
                window.lobbyAvatar = selectedAvatar;
                window.isLobbyHost = (currentRoomData && currentRoomData.hostId === mySocketId);
                window.dispatchEvent(new CustomEvent('lobby-start-game', { detail: data }));
            } else {
                // Fresh start: show countdown
                addChatMessage({ sender: 'SYSTEM', text: '🎮 GAME STARTING IN 3...', type: 'system' });
                setTimeout(() => addChatMessage({ sender: 'SYSTEM', text: '2...', type: 'system' }), 1000);
                setTimeout(() => addChatMessage({ sender: 'SYSTEM', text: '1...', type: 'system' }), 2000);
                setTimeout(() => {
                    lobbyScreen.classList.add('hidden');
                    window.lobbySocket = socket;
                    window.lobbyPlayerName = playerNameInput.value.trim();
                    window.lobbyAvatar = selectedAvatar;
                    window.isLobbyHost = (currentRoomData && currentRoomData.hostId === mySocketId);
                    window.dispatchEvent(new CustomEvent('lobby-start-game', { detail: data }));
                }, 3000);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from lobby server');
        });
    }

    // Create Room
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (!name) {
                lobbyError.textContent = 'Please enter your callsign!';
                lobbyError.style.display = 'block';
                return;
            }
            socket.emit('create-room', { playerName: name, avatar: selectedAvatar });
        });
    }

    // Join Room
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            const code = roomCodeInput.value.trim().toUpperCase();
            if (!name) {
                lobbyError.textContent = 'Please enter your callsign!';
                lobbyError.style.display = 'block';
                return;
            }
            if (!code || code.length < 4) {
                lobbyError.textContent = 'Please enter a valid room code!';
                lobbyError.style.display = 'block';
                return;
            }
            socket.emit('join-room', { roomCode: code, playerName: name, avatar: selectedAvatar });
        });
    }

    // Ready toggle
    if (readyBtn) {
        readyBtn.addEventListener('click', () => {
            isReady = !isReady;
            readyBtn.textContent = isReady ? '✓ READY!' : 'READY UP';
            readyBtn.classList.toggle('is-ready', isReady);
            socket.emit('toggle-ready');
        });
    }

    // Start Game (host only)
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            socket.emit('start-game');
        });
    }

    // Leave Room
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            socket.emit('leave-room');
            localStorage.removeItem('ds_last_room');
            lobbyRoom.classList.add('hidden');
            lobbyEntry.classList.remove('hidden');
            currentRoomData = null;
            isReady = false;
            readyBtn.textContent = 'READY UP';
            readyBtn.classList.remove('is-ready');
            chatMessages.innerHTML = '<div class="chat-msg system">Welcome to the lobby!</div>';
        });
    }

    // Copy Code
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(roomCodeText.textContent);
            copyCodeBtn.textContent = '✓';
            setTimeout(() => copyCodeBtn.textContent = '📋', 2000);
        });
    }

    // Chat
    function sendChat() {
        const text = chatInput.value.trim();
        if (!text) return;
        socket.emit('chat-message', text);
        chatInput.value = '';
    }

    if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
    if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

    function addChatMessage(msg) {
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.type}`;
        if (msg.type === 'system') {
            div.textContent = msg.text;
        } else {
            div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text}`;
        }
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Room view (shown after creating/joining)
    function showRoom(data) {
        lobbyEntry.classList.add('hidden');
        lobbyRoom.classList.remove('hidden');
        roomCodeText.textContent = data.code;
        localStorage.setItem('ds_last_room', data.code);
        renderPlayers(data);
        updateHostControls(data);
    }

    // Avatar selection init
    const savedAvatar = localStorage.getItem('ds_avatar');
    if (savedAvatar !== null) {
        selectedAvatar = parseInt(savedAvatar);
        document.querySelectorAll('.avatar-option').forEach(opt => {
            opt.classList.toggle('selected', parseInt(opt.dataset.avatar) === selectedAvatar);
        });
    }

    // Auto-rejoin logic after a small delay to ensure auth.js finishes
    setTimeout(() => {
        const lastRoom = localStorage.getItem('ds_last_room');
        const username = localStorage.getItem('ds_username');
        if (lastRoom && username) {
            console.log('Attempting auto-rejoin to:', lastRoom);
            menuScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            connectSocket();
            // Wait for connection
            const checkConn = setInterval(() => {
                if (socket && socket.connected) {
                    clearInterval(checkConn);
                    socket.emit('join-room', {
                        roomCode: lastRoom,
                        playerName: username,
                        avatar: selectedAvatar
                    });
                }
            }, 500);
        }
    }, 1000);

    function renderPlayers(data) {
        playersGrid.innerHTML = '';
        for (let i = 0; i < data.maxPlayers; i++) {
            const player = data.players[i];
            const slot = document.createElement('div');
            slot.className = `player-slot ${player ? 'occupied' : 'empty'}`;

            if (player) {
                slot.innerHTML = `
                    <div class="player-avatar">${AVATARS[player.avatar] || '🪖'}</div>
                    <div class="player-info">
                        <span class="player-name">${player.name}</span>
                        ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
                    </div>
                    <div class="player-status ${player.ready ? 'ready' : 'not-ready'}">${player.ready ? '✓ READY' : 'WAITING'}</div>
                `;
            } else {
                slot.innerHTML = `
                    <div class="player-avatar empty-avatar">?</div>
                    <div class="player-info"><span class="player-name empty-name">Waiting for player...</span></div>
                `;
            }
            playersGrid.appendChild(slot);
        }
    }

    function updateHostControls(data) {
        const amIHost = data.hostId === mySocketId;
        if (amIHost) {
            startGameBtn.classList.remove('hidden');
        } else {
            startGameBtn.classList.add('hidden');
        }
    }
})();
