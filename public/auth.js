(function () {
    // DOM Elements
    const authScreen = document.getElementById('auth-screen');
    const menuScreen = document.getElementById('menu-screen');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const loginBtn = document.getElementById('auth-login-btn');
    const signupBtn = document.getElementById('auth-signup-btn');
    const authError = document.getElementById('auth-error');

    // Auto-fill lobby name when authenticated
    const playerNameInput = document.getElementById('player-name-input');

    // const SERVER_URL = 'http://localhost:3000'; // Removed for production relative paths
    const BACKEND_URL = window.location.hostname.includes('vercel.app')
        ? 'https://web-production-53a37.up.railway.app'
        : '';

    function showError(msg) {
        authError.textContent = msg;
        authError.style.display = 'block';
        setTimeout(() => { authError.style.display = 'none'; }, 3000);
        // Using audioSystem if it's available globally, else ignore
        if (window.audioSystem) window.audioSystem.playError();
    }

    async function handleAuth(type) {
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();

        if (!username || !password) {
            showError('Callsign and encryption key required!');
            return;
        }

        loginBtn.disabled = true;
        signupBtn.disabled = true;

        try {
            const res = await fetch(`${BACKEND_URL}/api/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (data.success) {
                // Success
                if (window.audioSystem) window.audioSystem.playBuy();

                // Store globally and in lobby input
                window.currentUser = username;
                localStorage.setItem('ds_username', username);
                localStorage.setItem('ds_password', password); // Plaintext in local for auto-login

                if (playerNameInput) {
                    playerNameInput.value = username;
                    playerNameInput.disabled = true; // Lock it to their login name
                }

                // Hide Auth, Show Menu
                authScreen.classList.add('hidden');
                menuScreen.classList.remove('hidden');
            } else {
                showError(data.error || 'Authentication failed');
                localStorage.removeItem('ds_username');
                localStorage.removeItem('ds_password');
            }
        } catch (e) {
            showError('Server connection failed. Is it running?');
        } finally {
            loginBtn.disabled = false;
            signupBtn.disabled = false;
        }
    }

    loginBtn.addEventListener('click', () => handleAuth('login'));
    signupBtn.addEventListener('click', () => handleAuth('signup'));

    // Handle enter key
    authPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAuth('login');
    });

    // Logout logic
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('ds_username');
            localStorage.removeItem('ds_password');
            localStorage.removeItem('ds_last_room');
            if (window.audioSystem) window.audioSystem.playClick();

            // Hard reload for clean state
            window.location.reload();
        });
    }

    // Auto-login if data exists
    const storedUser = localStorage.getItem('ds_username');
    const storedPass = localStorage.getItem('ds_password');
    if (storedUser && storedPass) {
        authUsernameInput.value = storedUser;
        authPasswordInput.value = storedPass;
        if (playerNameInput) {
            playerNameInput.value = storedUser;
            playerNameInput.disabled = true;
        }
        handleAuth('login');
    }
})();
