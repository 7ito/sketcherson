import roundWarningSoundUrl from '../assets/round-warning.wav';

export type GameSoundEffect = 'lobbyJoin' | 'turnStart' | 'correctGuess' | 'otherPlayerCorrectGuess' | 'roundWarning';

type OscillatorWaveform = OscillatorType;

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

interface ToneLayer {
  waveform: OscillatorWaveform;
  startTime: number;
  durationSeconds: number;
  startFrequencyHz: number;
  endFrequencyHz?: number;
  peakGain: number;
  attackSeconds?: number;
}

interface NoiseLayer {
  startTime: number;
  durationSeconds: number;
  peakGain: number;
  centerFrequencyHz: number;
  q?: number;
  attackSeconds?: number;
}

const SILENT_GAIN = 0.0001;
const EFFECT_COOLDOWN_MS = 80;
const MASTER_GAIN = 0.24;

function scheduleGainEnvelope(
  gain: AudioParam,
  startTime: number,
  durationSeconds: number,
  peakGain: number,
  attackSeconds = 0.005,
): void {
  const peakTime = Math.min(startTime + attackSeconds, startTime + durationSeconds * 0.45);
  const endTime = startTime + durationSeconds;

  gain.cancelScheduledValues(startTime);
  gain.setValueAtTime(SILENT_GAIN, startTime);
  gain.exponentialRampToValueAtTime(Math.max(peakGain, SILENT_GAIN), peakTime);
  gain.exponentialRampToValueAtTime(SILENT_GAIN, endTime);
}

class ProceduralSoundEffects {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayedAtByEffect = new Map<GameSoundEffect, number>();
  private pendingGain: number | null = null;
  private sampleVolume = MASTER_GAIN;

  public setVolume(normalizedVolume: number): void {
    const gain = Math.max(0, Math.min(1, normalizedVolume)) * MASTER_GAIN;
    if (this.masterGain) {
      this.masterGain.gain.value = gain;
    }
    this.pendingGain = gain;
    this.sampleVolume = gain;
  }

  public async unlock(): Promise<void> {
    const context = this.ensureAudioContext();

    if (!context || context.state !== 'suspended') {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Ignore browsers that still require a direct user gesture.
    }
  }

  public async play(effect: GameSoundEffect): Promise<void> {
    const nowMs = Date.now();
    const lastPlayedAt = this.lastPlayedAtByEffect.get(effect) ?? 0;
    if (nowMs - lastPlayedAt < EFFECT_COOLDOWN_MS) {
      return;
    }

    const context = this.ensureAudioContext();
    if (!context || !this.masterGain) {
      return;
    }

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return;
      }
    }

    this.lastPlayedAtByEffect.set(effect, nowMs);

    const startTime = context.currentTime + 0.01;

    switch (effect) {
      case 'lobbyJoin':
        this.playLobbyJoin(startTime);
        return;
      case 'turnStart':
        this.playTurnStart(startTime);
        return;
      case 'correctGuess':
        this.playCorrectGuess(startTime);
        return;
      case 'otherPlayerCorrectGuess':
        this.playOtherPlayerCorrectGuess(startTime);
        return;
      case 'roundWarning':
        void this.playSample(roundWarningSoundUrl);
        return;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (this.audioContext && this.masterGain) {
      return this.audioContext;
    }

    const AudioContextImpl = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioContextImpl) {
      return null;
    }

    const audioContext = new AudioContextImpl();
    const masterGain = audioContext.createGain();
    masterGain.gain.value = this.pendingGain ?? MASTER_GAIN;
    masterGain.connect(audioContext.destination);

    this.audioContext = audioContext;
    this.masterGain = masterGain;

    return audioContext;
  }

  private getNoiseBuffer(): AudioBuffer | null {
    const context = this.audioContext;
    if (!context) {
      return null;
    }

    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }

    const bufferSize = context.sampleRate;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let index = 0; index < channelData.length; index += 1) {
      channelData[index] = Math.random() * 2 - 1;
    }

    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(layer: ToneLayer): void {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      return;
    }

    const oscillator = context.createOscillator();
    oscillator.type = layer.waveform;
    oscillator.frequency.setValueAtTime(layer.startFrequencyHz, layer.startTime);

    if (layer.endFrequencyHz && layer.endFrequencyHz !== layer.startFrequencyHz) {
      oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequencyHz, layer.startTime + layer.durationSeconds);
    }

    const gainNode = context.createGain();
    scheduleGainEnvelope(
      gainNode.gain,
      layer.startTime,
      layer.durationSeconds,
      layer.peakGain,
      layer.attackSeconds,
    );

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(layer.startTime);
    oscillator.stop(layer.startTime + layer.durationSeconds + 0.03);
  }

  private playNoise(layer: NoiseLayer): void {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    const buffer = this.getNoiseBuffer();
    if (!context || !masterGain || !buffer) {
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(layer.centerFrequencyHz, layer.startTime);
    filter.Q.value = layer.q ?? 1.2;

    const gainNode = context.createGain();
    scheduleGainEnvelope(
      gainNode.gain,
      layer.startTime,
      layer.durationSeconds,
      layer.peakGain,
      layer.attackSeconds,
    );

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);
    source.start(layer.startTime);
    source.stop(layer.startTime + layer.durationSeconds + 0.03);
  }

  private async playSample(url: string): Promise<void> {
    if (typeof Audio === 'undefined') {
      return;
    }

    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, this.sampleVolume));

    try {
      await audio.play();
    } catch {
      // Ignore browsers that still require a direct user gesture.
    }
  }

  private playLobbyJoin(startTime: number): void {
    this.playNoise({
      startTime,
      durationSeconds: 0.03,
      peakGain: 0.022,
      centerFrequencyHz: 1800,
      q: 1.8,
      attackSeconds: 0.002,
    });

    this.playTone({
      waveform: 'triangle',
      startTime,
      durationSeconds: 0.16,
      startFrequencyHz: 520,
      endFrequencyHz: 760,
      peakGain: 0.09,
      attackSeconds: 0.004,
    });

    this.playTone({
      waveform: 'sine',
      startTime: startTime + 0.01,
      durationSeconds: 0.11,
      startFrequencyHz: 260,
      endFrequencyHz: 330,
      peakGain: 0.035,
      attackSeconds: 0.006,
    });
  }

  private playTurnStart(startTime: number): void {
    this.playNoise({
      startTime,
      durationSeconds: 0.07,
      peakGain: 0.016,
      centerFrequencyHz: 1200,
      q: 0.8,
      attackSeconds: 0.003,
    });

    this.playTone({
      waveform: 'triangle',
      startTime,
      durationSeconds: 0.15,
      startFrequencyHz: 660,
      endFrequencyHz: 720,
      peakGain: 0.08,
      attackSeconds: 0.005,
    });

    this.playTone({
      waveform: 'triangle',
      startTime: startTime + 0.11,
      durationSeconds: 0.2,
      startFrequencyHz: 920,
      endFrequencyHz: 1080,
      peakGain: 0.095,
      attackSeconds: 0.005,
    });

    this.playTone({
      waveform: 'sine',
      startTime: startTime + 0.11,
      durationSeconds: 0.18,
      startFrequencyHz: 1380,
      endFrequencyHz: 1480,
      peakGain: 0.028,
      attackSeconds: 0.004,
    });
  }

  private playCorrectGuess(startTime: number): void {
    this.playNoise({
      startTime,
      durationSeconds: 0.035,
      peakGain: 0.02,
      centerFrequencyHz: 2100,
      q: 1.6,
      attackSeconds: 0.002,
    });

    const noteSpacingSeconds = 0.085;

    this.playTone({
      waveform: 'triangle',
      startTime,
      durationSeconds: 0.16,
      startFrequencyHz: 740,
      endFrequencyHz: 780,
      peakGain: 0.08,
      attackSeconds: 0.004,
    });

    this.playTone({
      waveform: 'triangle',
      startTime: startTime + noteSpacingSeconds,
      durationSeconds: 0.17,
      startFrequencyHz: 980,
      endFrequencyHz: 1030,
      peakGain: 0.09,
      attackSeconds: 0.004,
    });

    this.playTone({
      waveform: 'triangle',
      startTime: startTime + noteSpacingSeconds * 2,
      durationSeconds: 0.24,
      startFrequencyHz: 1310,
      endFrequencyHz: 1390,
      peakGain: 0.11,
      attackSeconds: 0.004,
    });

    this.playTone({
      waveform: 'sine',
      startTime: startTime + noteSpacingSeconds * 2,
      durationSeconds: 0.25,
      startFrequencyHz: 1960,
      endFrequencyHz: 2080,
      peakGain: 0.03,
      attackSeconds: 0.003,
    });
  }

  private playOtherPlayerCorrectGuess(startTime: number): void {
    this.playNoise({
      startTime,
      durationSeconds: 0.028,
      peakGain: 0.014,
      centerFrequencyHz: 1700,
      q: 1.4,
      attackSeconds: 0.002,
    });

    this.playTone({
      waveform: 'triangle',
      startTime,
      durationSeconds: 0.12,
      startFrequencyHz: 600,
      endFrequencyHz: 680,
      peakGain: 0.055,
      attackSeconds: 0.004,
    });

    this.playTone({
      waveform: 'sine',
      startTime: startTime + 0.06,
      durationSeconds: 0.14,
      startFrequencyHz: 900,
      endFrequencyHz: 840,
      peakGain: 0.038,
      attackSeconds: 0.004,
    });
  }
}

export const soundEffects = new ProceduralSoundEffects();
