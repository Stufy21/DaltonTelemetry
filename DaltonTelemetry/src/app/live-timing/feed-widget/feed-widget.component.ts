import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LiveTimingStore } from '../live-timing.store';
import { RadioPlayer } from './radio-player';

/** Race control messages and team radio, as two tabs. */
@Component({
  selector: 'app-feed-widget',
  imports: [DatePipe, MatIconModule, MatProgressSpinnerModule, MatTabsModule, MatTooltipModule],
  templateUrl: './feed-widget.component.html',
  styleUrl: './feed-widget.component.scss',
})
export class FeedWidgetComponent {
  protected readonly store = inject(LiveTimingStore);
  protected readonly player = new RadioPlayer();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.player.stop());
    // A clip belongs to one session; stop it when another one is loaded.
    effect(() => {
      this.store.session();
      untracked(() => this.player.stop());
    });
  }

  protected isActive(url: string): boolean {
    return this.player.url() === url;
  }

  protected progress(url: string): number {
    const duration = this.player.duration();
    return this.isActive(url) && duration > 0 ? (this.player.position() / duration) * 100 : 0;
  }

  protected scrub(event: MouseEvent, url: string): void {
    if (!this.isActive(url)) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.player.seek((event.clientX - box.left) / box.width);
  }

  /** 83.4 -> "1:23" */
  protected clock(seconds: number): string {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
