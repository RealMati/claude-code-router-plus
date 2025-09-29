import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Activity,
  TrendingUp,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  Download,
  Circle,
  X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/lib/api';
import { toast } from 'sonner';

interface RequestLog {
  id: string;
  timestamp: string;
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

interface SessionMetrics {
  sessionId: string;
  startTime: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  averageResponseTime: number;
  errors: number;
  providers: Record<string, number>;
  models: Record<string, number>;
}

interface MonitoringModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MonitoringModal({ isOpen, onClose }: MonitoringModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [metrics, setMetrics] = useState<SessionMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [currentSession, setCurrentSession] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const apiClient = useRef<ApiClient | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Cleanup when modal closes
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Initialize API client
    const endpoint = window.location.origin;
    apiClient.current = new ApiClient(endpoint);

    // Load initial data
    loadMonitoringData();
    loadSessionInfo();

    // Setup WebSocket for real-time updates
    setupWebSocket();

    // Auto-refresh interval
    const interval = autoRefresh ? setInterval(loadMonitoringData, 5000) : null;

    return () => {
      if (interval) clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedSession, autoRefresh, isOpen]);

  const setupWebSocket = () => {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/monitoring/stream${
        selectedSession !== 'all' ? `?sessionId=${selectedSession}` : ''
      }`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('Monitoring WebSocket connected');
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'log':
            setLogs(prev => [data.data, ...prev].slice(0, 100));
            break;
          case 'metrics':
            if (Array.isArray(data.data)) {
              setMetrics(data.data);
            } else {
              setMetrics(prev => {
                const updated = [...prev];
                const index = updated.findIndex(m => m.sessionId === data.data.sessionId);
                if (index >= 0) {
                  updated[index] = data.data;
                } else {
                  updated.push(data.data);
                }
                return updated;
              });
            }
            break;
          case 'initial':
            setLogs(data.data);
            break;
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        if (isOpen && autoRefresh) {
          setTimeout(() => {
            setupWebSocket();
          }, 3000);
        }
      };
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  };

  const loadSessionInfo = async () => {
    try {
      const sessions = await apiClient.current?.get('/api/sessions') as any;
      const current = sessions?.find((s: any) => s.isCurrent);
      setCurrentSession(current);
    } catch (error) {
      console.error('Failed to load session info:', error);
    }
  };

  const loadMonitoringData = async () => {
    try {
      const [logsResponse, metricsResponse] = await Promise.all([
        apiClient.current?.get(`/api/monitoring/logs${
          selectedSession !== 'all' ? `?sessionId=${selectedSession}` : ''
        }`) as Promise<any>,
        apiClient.current?.get(`/api/monitoring/metrics${
          selectedSession !== 'all' ? `?sessionId=${selectedSession}` : ''
        }`) as Promise<any>
      ]);

      setLogs(logsResponse?.logs || []);
      setMetrics(Array.isArray(metricsResponse?.metrics)
        ? metricsResponse.metrics
        : metricsResponse?.metrics ? [metricsResponse.metrics] : []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      toast.error(t('monitoring.Failed to load monitoring data'));
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      await apiClient.current?.delete(`/api/monitoring/logs${
        selectedSession !== 'all' ? `?sessionId=${selectedSession}` : ''
      }`);
      setLogs([]);
      toast.success(t('monitoring.Logs cleared successfully'));
    } catch (error) {
      toast.error(t('monitoring.Failed to clear logs'));
    }
  };

  const resetMetrics = async (sessionId?: string) => {
    try {
      await apiClient.current?.post('/api/monitoring/metrics/reset', { sessionId });
      loadMonitoringData();
      toast.success(t('monitoring.Metrics reset successfully'));
    } catch (error) {
      toast.error(t('monitoring.Failed to reset metrics'));
    }
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `logs_${new Date().toISOString()}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'error': return 'text-red-500';
      case 'pending': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const getTotalMetrics = () => {
    return metrics.reduce((acc, m) => ({
      requests: acc.requests + m.requestCount,
      inputTokens: acc.inputTokens + m.totalInputTokens,
      outputTokens: acc.outputTokens + m.totalOutputTokens,
      errors: acc.errors + m.errors
    }), { requests: 0, inputTokens: 0, outputTokens: 0, errors: 0 });
  };

  const totals = getTotalMetrics();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center pr-6">
            <div>
              <DialogTitle className="text-2xl">
                {t('monitoring.Monitoring Dashboard')}
                {currentSession && (
                  <Badge variant="secondary" className="ml-3 text-sm">
                    Session: {currentSession.sessionId}
                  </Badge>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-500">{t('monitoring.Real-time request tracking and metrics')}</p>
                {currentSession && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {currentSession.provider}/{currentSession.model}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Port: {currentSession.port}
                    </Badge>
                  </div>
                )}
              </div>
              <p className="text-xs text-orange-600 mt-1">
                {t('monitoring.Session warning')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? t('monitoring.Auto-refresh ON') : t('monitoring.Auto-refresh OFF')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportLogs}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('monitoring.Export Logs')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('monitoring.Total Requests')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{totals.requests}</span>
                  <Activity className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('monitoring.Input Tokens')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{totals.inputTokens.toLocaleString()}</span>
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('monitoring.Output Tokens')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{totals.outputTokens.toLocaleString()}</span>
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('monitoring.Error Rate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {totals.requests > 0
                      ? `${((totals.errors / totals.requests) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </span>
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">{t('monitoring.Request Logs')}</TabsTrigger>
              <TabsTrigger value="metrics">{t('monitoring.Session Metrics')}</TabsTrigger>
              <TabsTrigger value="models">{t('monitoring.Model Usage')}</TabsTrigger>
            </TabsList>

            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{t('monitoring.Recent Requests')}</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearLogs}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('monitoring.Clear Logs')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {logs.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">{t('monitoring.No requests logged yet')}</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {logs.map((log) => (
                          <div key={log.id} className="border rounded p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <Circle className={`h-2 w-2 ${getStatusColor(log.status)}`} />
                                <span className="font-mono text-sm">{log.method} {log.path}</span>
                                <Badge variant="outline" className="text-xs">
                                  {log.sessionId}
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatTimestamp(log.timestamp)}
                              </span>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                              {log.provider && (
                                <span>Provider: <strong>{log.provider}</strong></span>
                              )}
                              {log.model && (
                                <span>Model: <strong>{log.model}</strong></span>
                              )}
                              {log.duration && (
                                <span>Duration: <strong>{formatDuration(log.duration)}</strong></span>
                              )}
                              {log.inputTokens && (
                                <span>Input: <strong>{log.inputTokens}</strong></span>
                              )}
                              {log.outputTokens && (
                                <span>Output: <strong>{log.outputTokens}</strong></span>
                              )}
                            </div>
                            {log.error && (
                              <div className="text-sm text-red-500">
                                Error: {log.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('monitoring.Session Performance Metrics')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">{t('monitoring.No metrics available')}</p>
                  ) : (
                    <div className="space-y-4">
                      {metrics.map((metric) => (
                        <div key={metric.sessionId} className="border rounded p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold">Session: {metric.sessionId}</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resetMetrics(metric.sessionId)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">{t('monitoring.Requests')}</p>
                              <p className="font-semibold">{metric.requestCount}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">{t('monitoring.Avg Response Time')}</p>
                              <p className="font-semibold">{formatDuration(metric.averageResponseTime)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">{t('monitoring.Total Tokens')}</p>
                              <p className="font-semibold">
                                {(metric.totalInputTokens + metric.totalOutputTokens).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">{t('monitoring.Errors')}</p>
                              <p className="font-semibold text-red-500">{metric.errors}</p>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            Started: {formatTimestamp(metric.startTime)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="models" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('monitoring.Model & Provider Usage')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {metrics.map((metric) => (
                      <div key={metric.sessionId} className="space-y-4">
                        <h4 className="font-semibold">Session: {metric.sessionId}</h4>

                        <div>
                          <h5 className="text-sm font-medium mb-2">{t('monitoring.Providers')}</h5>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(metric.providers).map(([provider, count]) => (
                              <Badge key={provider} variant="secondary">
                                {provider}: {count}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h5 className="text-sm font-medium mb-2">{t('monitoring.Models')}</h5>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(metric.models).map(([model, count]) => (
                              <Badge key={model} variant="outline">
                                {model}: {count}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}