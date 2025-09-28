import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import { isProcessRunning } from './processCheck';
import net from 'net';

export interface SessionConfig {
  modelPreference: string;
  provider?: string;
  model?: string;
  sessionId: string;
  port: number;
  pidFile: string;
  referenceCountFile: string;
  configOverrides?: Record<string, any>;
}

export interface ModelPreference {
  provider?: string;
  model?: string;
  raw: string;
}

const SESSIONS_DIR = join(HOME_DIR, 'sessions');
const BASE_PORT = 3456;
const MAX_PORT_RANGE = 100;

export function parseModelPreference(preference: string): ModelPreference {
  if (!preference || preference.trim() === '') {
    return { raw: '' };
  }

  const parts = preference.split(',').map(p => p.trim());

  if (parts.length === 2) {
    return {
      provider: parts[0],
      model: parts[1],
      raw: preference
    };
  }

  if (parts.length === 1) {
    const subParts = parts[0].split('/');
    if (subParts.length === 2) {
      return {
        provider: subParts[0],
        model: subParts[1],
        raw: preference
      };
    }
    return {
      model: parts[0],
      raw: preference
    };
  }

  return { raw: preference };
}

export function generateSessionId(modelPreference: string): string {
  if (!modelPreference) {
    return 'default';
  }

  const hash = createHash('md5').update(modelPreference).digest('hex');
  return hash.substring(0, 8);
}

export async function findAvailablePort(startPort: number = BASE_PORT): Promise<number> {
  for (let port = startPort; port < startPort + MAX_PORT_RANGE; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${startPort + MAX_PORT_RANGE}`);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

export function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function getSessionConfig(modelPreference: string = ''): SessionConfig {
  ensureSessionsDir();

  const sessionId = generateSessionId(modelPreference);
  const parsed = parseModelPreference(modelPreference);

  const sessionDir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  const config: SessionConfig = {
    modelPreference,
    provider: parsed.provider,
    model: parsed.model,
    sessionId,
    port: BASE_PORT, // Will be updated when finding available port
    pidFile: join(sessionDir, 'router.pid'),
    referenceCountFile: join(sessionDir, 'reference-count.txt')
  };

  // Check if there's an existing session config file
  const sessionConfigFile = join(sessionDir, 'session.json');
  if (existsSync(sessionConfigFile)) {
    try {
      const savedConfig = JSON.parse(readFileSync(sessionConfigFile, 'utf-8'));
      config.port = savedConfig.port || BASE_PORT;
    } catch (e) {
      // Ignore and use defaults
    }
  }

  return config;
}

export function saveSessionConfig(config: SessionConfig): void {
  const sessionDir = join(SESSIONS_DIR, config.sessionId);
  const sessionConfigFile = join(sessionDir, 'session.json');

  writeFileSync(sessionConfigFile, JSON.stringify({
    modelPreference: config.modelPreference,
    provider: config.provider,
    model: config.model,
    port: config.port,
    sessionId: config.sessionId,
    createdAt: new Date().toISOString()
  }, null, 2));
}

export async function isSessionRunning(sessionConfig: SessionConfig): Promise<boolean> {
  if (!existsSync(sessionConfig.pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(sessionConfig.pidFile, 'utf-8'));
    return await isProcessRunning(pid);
  } catch (e) {
    cleanupSessionPid(sessionConfig);
    return false;
  }
}

export function saveSessionPid(sessionConfig: SessionConfig, pid: number): void {
  writeFileSync(sessionConfig.pidFile, pid.toString());
}

export function cleanupSessionPid(sessionConfig: SessionConfig): void {
  if (existsSync(sessionConfig.pidFile)) {
    try {
      unlinkSync(sessionConfig.pidFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export function getSessionPid(sessionConfig: SessionConfig): number | null {
  if (!existsSync(sessionConfig.pidFile)) {
    return null;
  }

  try {
    const pid = parseInt(readFileSync(sessionConfig.pidFile, 'utf-8'));
    return isNaN(pid) ? null : pid;
  } catch (e) {
    return null;
  }
}

export function incrementSessionReferenceCount(sessionConfig: SessionConfig): void {
  let count = 0;
  if (existsSync(sessionConfig.referenceCountFile)) {
    count = parseInt(readFileSync(sessionConfig.referenceCountFile, 'utf-8')) || 0;
  }
  count++;
  writeFileSync(sessionConfig.referenceCountFile, count.toString());
}

export function decrementSessionReferenceCount(sessionConfig: SessionConfig): void {
  let count = 0;
  if (existsSync(sessionConfig.referenceCountFile)) {
    count = parseInt(readFileSync(sessionConfig.referenceCountFile, 'utf-8')) || 0;
  }
  count = Math.max(0, count - 1);
  writeFileSync(sessionConfig.referenceCountFile, count.toString());
}

export function getSessionReferenceCount(sessionConfig: SessionConfig): number {
  if (!existsSync(sessionConfig.referenceCountFile)) {
    return 0;
  }
  return parseInt(readFileSync(sessionConfig.referenceCountFile, 'utf-8')) || 0;
}

export async function getAllActiveSessions(): Promise<SessionConfig[]> {
  ensureSessionsDir();

  const sessions: SessionConfig[] = [];
  const fs = require('fs');

  if (!existsSync(SESSIONS_DIR)) {
    return sessions;
  }

  const sessionDirs = fs.readdirSync(SESSIONS_DIR);

  for (const sessionId of sessionDirs) {
    const sessionDir = join(SESSIONS_DIR, sessionId);
    const sessionConfigFile = join(sessionDir, 'session.json');

    if (existsSync(sessionConfigFile)) {
      try {
        const savedConfig = JSON.parse(readFileSync(sessionConfigFile, 'utf-8'));
        const sessionConfig = {
          ...savedConfig,
          pidFile: join(sessionDir, 'router.pid'),
          referenceCountFile: join(sessionDir, 'reference-count.txt')
        };

        if (await isSessionRunning(sessionConfig)) {
          sessions.push(sessionConfig);
        }
      } catch (e) {
        // Ignore invalid session configs
      }
    }
  }

  return sessions;
}

export function buildModelOverrideConfig(sessionConfig: SessionConfig): Record<string, any> {
  const overrides: Record<string, any> = {};

  if (sessionConfig.provider && sessionConfig.model) {
    // Override the default router to use the specified provider and model
    overrides.OVERRIDE_MODEL = `${sessionConfig.provider},${sessionConfig.model}`;
  } else if (sessionConfig.model) {
    // Override just the model
    overrides.OVERRIDE_MODEL = sessionConfig.model;
  }

  // Store the session preference for the router to use
  overrides.CCR_MODEL_PREFERENCE = sessionConfig.modelPreference;
  overrides.CCR_SESSION_ID = sessionConfig.sessionId;
  overrides.CCR_SESSION_PORT = sessionConfig.port;

  return overrides;
}