import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter, map } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeMode, ThemeService } from '../core/theme/theme.service';

export interface NavNode {
  label: string;
  icon: string;
  route?: string;
  children?: NavNode[];
}

const NAV_WIDTH = 248;
const MOBILE_QUERY = '(max-width: 959px)';

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
    MatMenuModule,
    MatTooltipModule,
  ],
  host: { '[style.--dt-nav-width.px]': 'navWidth()' },
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  readonly sidenavOpen = signal(true);

  readonly navTree: NavNode[] = [
    { label: 'Live Timing', icon: 'sensors', route: '/live-timing' },
    {
      label: 'Reports',
      icon: 'summarize',
      children: [
        { label: 'Statistics', icon: 'description', route: '/reports/stats' },
        // { label: 'Detailed', icon: 'table_view', route: '/reports/detailed' },
      ],
    },
  ];

  readonly themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Light', icon: 'light_mode' },
    { mode: 'dark', label: 'Dark', icon: 'dark_mode' },
    { mode: 'system', label: 'System', icon: 'brightness_auto' },
  ];

  /** Narrow screens get an overlay menu that closes after navigating. */
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe(MOBILE_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly pageTitle = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const leaves = this.navTree.flatMap((n) => n.children ?? [n]);
    if (path === '/settings') return 'Settings';
    return leaves.find((n) => n.route === path)?.label ?? 'DaltonTelemetry';
  });

  /** Width taken by the side menu, so floating UI can align with the content area. */
  readonly navWidth = computed(() => (this.sidenavOpen() && !this.mobile() ? NAV_WIDTH : 0));

  readonly themeIcon = computed(() =>
    this.theme.resolved() === 'dark' ? 'dark_mode' : 'light_mode',
  );

  readonly childrenAccessor = (node: NavNode) => node.children ?? [];
  readonly hasChild = (_: number, node: NavNode) => !!node.children?.length;

  constructor() {
    effect(() => this.sidenavOpen.set(!this.mobile()));
    effect(() => {
      this.url();
      if (this.mobile()) this.sidenavOpen.set(false);
    });
  }

  toggleSidenav(): void {
    this.sidenavOpen.update((v) => !v);
  }
}
