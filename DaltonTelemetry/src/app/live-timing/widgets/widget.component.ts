import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Card frame for a dashboard widget. Put `cdkDrag` on the host: the grip in the header is the
 * drag handle, found through the element injector.
 */
@Component({
  selector: 'app-widget',
  imports: [CdkDragHandle, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <section class="widget">
      <header class="head">
        <span class="grip" cdkDragHandle matTooltip="Drag to move" aria-label="Drag to move">
          <mat-icon>drag_indicator</mat-icon>
        </span>
        <h2>{{ title() }}</h2>
        <span class="spacer"></span>
        <ng-content select="[widget-actions]" />
        <button mat-icon-button (click)="closed.emit()" aria-label="Hide widget" matTooltip="Hide">
          <mat-icon>close</mat-icon>
        </button>
      </header>
      <div class="body"><ng-content /></div>
    </section>
  `,
  styleUrl: './widget.component.scss',
})
export class WidgetComponent {
  readonly title = input.required<string>();
  readonly closed = output<void>();
}
