import React, { useState, useEffect } from 'react';

interface Session {
  sessionId: string;
  modelPreference: string;
  port: number;
  provider?: string;
  model?: string;
  isCurrent: boolean;
  pid: number | null;
  referenceCount: number;
}

const SessionManager: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [newModelPreference, setNewModelPreference] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const stopSession = async (sessionId: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/stop`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(data.message);
        await fetchSessions();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to stop session');
    }
    setLoading(false);
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 3000);
  };

  const startSession = async () => {
    if (!newModelPreference.trim()) {
      setError('Please enter a model preference (e.g., provider,model)');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelPreference: newModelPreference })
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(data.message);
        setNewModelPreference('');
        await fetchSessions();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to start session');
    }
    setLoading(false);
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 3000);
  };

  const openSessionUI = (port: number) => {
    window.open(`http://127.0.0.1:${port}/ui/`, '_blank');
  };

  return (
    <div className="p-6 bg-gray-50 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Session Management</h2>

      {/* Start New Session */}
      <div className="mb-6 p-4 bg-white rounded shadow">
        <h3 className="text-lg font-semibold mb-3">Start New Session</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., openrouter,gpt-5 or provider/model"
            value={newModelPreference}
            onChange={(e) => setNewModelPreference(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={startSession}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting...' : 'Start Session'}
          </button>
        </div>
        {error && (
          <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-2 p-2 bg-green-100 text-green-700 rounded text-sm">
            {success}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded shadow">
        <h3 className="text-lg font-semibold p-4 border-b">Active Sessions ({sessions.length})</h3>

        {sessions.length === 0 ? (
          <div className="p-4 text-gray-500 text-center">No active sessions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Session ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Port
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ref Count
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sessions.map((session) => (
                  <tr key={session.sessionId} className={session.isCurrent ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {session.sessionId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {session.modelPreference}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {session.port}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {session.pid || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {session.referenceCount}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {session.isCurrent && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openSessionUI(session.port)}
                          className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Open UI
                        </button>
                        <button
                          onClick={() => stopSession(session.sessionId)}
                          disabled={loading || session.isCurrent}
                          className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Stop
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-4 p-4 bg-blue-50 rounded">
        <h4 className="font-semibold text-sm mb-2">Quick Tips:</h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Model preference format: <code className="bg-gray-100 px-1 rounded">provider,model</code> or <code className="bg-gray-100 px-1 rounded">provider/model</code></li>
          <li>• Example: <code className="bg-gray-100 px-1 rounded">openrouter,gpt-5</code> or <code className="bg-gray-100 px-1 rounded">openrouter/gemini-2.5-pro</code></li>
          <li>• Each session runs on its own port</li>
          <li>• You cannot stop the current session from its own UI</li>
        </ul>
      </div>
    </div>
  );
};

export default SessionManager;