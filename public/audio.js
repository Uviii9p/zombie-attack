export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.isInitialized = false;
        this.muted = false;
    }

    init() {
        if (this.isInitialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.5; // Default volume
        this.masterVolume.connect(this.ctx.destination);

        this.isInitialized = true;
        this.startEngineLoop();
    }

    play(soundName, position = null) {
        if (!this.isInitialized || this.muted) return;

        const name = soundName.toLowerCase();

        switch (name) {
            case 'buy': this.playBuy(); break;
            case 'error': this.playError(); break;
            case 'click': this.playClick(); break;
            case 'ui_hover': this.playUiHover(); break;
            case 'hit_marker': this.playHitMarker(); break;
            case 'shoot_ak47': this.playShootAK(); break;
            case 'shoot_sniper': this.playShootSniper(); break;
            case 'shoot_rpg': this.playShootRPG(); break;
            case 'zombie_death': this.playZombieDeath(); break;
            case 'zombie_hit': this.playZombieHit(); break;
            case 'zombie_groan': this.playZombieGroan(); break;
            case 'player_hurt': case 'player_hit': this.playPlayerHit(); break;
            case 'explosion': this.playExplosion(); break;
            case 'coin': this.playCoin(); break;
            case 'level_up': this.playLevelUp(); break;
            case 'empty_click': this.playEmptyClick(); break;
            case 'impact': this.playImpactVariation(); break;
            case 'boss_roar': this.playBossRoar(); break;
            default:
                console.warn(`AudioSystem: Sound "${soundName}" not found.`);
        }
    }

    playTone(freq, type, duration, vol = 1) {
        if (!this.isInitialized || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterVolume);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, type = 'white', vol = 1) {
        if (!this.isInitialized || this.muted) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (type === 'pink' ? 0.3 : 1);
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = type === 'pink' ? 'lowpass' : 'bandpass';
        filter.frequency.value = type === 'pink' ? 500 : 1000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);

        noiseSource.start();
    }

    playClick() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(800, 'sine', 0.05, 0.3);
    }

    playBuy() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(987.77, 'sine', 0.1, 0.3); // B5
        setTimeout(() => this.playTone(1318.51, 'sine', 0.3, 0.4), 100); // E6
    }

    playError() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(150, 'sawtooth', 0.2, 0.4);
    }

    playShootAK() {
        if (!this.isInitialized || this.muted) return;
        this.playNoise(0.2, 'white', 0.8);
        this.playTone(150, 'square', 0.1, 0.5); // thump
    }

    playShootSniper() {
        if (!this.isInitialized || this.muted) return;
        this.playNoise(0.5, 'pink', 1.5);
        this.playTone(80, 'square', 0.4, 1.0); // deep boom
    }

    playShootRPG() {
        if (!this.isInitialized || this.muted) return;
        // Launch sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }

    playExplosion() {
        if (!this.isInitialized || this.muted) return;
        this.playNoise(1.2, 'pink', 2.0);
        this.playTone(40, 'sawtooth', 1.0, 1.5); // Deep rumble
    }

    playZombieGroan() {
        if (!this.isInitialized || this.muted) return;
        if (Math.random() > 0.25) return; // Don't play every time — but more often
        const t = this.ctx.currentTime;

        // Deep guttural drone
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        const baseFreq = 55 + Math.random() * 30;
        osc1.frequency.setValueAtTime(baseFreq, t);
        osc1.frequency.linearRampToValueAtTime(baseFreq - 20, t + 1.2);

        // Eerie second voice slightly detuned for dissonance
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(baseFreq * 1.02, t); // slight detune = creepy
        osc2.frequency.linearRampToValueAtTime(baseFreq * 0.97, t + 1.2);

        // Vibrato LFO for trembling zombie vocal cord effect
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 5 + Math.random() * 4; // 5-9 Hz wobble
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 8; // pitch wobble depth
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        // Bandpass filter for muffled groaning quality
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 300 + Math.random() * 200;
        filter.Q.value = 3;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.4, t + 0.15); // quick attack
        gain.gain.linearRampToValueAtTime(0.3, t + 0.6);
        gain.gain.linearRampToValueAtTime(0, t + 1.2); // slow release

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);

        lfo.start(t);
        osc1.start(t);
        osc2.start(t);
        lfo.stop(t + 1.2);
        osc1.stop(t + 1.2);
        osc2.stop(t + 1.2);
    }

    playZombieHit() {
        if (!this.isInitialized || this.muted) return;
        const t = this.ctx.currentTime;

        // Wet flesh impact
        this.playNoise(0.15, 'pink', 0.8);

        // Short pained grunt
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    playZombieDeath() {
        if (!this.isInitialized || this.muted) return;
        const t = this.ctx.currentTime;

        // Long descending screaming growl
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(180, t);
        osc1.frequency.exponentialRampToValueAtTime(30, t + 1.5);

        // Second voice — horrific dissonance
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(195, t);
        osc2.frequency.exponentialRampToValueAtTime(25, t + 1.5);

        // Trembling vibrato
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 7;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 15;
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        // Distortion via waveshaper for horror quality
        const waveshaper = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = (Math.PI + 4) * x / (Math.PI + 4 * Math.abs(x)); // soft clip
        }
        waveshaper.curve = curve;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(200, t + 1.5);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.linearRampToValueAtTime(0.4, t + 0.5);
        gain.gain.linearRampToValueAtTime(0, t + 1.5);

        // Wet body collapse noise
        this.playNoise(0.6, 'pink', 1.0);

        osc1.connect(waveshaper);
        osc2.connect(waveshaper);
        waveshaper.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);

        lfo.start(t);
        osc1.start(t);
        osc2.start(t);
        lfo.stop(t + 1.5);
        osc1.stop(t + 1.5);
        osc2.stop(t + 1.5);
    }

    playPlayerHit() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(300, 'sawtooth', 0.2, 0.8);
        this.playNoise(0.2, 'white', 0.6);
    }

    playCoin() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(1200, 'sine', 0.1, 0.2);
    }

    playHitMarker() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(1800, 'sine', 0.05, 0.15); // Very short high pitch click
    }

    playUiHover() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(1200, 'triangle', 0.03, 0.08);
    }

    playImpactVariation() {
        if (!this.isInitialized || this.muted) return;
        const f = 240 + Math.random() * 420;
        this.playTone(f, 'square', 0.035, 0.12);
    }

    playBossRoar() {
        if (!this.isInitialized || this.muted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 1.2);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1.2);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start(t);
        osc.stop(t + 1.2);
    }

    playWaveMusicIntensity(wave = 1, boss = false) {
        if (!this.isInitialized || this.muted) return;
        const base = boss ? 170 : Math.min(145, 90 + wave * 4);
        this.playTone(base, boss ? 'sawtooth' : 'triangle', 0.18, boss ? 0.22 : 0.12);
        this.playTone(base * 1.5, 'sine', 0.14, 0.08);
    }

    playHeartbeatLowHp() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(72, 'sine', 0.08, 0.25);
    }

    startEngineLoop() {
        if (!this.isInitialized) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 40; // Idle speed

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0; // Silent by default

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400; // Muffled engine

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.masterVolume);

        this.engineOsc.start();
    }

    updateEngineSpeed(speedRatio, isOccupied) {
        if (!this.isInitialized || !this.engineOsc || this.muted) return;

        if (isOccupied) {
            // Smoothly ramp volume up if occupied
            this.engineGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.1);
            // Change frequency based on speed (absolute ratio 0.0 to 1.0)
            const freq = 40 + (speedRatio * 100);
            this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        } else {
            // Silence if not occupied
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
    }

    playLevelUp() {
        if (!this.isInitialized || this.muted) return;
        const now = this.ctx.currentTime;
        [440, 554, 659, 880].forEach((f, i) => {
            this.playTone(f, 'square', 0.2, 0.15);
        });
    }

    playEmptyClick() {
        if (!this.isInitialized || this.muted) return;
        this.playTone(150, 'square', 0.05, 0.2);
    }
}

export const audioSystem = new AudioSystem();
