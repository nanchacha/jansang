// Rebuild the edited CC0 recordings. Source downloads and credits: assets/audio/CREDITS.md.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const source = resolve(process.argv[2] || '.artifacts/audio-source');
const output = new URL('../assets/audio/', import.meta.url);
const rate = 44100;
mkdirSync(output, { recursive: true });
const clash = n => `clash/sword_clash.${n}.ogg`;
const sword = n => `sword/sword - StarNinjas/sword.${n}.ogg`;
const swish = n => `swishes/swishes/swish-${n}.wav`;

function recording(file, filters = '') {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', resolve(source, file), '-af',
    `aresample=${rate},silenceremove=start_periods=1:start_duration=0.002:start_threshold=-42dB:start_silence=0.002,highpass=f=100${filters ? ',' + filters : ''}`,
    '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
  return Float32Array.from({ length: result.stdout.length / 4 }, (_, i) => result.stdout.readFloatLE(i * 4));
}

function clip(name, duration, layers) {
  const samples = new Float32Array(Math.round(rate * duration));
  for (const [wave, gain = 1, delay = 0] of layers) {
    const offset = Math.round(delay * rate);
    for (let i = 0; i < wave.length && i + offset < samples.length; i++) samples[i + offset] += wave[i] * gain;
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    // Short attack, tapered tail: immediate contact without hard-cut clicks.
    samples[i] *= Math.min(1, i / (rate * .001), (samples.length - 1 - i) / (rate * .12));
    assert.ok(Number.isFinite(samples[i]));
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  assert.ok(peak > .001, `${name} must contain audible samples`);
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => wav.writeInt16LE(Math.round(value / peak * .8 * 32767), 44 + i * 2));
  writeFileSync(new URL(`${name}.wav`, output), wav);
  console.log(`${name}: ${duration}s, ${wav.length} bytes`);
}

for (const [index, take] of [1, 3, 7].entries()) {
  clip(`parry-${index + 1}`, .58, [[recording(clash(take), 'asetrate=39690,aresample=44100,lowpass=f=8200,equalizer=f=3500:t=q:w=1:g=-3')]]);
}
clip('perfect', .72, [[recording(clash(6), 'lowpass=f=9800')], [recording(clash(2), 'asetrate=35280,aresample=44100,lowpass=f=2500'), .22, .007]]);
clip('swing-1', .24, [[recording(swish(1), 'atempo=1.4,lowpass=f=7000')]]);
clip('swing-2', .27, [[recording(swish(3), 'atempo=1.4,lowpass=f=7000')]]);
clip('slash', .48, [[recording(sword(4), 'lowpass=f=7800'), .65], [recording(clash(5), 'asetrate=30870,aresample=44100,lowpass=f=1900'), .6, .12]]);
clip('hurt', .32, [[recording(clash(5), 'asetrate=26460,aresample=44100,lowpass=f=1000')], [recording(sword(6), 'lowpass=f=3500'), .18]]);
clip('wave', .6, [[recording(swish(7), 'asetrate=30870,aresample=44100,lowpass=f=4800')], [recording(swish(3), 'lowpass=f=7500'), .35, .06]]);
