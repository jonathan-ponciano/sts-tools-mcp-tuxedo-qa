import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './paths.js';

// Scaffolding for the future embedded dashboard agent (not wired to anything
// yet — no agent loop reads this today). Just a place to park a provider API
// key ahead of time, stored the same way credentials are: on disk, masked on
// read-back, never logged.
export type AgentProvider = 'gemini' | 'anthropic' | 'openai';

export interface AgentConfig {
  provider: AgentProvider;
  apiKey: string;
}

function agentConfigFile(configDir: string): string {
  return join(configDir, 'agent-config.json');
}

export function readAgentConfig(configDir: string = CONFIG_DIR): AgentConfig | null {
  const file = agentConfigFile(configDir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8')) as AgentConfig;
}

export function writeAgentConfig(config: AgentConfig, configDir: string = CONFIG_DIR): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(agentConfigFile(configDir), JSON.stringify(config, null, 2), 'utf-8');
}
