import { signal } from '@angular/core';

/**
 * One shared audio element for all team radio clips: starting a clip stops the one playing, so
 * recordings never overlap. State is exposed as signals for the list to render.
 */
export class RadioPlayer {
  /** The clip that is loaded (playing, paused or loading). */
  readonly url = signal<string | null>(null);
  readonly playing = signal(false);
  readonly loading = signal(false);
  readonly failed = signal<string | null>(null);
  /** Seconds. */
  readonly position = signal(0);
  readonly duration = signal(0);

  private audio: HTMLAudioElement | null = null;

  /** Play a clip; clicking the active one pauses/resumes it. */
  toggle(url: string): void {
    if (this.audio && this.url() === url && !this.failed()) {
      if (this.audio.paused) void this.audio.play().catch(() => this.fail(url));
      else this.audio.pause();
      return;
    }
    this.start(url);
  }

  /** Jump within the active clip; `fraction` is 0..1. */
  seek(fraction: number): void {
    if (this.audio && this.duration() > 0) {
      this.audio.currentTime = Math.min(1, Math.max(0, fraction)) * this.duration();
      this.position.set(this.audio.currentTime);
    }
  }

  stop(): void {
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.url.set(null);
    this.playing.set(false);
    this.loading.set(false);
    this.failed.set(null);
    this.position.set(0);
    this.duration.set(0);
  }

  private start(url: string): void {
    this.stop();
    const audio = new Audio();
    this.audio = audio;
    this.url.set(url);
    this.loading.set(true);

    // Events of a clip that has since been replaced must not touch the new clip's state.
    const current = (fn: () => void) => () => {
      if (this.audio === audio) fn();
    };
    audio.addEventListener(
      'loadedmetadata',
      current(() => this.duration.set(audio.duration || 0)),
    );
    audio.addEventListener(
      'timeupdate',
      current(() => this.position.set(audio.currentTime)),
    );
    audio.addEventListener(
      'playing',
      current(() => {
        this.playing.set(true);
        this.loading.set(false);
      }),
    );
    audio.addEventListener(
      'pause',
      current(() => this.playing.set(false)),
    );
    audio.addEventListener(
      'waiting',
      current(() => this.loading.set(true)),
    );
    audio.addEventListener(
      'error',
      current(() => this.fail(url)),
    );
    audio.addEventListener(
      'ended',
      current(() => {
        this.playing.set(false);
        this.position.set(0);
        this.url.set(null);
      }),
    );

    audio.src = url;
    void audio.play().catch(() => {
      if (this.audio === audio) this.fail(url);
    });
  }

  private fail(url: string): void {
    this.playing.set(false);
    this.loading.set(false);
    this.failed.set(url);
  }
}
