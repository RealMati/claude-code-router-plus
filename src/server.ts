import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { monitoringService } from "./utils/monitoring";
import websocket from "@fastify/websocket";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Register WebSocket support
  server.app.register(websocket);

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // 获取当前版本
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // 执行更新端点
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // 执行更新逻辑
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // 获取日志文件列表端点
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // Session management endpoints
  server.app.get("/api/sessions", async (req, reply) => {
    try {
      const { getAllActiveSessions } = require("./utils/sessionManager");
      const sessions = await getAllActiveSessions();

      // Add current session indicator
      const currentPort = config.initialConfig?.CCR_SESSION_PORT || config.initialConfig?.PORT;

      return sessions.map((session: any) => ({
        sessionId: session.sessionId,
        modelPreference: session.modelPreference || 'default',
        port: session.port,
        provider: session.provider,
        model: session.model,
        isCurrent: session.port === currentPort,
        pid: require("./utils/sessionManager").getSessionPid(session),
        referenceCount: require("./utils/sessionManager").getSessionReferenceCount(session)
      }));
    } catch (error) {
      console.error("Failed to get sessions:", error);
      reply.status(500).send({ error: "Failed to get sessions" });
    }
  });

  // Monitoring endpoints
  server.app.get("/api/monitoring/logs", async (req, reply) => {
    const { sessionId, limit } = req.query as any;
    const logs = monitoringService.getRecentRequests(sessionId, parseInt(limit) || 100);
    return { logs };
  });

  server.app.get("/api/monitoring/metrics", async (req, reply) => {
    const { sessionId } = req.query as any;
    if (sessionId) {
      const metrics = monitoringService.getSessionMetrics(sessionId);
      return { metrics };
    } else {
      const metrics = monitoringService.getAllSessionMetrics();
      return { metrics };
    }
  });

  server.app.delete("/api/monitoring/logs", async (req, reply) => {
    const { sessionId } = req.query as any;
    monitoringService.clearLogs(sessionId);
    return { success: true, message: "Logs cleared" };
  });

  server.app.post("/api/monitoring/metrics/reset", async (req, reply) => {
    const { sessionId } = req.body as any;
    monitoringService.resetMetrics(sessionId);
    return { success: true, message: "Metrics reset" };
  });

  // WebSocket endpoint for real-time monitoring
  server.app.register(async function (fastify) {
    fastify.get('/api/monitoring/stream', { websocket: true }, (connection, req) => {
      const { sessionId } = req.query as any;
      monitoringService.streamLogs(connection.socket, sessionId);
    });
  });

  // Stop a specific session
  server.app.post("/api/sessions/:sessionId/stop", async (req, reply) => {
    try {
      const { sessionId } = req.params as any;

      // Check access level - stopping sessions requires proper access
      const accessLevel = (req as any).accessLevel || "restricted";

      // For cross-session stops, we need to handle this differently
      // The session being stopped might be from another instance
      if (accessLevel === "restricted") {
        // For now, allow stopping any session from any session UI
        // In production, you might want stricter controls
        console.log(`Attempting to stop session ${sessionId} from restricted access`);
      }

      const { getAllActiveSessions, getSessionPid, cleanupSessionPid } = require("./utils/sessionManager");

      const sessions = await getAllActiveSessions();
      const session = sessions.find((s: any) => s.sessionId === sessionId);

      if (!session) {
        console.error(`Session ${sessionId} not found in active sessions`);
        reply.status(404).send({ error: "Session not found", sessionId });
        return;
      }

      const pid = getSessionPid(session);
      if (pid) {
        try {
          // Try to kill the process
          process.kill(pid, 'SIGTERM');

          // Wait a moment to see if it stopped
          await new Promise(resolve => setTimeout(resolve, 500));

          // Check if process still exists
          try {
            process.kill(pid, 0); // Signal 0 just checks if process exists
            // If we get here, process is still running, try SIGKILL
            process.kill(pid, 'SIGKILL');
          } catch {
            // Process already stopped
          }

          cleanupSessionPid(session);

          // Clean up reference count file
          const fs = require('fs');
          if (fs.existsSync(session.referenceCountFile)) {
            try {
              fs.unlinkSync(session.referenceCountFile);
            } catch (e) {
              console.error(`Failed to clean up reference count file: ${e}`);
            }
          }

          return { success: true, message: `Session ${sessionId} stopped successfully` };
        } catch (e: any) {
          console.error(`Error stopping session ${sessionId}:`, e);

          if (e.code === 'EPERM') {
            // Permission denied - process might be owned by different user
            reply.status(403).send({
              error: "Permission denied to stop session",
              sessionId,
              message: "The session process cannot be stopped due to permissions"
            });
            return;
          } else if (e.code === 'ESRCH') {
            // Process doesn't exist
            cleanupSessionPid(session);
            return { success: true, message: `Session ${sessionId} was already stopped` };
          }

          // Other errors
          reply.status(500).send({
            error: "Failed to stop session",
            sessionId,
            message: e.message
          });
          return;
        }
      } else {
        return { success: false, message: `Session ${sessionId} is not running (no PID found)` };
      }
    } catch (error: any) {
      console.error("Failed to stop session:", error);
      reply.status(500).send({
        error: "Failed to stop session",
        message: error.message || "Unknown error"
      });
    }
  });

  // Start a new session
  server.app.post("/api/sessions/start", async (req, reply) => {
    try {
      const { modelPreference } = req.body as any;

      if (!modelPreference) {
        reply.status(400).send({ error: "Model preference is required" });
        return;
      }

      const { getSessionConfig, isSessionRunning } = require("./utils/sessionManager");
      const sessionConfig = getSessionConfig(modelPreference);

      // Check if already running
      if (await isSessionRunning(sessionConfig)) {
        return {
          success: false,
          message: `Session for ${modelPreference} is already running`,
          sessionId: sessionConfig.sessionId,
          port: sessionConfig.port
        };
      }

      // Start the session
      const { spawn } = require("child_process");
      const { join } = require("path");
      const cliPath = join(__dirname, "cli.js");

      const env = { ...process.env, CCR_MODEL_PREFERENCE: modelPreference };
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
        env
      });

      startProcess.unref();

      // Wait a bit for the service to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        message: `Session started for ${modelPreference}`,
        sessionId: sessionConfig.sessionId,
        port: sessionConfig.port
      };
    } catch (error) {
      console.error("Failed to start session:", error);
      reply.status(500).send({ error: "Failed to start session" });
    }
  });

  return server;
};
