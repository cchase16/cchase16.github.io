export class AudioManager {
  constructor() {
    this.soundCache = new Map();
    this.trackCache = new Map();
    this.currentTrack = null;
    this.audioContext = null;
    this.obstacleHitAudio = new Audio("SoundEffects/Bounce.mp3");
    this.obstacleHitAudio.preload = "auto";
  }

  preload(catalog) {
    for (const sound of catalog.sounds) {
      const audio = new Audio(sound.location);
      audio.preload = "auto";
      this.soundCache.set(sound.id, audio);
    }

    for (const track of catalog.tracks) {
      const audio = new Audio(track.location);
      audio.preload = "auto";
      audio.loop = true;
      this.trackCache.set(track.id, audio);
    }
  }

  playSound(soundId) {
    const baseAudio = this.soundCache.get(soundId);
    if (!baseAudio) {
      return;
    }

    const audio = baseAudio.cloneNode(true);
    audio.volume = 0.65;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  playTrack(trackId) {
    if (!this.trackCache.has(trackId)) {
      return;
    }

    if (this.currentTrack && this.currentTrack !== this.trackCache.get(trackId)) {
      this.currentTrack.pause();
      this.currentTrack.currentTime = 0;
    }

    const audio = this.trackCache.get(trackId);
    this.currentTrack = audio;
    audio.loop = true;
    audio.volume = 0.38;
    audio.play().catch(() => {});
  }

  stopTrack() {
    if (!this.currentTrack) {
      return;
    }
    this.currentTrack.pause();
    this.currentTrack.currentTime = 0;
  }

  getAudioContext() {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  unlock() {
    this.getAudioContext()?.resume().catch(() => {});
  }

  playMultiplierBlast(multiplierValue) {
    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    context.resume().catch(() => {});

    const now = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    masterGain.connect(context.destination);

    const lead = context.createOscillator();
    lead.type = "square";
    lead.frequency.setValueAtTime(320 * multiplierValue, now);
    lead.frequency.exponentialRampToValueAtTime(820 * multiplierValue, now + 0.08);
    lead.frequency.exponentialRampToValueAtTime(560 * multiplierValue, now + 0.24);
    lead.connect(masterGain);
    lead.start(now);
    lead.stop(now + 0.36);

    const accent = context.createOscillator();
    accent.type = "triangle";
    accent.frequency.setValueAtTime(480 * multiplierValue, now + 0.04);
    accent.frequency.exponentialRampToValueAtTime(980 * multiplierValue, now + 0.16);
    accent.frequency.exponentialRampToValueAtTime(720 * multiplierValue, now + 0.3);
    accent.connect(masterGain);
    accent.start(now + 0.04);
    accent.stop(now + 0.3);
  }

  playObstaclePing() {
    const audio = this.obstacleHitAudio.cloneNode(true);
    audio.volume = 0.6;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  playScoreBanked() {
    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    context.resume().catch(() => {});

    const now = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    masterGain.connect(context.destination);

    const notes = [
      { frequency: 660, start: now, end: now + 0.12 },
      { frequency: 880, start: now + 0.1, end: now + 0.24 },
      { frequency: 1180, start: now + 0.2, end: now + 0.4 }
    ];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, note.start);
      oscillator.connect(masterGain);
      oscillator.start(note.start);
      oscillator.stop(note.end);
    }
  }

  playSadLoss() {
    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    context.resume().catch(() => {});

    const now = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    masterGain.connect(context.destination);

    const lead = context.createOscillator();
    lead.type = "sawtooth";
    lead.frequency.setValueAtTime(340, now);
    lead.frequency.exponentialRampToValueAtTime(220, now + 0.24);
    lead.frequency.exponentialRampToValueAtTime(150, now + 0.5);
    lead.connect(masterGain);
    lead.start(now);
    lead.stop(now + 0.52);

    const bass = context.createOscillator();
    bass.type = "triangle";
    bass.frequency.setValueAtTime(170, now);
    bass.frequency.exponentialRampToValueAtTime(110, now + 0.5);
    bass.connect(masterGain);
    bass.start(now);
    bass.stop(now + 0.52);
  }
}
