import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CLAUDE_MODELS, ClaudeSettings, DEFAULT_SETTINGS } from './settings.model';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit {
  private readonly svc = inject(SettingsService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly models = CLAUDE_MODELS;
  readonly copied = signal(false);
  readonly importBanner = signal<string | null>(null);

  readonly form = this.fb.group({
    model: [this.svc.settings().model],
    apiKey: [this.svc.settings().apiKey],
    maxTokens: [this.svc.settings().maxTokens, [Validators.min(1), Validators.max(200_000)]],
    temperature: [this.svc.settings().temperature, [Validators.min(0), Validators.max(2)]],
    systemPrompt: [this.svc.settings().systemPrompt],
  });

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('share');
    if (token) {
      const imported = this.svc.fromShareToken(token);
      if (imported) {
        this.form.patchValue(imported);
        this.importBanner.set('Settings imported from shared link — save to apply them.');
      }
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  save(): void {
    if (this.form.valid) {
      this.svc.set(this.form.getRawValue() as ClaudeSettings);
    }
  }

  reset(): void {
    this.form.reset(DEFAULT_SETTINGS);
  }

  async copyShareLink(): Promise<void> {
    this.save();
    const token = this.svc.toShareToken();
    const url = `${window.location.origin}/settings?share=${token}`;
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }

  dismissBanner(): void {
    this.importBanner.set(null);
  }
}
