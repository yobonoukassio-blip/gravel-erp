import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'gravel-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <header style="padding: 1rem; background: #1a1a2e; color: white;">
      <h1 style="margin: 0; font-size: 1.25rem;">Gravel Ivoire ERP</h1>
      <small style="opacity: 0.7;">Phase 1 shell — features land in W1-P04 / W2-P05</small>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
