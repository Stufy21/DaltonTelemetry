import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface NavNode {
  label: string;
  icon: string;
  route?: string;
  children?: NavNode[];
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly sidenavOpen = signal(true);

  readonly navTree: NavNode[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    {
      label: 'Telemetry',
      icon: 'bar_chart',
      children: [
        { label: 'Overview', icon: 'pie_chart', route: '/telemetry/overview' },
        { label: 'Live Feed', icon: 'stream', route: '/telemetry/live' },
        { label: 'History', icon: 'history', route: '/telemetry/history' },
      ],
    },
    {
      label: 'Reports',
      icon: 'summarize',
      children: [
        { label: 'Summary', icon: 'description', route: '/reports/summary' },
        { label: 'Detailed', icon: 'table_view', route: '/reports/detailed' },
      ],
    },
    { label: 'Settings', icon: 'settings', route: '/settings' },
  ];

  readonly childrenAccessor = (node: NavNode) => node.children ?? [];
  readonly hasChild = (_: number, node: NavNode) => !!node.children?.length;

  toggleSidenav(): void {
    this.sidenavOpen.update((v) => !v);
  }
}
