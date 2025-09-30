import React, { useState, useEffect } from 'react';
import { Clock, TrendingUp, Activity, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TimingEntry {
  router_session_id: string;
  router_port: number;
  claude_session_id: string;
  timestamp: string;
  duration_seconds: number;
  turns: number;
  prompt_preview: string;
}

interface SessionTimingData {
  sessionId: string;
  modelPreference: string;
  port: number;
  isActive: boolean;
  timings: TimingEntry[];
  stats: {
    total: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
  };
}

interface SessionTimingsResponse {
  sessions: SessionTimingData[];
}

const SessionTimings: React.FC = () => {
  const [timings, setTimings] = useState<SessionTimingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [previousTotalSessions, setPreviousTotalSessions] = useState<Record<string, number>>({});

  // Create audio element for notification sound
  const playNotificationSound = () => {
    // Create a simple notification beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const fetchTimings = async () => {
    try {
      const response = await fetch('/api/sessions/timings');
      if (response.ok) {
        const data: SessionTimingsResponse = await response.json();

        // Check if any session has new completions
        if (!loading) { // Skip notification on initial load
          data.sessions.forEach(session => {
            const previousCount = previousTotalSessions[session.sessionId] || 0;
            const currentCount = session.stats.total;

            if (currentCount > previousCount) {
              // New session completed, play sound
              playNotificationSound();
            }
          });
        }

        // Update previous counts
        const newCounts: Record<string, number> = {};
        data.sessions.forEach(session => {
          newCounts[session.sessionId] = session.stats.total;
        });
        setPreviousTotalSessions(newCounts);

        setTimings(data.sessions);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch timings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimings();
    const interval = setInterval(fetchTimings, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs.toFixed(0)}s`;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getLatestTiming = (session: SessionTimingData): TimingEntry | null => {
    if (session.timings.length === 0) return null;
    return session.timings[session.timings.length - 1];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (timings.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No timing data available yet.</p>
        <p className="text-sm mt-2">Start a Claude Code session to begin tracking.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Session Timings</h2>
        <div className="text-sm text-gray-500">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {timings.map((session) => {
          const latest = getLatestTiming(session);

          return (
            <Card key={session.sessionId} className={session.isActive ? 'border-blue-500 border-2' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-500">
                      {session.sessionId}
                    </span>
                    {session.isActive && (
                      <Badge variant="default" className="bg-blue-500">
                        <Activity className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="text-sm text-gray-500">
                    Port: {session.port}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {session.modelPreference}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Statistics */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Total Sessions</div>
                    <div className="text-2xl font-bold">{session.stats.total}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Avg Duration
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatDuration(session.stats.avgDuration)}
                    </div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Min</div>
                    <div className="text-xl font-bold text-green-600">
                      {formatDuration(session.stats.minDuration)}
                    </div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Max</div>
                    <div className="text-xl font-bold text-orange-600">
                      {formatDuration(session.stats.maxDuration)}
                    </div>
                  </div>
                </div>

                {/* Latest Session */}
                {latest && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="font-semibold text-gray-700">Latest Session</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatTimestamp(latest.timestamp)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <span className="ml-2 font-semibold text-blue-600">
                          {formatDuration(latest.duration_seconds)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Turns:</span>
                        <span className="ml-2 font-semibold">{latest.turns}</span>
                      </div>
                    </div>
                    {latest.prompt_preview && latest.prompt_preview !== 'N/A' && (
                      <div className="mt-2 text-sm text-gray-600 italic truncate">
                        "{latest.prompt_preview}"
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Sessions Timeline */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Recent Activity
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {session.timings.slice(-5).reverse().map((timing, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm p-2 hover:bg-gray-50 rounded"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-xs text-gray-400">
                            {formatTimestamp(timing.timestamp)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="font-mono text-blue-600">
                              {formatDuration(timing.duration_seconds)}
                            </span>
                          </div>
                          <div className="text-gray-500">
                            {timing.turns} turns
                          </div>
                        </div>
                        {timing.prompt_preview && timing.prompt_preview !== 'N/A' && (
                          <div className="text-xs text-gray-400 truncate max-w-xs ml-4">
                            {timing.prompt_preview.substring(0, 50)}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SessionTimings;
