import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CombatAudio, SOUND_FILES } from './audio.mjs';

test('combat WAV assets are short, audible, click-free at boundaries and below clipping', async () => {
  let total = 0;
  for (const file of SOUND_FILES) {
    const wav = await readFile(new URL(file, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1); // PCM
    assert.equal(wav.readUInt16LE(22), 1); // Mono; identical timing in either ear.
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    const duration = (wav.length - 44) / 88200;
    assert.ok(duration >= .2 && duration <= .75, file);
    assert.equal(wav.readInt16LE(44), 0, file);
    assert.equal(wav.readInt16LE(wav.length - 2), 0, file);
    let peak = 0, energy = 0;
    for (let offset = 44; offset < wav.length; offset += 2) {
      const value = wav.readInt16LE(offset) / 32768;
      peak = Math.max(peak, Math.abs(value)); energy += value * value;
    }
    assert.ok(peak > .7 && peak < .81 && energy > 1, file);
    total += wav.length;
  }
  assert.ok(total < 400000, 'Keep mobile audio downloads small');
});

test('audio unlock, variation, mute, pause and missing/corrupt samples remain safe', async t => {
  const originalFetch = globalThis.fetch, originalContext = globalThis.AudioContext;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.AudioContext = originalContext; });
  const played = [];
  globalThis.fetch = async url => {
    if (url.pathname.endsWith('perfect.wav')) throw Error('Offline');
    if (url.pathname.endsWith('wave.wav')) return { ok: false };
    const data = await readFile(url);
    return { ok: true, arrayBuffer: async () => url.pathname.endsWith('parry-3.wav') ? new ArrayBuffer(0) : data };
  };
  globalThis.AudioContext = class {
    state = 'suspended';
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    async decodeAudioData(data) { if (!data.byteLength) throw Error('Corrupt'); return data; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    createBufferSource() {
      return { playbackRate: {}, connect: node => node, disconnect() {},
        start() { played.push(this); }, stop() { this.stopped = true; this.onended(); } };
    }
  };
  const audio = new CombatAudio();
  audio.play('parry');
  assert.equal(played.length, 0);
  audio.unlock();
  await audio.ready;
  assert.equal(audio.buffers.size, 6);
  audio.play('parry'); audio.play('parry');
  assert.equal(played.length, 2);
  assert.notEqual(played[0].buffer, played[1].buffer, 'Do not repeat the same clash');
  audio.mute(true);
  assert.ok(played.every(source => source.stopped));
  audio.play('parry'); audio.unlock();
  assert.equal(played.length, 2);
  audio.mute(false); audio.unlock();
  audio.play('hurt');
  audio.pause();
  assert.equal(audio.voices.size, 0);
  audio.play('parry');
  assert.equal(played.length, 3);
  audio.unlock();
  assert.equal(played.length, 3, 'Resuming must not replay old sounds');
  audio.play('perfect'); audio.play('wave');
  assert.equal(played.length, 3, 'Unavailable audio stays silent');
  audio.play('swing');
  assert.equal(played.length, 4, 'Other samples still work');
  audio.stop();
});
