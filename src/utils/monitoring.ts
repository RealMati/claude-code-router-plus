import { EventEmitter } from 'events';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../constants';

export interface RequestLog {
  id: string;
  timestamp: Date;
  sessionId: string;
  method: string;
  path: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
  metadata?: Record<string, any>;
}

export interface SessionMetrics {
  sessionId: string;
  startTime: Date;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  averageResponseTime: number;
  errors: number;
  providers: Record<string, number>;
  models: Record<string, number>;
}

class MonitoringService extends EventEmitter {
  private requests: Map<string, RequestLog> = new Map();
  private sessionMetrics: Map<string, SessionMetrics> = new Map();
  private maxLogsInMemory = 1000;
  private logsDir: string;

  constructor() {
    super();
    this.logsDir = join(HOME_DIR, 'logs', 'requests');
    this.ensureLogsDirectory();
    this.loadPersistedMetrics();
  }

  private ensureLogsDirectory(): void {
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private loadPersistedMetrics(): void {
    const metricsFile = join(HOME_DIR, 'monitoring', 'metrics.json');
    if (existsSync(metricsFile)) {
      try {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));
        data.sessions?.forEach((session: any) => {
          this.sessionMetrics.set(session.sessionId, {
            ...session,
            startTime: new Date(session.startTime)
          });
        });
      } catch (e) {
        console.error('Failed to load persisted metrics:', e);
      }
    }
  }

  private persistMetrics(): void {
    const metricsDir = join(HOME_DIR, 'monitoring');
    if (!existsSync(metricsDir)) {
      mkdirSync(metricsDir, { recursive: true });
    }

    const metricsFile = join(metricsDir, 'metrics.json');
    const sessions = Array.from(this.sessionMetrics.values());

    try {
      writeFileSync(metricsFile, JSON.stringify({
        sessions,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('Failed to persist metrics:', e);
    }
  }

  startRequest(req: any): string {
    const requestId = this.generateRequestId();
    const sessionId = req.sessionId || 'default';

    const requestLog: RequestLog = {
      id: requestId,
      timestamp: new Date(),
      sessionId,
      method: req.method,
      path: req.url,
      status: 'pending',
      metadata: {
        headers: req.headers,
        body: req.body?.model
      }
    };

    this.requests.set(requestId, requestLog);

    // Emit event for real-time monitoring
    this.emit('request:start', requestLog);

    // Clean up old logs if needed
    if (this.requests.size > this.maxLogsInMemory) {
      this.archiveOldLogs();
    }

    return requestId;
  }

  updateRequest(requestId: string, updates: Partial<RequestLog>): void {
    const request = this.requests.get(requestId);
    if (request) {
      Object.assign(request, updates);

      // Update session metrics
      if (request.sessionId) {
        this.updateSessionMetrics(request);
      }

      // Emit event for real-time monitoring
      this.emit('request:update', request);

      // Persist if completed
      if (updates.status === 'success' || updates.status === 'error') {
        this.persistRequestLog(request);
      }
    }
  }

  endRequest(requestId: string, response?: any, error?: any): void {
    const request = this.requests.get(requestId);
    if (request) {
      const duration = Date.now() - request.timestamp.getTime();

      const updates: Partial<RequestLog> = {
        duration,
        status: error ? 'error' : 'success',
        error: error?.message
      };

      // Extract model and provider from response
      if (response?.body?.model) {
        const modelParts = response.body.model.split(',');
        if (modelParts.length === 2) {
          updates.provider = modelParts[0];
          updates.model = modelParts[1];
        } else {
          updates.model = response.body.model;
        }
      }

      // Extract token usage from response
      if (response?.body?.usage) {
        updates.inputTokens = response.body.usage.input_tokens;
        updates.outputTokens = response.body.usage.output_tokens;
      }

      this.updateRequest(requestId, updates);

      // Emit event for real-time monitoring
      this.emit('request:end', this.requests.get(requestId));
    }
  }

  private updateSessionMetrics(request: RequestLog): void {
    let metrics = this.sessionMetrics.get(request.sessionId);

    if (!metrics) {
      metrics = {
        sessionId: request.sessionId,
        startTime: new Date(),
        requestCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        averageResponseTime: 0,
        errors: 0,
        providers: {},
        models: {}
      };
      this.sessionMetrics.set(request.sessionId, metrics);
    }

    // Update counts
    metrics.requestCount++;

    if (request.status === 'error') {
      metrics.errors++;
    }

    // Update tokens
    if (request.inputTokens) {
      metrics.totalInputTokens += request.inputTokens;
    }
    if (request.outputTokens) {
      metrics.totalOutputTokens += request.outputTokens;
    }

    // Update average response time
    if (request.duration && request.status === 'success') {
      const totalTime = metrics.averageResponseTime * (metrics.requestCount - 1) + request.duration;
      metrics.averageResponseTime = totalTime / metrics.requestCount;
    }

    // Update provider/model usage
    if (request.provider) {
      metrics.providers[request.provider] = (metrics.providers[request.provider] || 0) + 1;
    }
    if (request.model) {
      metrics.models[request.model] = (metrics.models[request.model] || 0) + 1;
    }

    // Persist metrics periodically
    this.persistMetrics();

    // Emit metrics update
    this.emit('metrics:update', metrics);
  }

  private persistRequestLog(request: RequestLog): void {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const logFile = join(this.logsDir, `${dateStr}.jsonl`);

    try {
      const logLine = JSON.stringify(request) + '\n';
      const fs = require('fs');
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      console.error('Failed to persist request log:', e);
    }
  }

  private archiveOldLogs(): void {
    const oldestRequests = Array.from(this.requests.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
      .slice(0, 100);

    oldestRequests.forEach(([id, request]) => {
      this.persistRequestLog(request);
      this.requests.delete(id);
    });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getRecentRequests(sessionId?: string, limit: number = 100): RequestLog[] {
    const requests = Array.from(this.requests.values())
      .filter(r => !sessionId || r.sessionId === sessionId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return requests;
  }

  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  getAllSessionMetrics(): SessionMetrics[] {
    return Array.from(this.sessionMetrics.values());
  }

  // WebSocket support for real-time streaming
  streamLogs(ws: any, sessionId?: string): void {
    const sendLog = (log: RequestLog) => {
      if (!sessionId || log.sessionId === sessionId) {
        ws.send(JSON.stringify({ type: 'log', data: log }));
      }
    };

    const sendMetrics = (metrics: SessionMetrics) => {
      if (!sessionId || metrics.sessionId === sessionId) {
        ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
      }
    };

    // Send existing logs
    const recentLogs = this.getRecentRequests(sessionId, 50);
    ws.send(JSON.stringify({ type: 'initial', data: recentLogs }));

    // Send current metrics
    if (sessionId) {
      const metrics = this.getSessionMetrics(sessionId);
      if (metrics) {
        ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
      }
    } else {
      const allMetrics = this.getAllSessionMetrics();
      ws.send(JSON.stringify({ type: 'metrics', data: allMetrics }));
    }

    // Subscribe to real-time updates
    this.on('request:start', sendLog);
    this.on('request:update', sendLog);
    this.on('request:end', sendLog);
    this.on('metrics:update', sendMetrics);

    // Cleanup on disconnect
    ws.on('close', () => {
      this.removeListener('request:start', sendLog);
      this.removeListener('request:update', sendLog);
      this.removeListener('request:end', sendLog);
      this.removeListener('metrics:update', sendMetrics);
    });
  }

  clearLogs(sessionId?: string): void {
    if (sessionId) {
      const toDelete: string[] = [];
      this.requests.forEach((request, id) => {
        if (request.sessionId === sessionId) {
          toDelete.push(id);
        }
      });
      toDelete.forEach(id => this.requests.delete(id));
    } else {
      this.requests.clear();
    }

    this.emit('logs:cleared', sessionId);
  }

  resetMetrics(sessionId?: string): void {
    if (sessionId) {
      this.sessionMetrics.delete(sessionId);
    } else {
      this.sessionMetrics.clear();
    }

    this.persistMetrics();
    this.emit('metrics:reset', sessionId);
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();