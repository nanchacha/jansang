const sounds = {
  parry: ['parry-1', 'parry-2', 'parry-3'],
  perfect: ['perfect'],
  swing: ['swing-1', 'swing-2'],
  attack: ['slash'],
  hurt: ['hurt'],
  wave: ['wave'],
};
export const SOUND_FILES = Object.values(sounds).flat().map(name => `assets/audio/${name}.wav`);

export class CombatAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.previous = new Map();
    // Fetch early; decoding and audio unlock happen on the first user gesture.
    this.downloads = SOUND_FILES.map(async file => {
      try {
        const response = await fetch(new URL(file, import.meta.url), { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return null;
        return { name: file.split('/').pop().slice(0, -4), bytes: await response.arrayBuffer() };
      } catch { return null; } // Audio is optional; never block combat or replay stale events.
    });
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' });
        this.ready = Promise.all(this.downloads.map(async download => {
          const asset = await download;
          if (!asset) return;
          try { this.buffers.set(asset.name, await this.context.decodeAudioData(asset.bytes)); } catch { /* Silent fallback. */ }
        }));
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Unsupported audio must not stop the game. */ }
  }

  play(kind, volume = .65, rate = 1) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const choices = sounds[kind]?.filter(name => this.buffers.has(name));
    if (!choices?.length) return;
    const alternatives = choices.filter(name => name !== this.previous.get(kind));
    const pool = alternatives.length ? alternatives : choices;
    const name = pool[Math.floor(Math.random() * pool.length)];
    this.previous.set(kind, name);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers.get(name);
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(this.context.destination);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  stop() {
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }

  mute(muted) {
    this.enabled = !muted;
    if (muted) this.stop();
  }

  pause() {
    this.stop();
    this.context?.suspend().catch(() => {});
  }
}
