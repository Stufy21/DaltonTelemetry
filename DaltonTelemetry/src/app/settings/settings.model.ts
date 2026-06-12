export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
] as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id'];

export interface ClaudeSettings {
  model: ClaudeModelId;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  apiKey: string;
}

export const DEFAULT_SETTINGS: ClaudeSettings = {
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
  temperature: 1.0,
  systemPrompt: '',
  apiKey: '',
};

export type ShareableSettings = Omit<ClaudeSettings, 'apiKey'>;
