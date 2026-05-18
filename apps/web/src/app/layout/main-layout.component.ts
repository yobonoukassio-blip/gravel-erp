import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './header.component';
import { SidenavComponent } from './sidenav.component';
import { ApiDiagnosticsBannerComponent } from './api-diagnostics-banner.component';

@Component({
  selector: 'gravel-main-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    HeaderComponent,
    SidenavComponent,
    ApiDiagnosticsBannerComponent,
  ],
  template: `
    <mat-sidenav-container
      class="layout-root"
      [hasBackdrop]="isHandset()"
      autosize
    >
      <mat-sidenav
        #sidenav
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset()"
        [fixedInViewport]="isHandset()"
        class="layout-sidenav"
      >
        <gravel-sidenav (navigate)="onNavigate()" />
      </mat-sidenav>
      <mat-sidenav-content #content class="layout-content">
        <gravel-header
          [showMenuButton]="isHandset()"
          (menuToggle)="sidenav.toggle()"
        />
        <main class="layout-main" tabindex="-1">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
    <gravel-api-diagnostics-banner />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100dvh;
      }

      .layout-root {
        height: 100dvh;
        background: var(--gv-bg);
      }

      .layout-sidenav {
        width: 248px;
        background: var(--gv-nav-bg);
        color: var(--gv-nav-text);
        border-right: 0 !important;
      }

      .layout-content {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
        background: var(--gv-bg);
        /* iOS momentum + clip body scroll so only main scrolls */
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        scroll-behavior: smooth;
      }

      .layout-main {
        flex: 1 1 auto;
        padding: var(--gv-space-6) var(--gv-space-8);
        max-width: 1600px;
        width: 100%;
        animation: gv-fade-in var(--gv-duration-3) var(--gv-ease) both;
      }

      @media (max-width: 1200px) {
        .layout-main { padding: var(--gv-space-5) var(--gv-space-6); }
      }

      @media (max-width: 960px) {
        .layout-sidenav { width: 264px; }
        .layout-main { padding: var(--gv-space-4) var(--gv-space-5); }
      }

      @media (max-width: 600px) {
        .layout-sidenav { width: 84vw; max-width: 300px; }
        .layout-main {
          padding: var(--gv-space-3) var(--gv-space-4)
                   calc(var(--gv-space-6) + env(safe-area-inset-bottom));
        }
      }
    `,
  ],
})
export class MainLayoutComponent implements AfterViewInit {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('sidenav') private sidenav?: MatSidenav;
  @ViewChild('content', { read: ElementRef })
  private content?: ElementRef<HTMLElement>;

  /**
   * Handset = phone-sized viewport. We treat tablets (<=960px) as handset too
   * so the side menu does not eat the working area on small laptops/tablets.
   */
  readonly isHandset = signal(false);

  constructor() {
    this.breakpoints
      .observe(['(max-width: 960px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => this.isHandset.set(state.matches));

    // Scroll to top on each route change for a clean transition.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.scrollToTop());
  }

  ngAfterViewInit(): void {
    // Ensure correct initial state once view exists.
    if (this.isHandset() && this.sidenav?.opened) {
      void this.sidenav.close();
    }
  }

  onNavigate(): void {
    if (this.isHandset()) {
      void this.sidenav?.close();
    }
  }

  private scrollToTop(): void {
    const el = this.content?.nativeElement;
    if (!el) return;
    // Respect reduced motion automatically via the element's scroll-behavior.
    el.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }
}
