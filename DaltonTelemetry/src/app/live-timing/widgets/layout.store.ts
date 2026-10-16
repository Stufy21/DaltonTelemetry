import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ColumnId,
  DEFAULT_LAYOUT,
  Layout,
  WidgetId,
  cloneLayout,
  defaultColumn,
  normalizeLayout,
} from './layout';

// v2: the board went from two columns to three, so the old saved arrangement is dropped.
const STORAGE_KEY = 'dalton-live-layout-v2';

/** Which widgets are shown and where; persisted in the browser. */
@Injectable()
export class LayoutStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _layout = signal<Layout>(this.read());

  readonly layout = this._layout.asReadonly();

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this._layout()));
        } catch {
          // storage unavailable: the layout just won't persist
        }
      });
    }
  }

  isVisible(id: WidgetId): boolean {
    return !this._layout().hidden.includes(id);
  }

  drop(event: CdkDragDrop<ColumnId>): void {
    const from = event.previousContainer.data;
    const to = event.container.data;
    this._layout.update((current) => {
      const next = cloneLayout(current);
      if (from === to) moveItemInArray(next[to], event.previousIndex, event.currentIndex);
      else transferArrayItem(next[from], next[to], event.previousIndex, event.currentIndex);
      return next;
    });
  }

  hide(id: WidgetId): void {
    this._layout.update((l) => ({
      main: l.main.filter((w) => w !== id),
      side: l.side.filter((w) => w !== id),
      third: l.third.filter((w) => w !== id),
      hidden: [...l.hidden, id],
    }));
  }

  show(id: WidgetId): void {
    this._layout.update((l) => {
      const column: ColumnId = defaultColumn(id);
      return { ...l, [column]: [...l[column], id], hidden: l.hidden.filter((w) => w !== id) };
    });
  }

  toggle(id: WidgetId): void {
    if (this.isVisible(id)) this.hide(id);
    else this.show(id);
  }

  reset(): void {
    this._layout.set(cloneLayout(DEFAULT_LAYOUT));
  }

  private read(): Layout {
    if (!this.isBrowser) return normalizeLayout(null);
    try {
      return normalizeLayout(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    } catch {
      return normalizeLayout(null);
    }
  }
}
