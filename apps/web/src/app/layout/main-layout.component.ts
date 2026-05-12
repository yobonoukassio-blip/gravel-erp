import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HeaderComponent } from './header.component';
import { SidenavComponent } from './sidenav.component';

@Component({
  selector: 'gravel-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    HeaderComponent,
    SidenavComponent,
  ],
  template: `
    <mat-sidenav-container class="layout-root" hasBackdrop="false">
      <mat-sidenav mode="side" opened class="layout-sidenav">
        <gravel-sidenav />
      </mat-sidenav>
      <mat-sidenav-content>
        <gravel-header />
        <main class="layout-main">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .layout-root {
        height: 100vh;
      }
      .layout-sidenav {
        width: 240px;
      }
      .layout-main {
        padding: 1.5rem;
      }
    `,
  ],
})
export class MainLayoutComponent {}
