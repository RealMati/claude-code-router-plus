import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { monitoringService } from "./utils/monitoring";
import websocket from "@fastify/websocket";
import type { FastifyRequest, FastifyReply } from "fastify";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Register WebSocket support
  server.app.register(websocket);

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async () => {
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
  server.app.post("/api/config", async (req: FastifyRequest) => {
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
  server.app.post("/api/restart", async (_req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.get("/ui", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect("/ui/");
  });

  // 版本检查端点
  server.app.get("/api/update/check", async (_req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.post("/api/update/perform", async (req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.get("/api/logs/files", async (_req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.get("/api/logs", async (req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.delete("/api/logs", async (req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.get("/api/sessions", async (_req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.get("/api/monitoring/logs", async (req: FastifyRequest) => {
    const { sessionId, limit } = req.query as any;
    const logs = monitoringService.getRecentRequests(sessionId, parseInt(limit) || 100);
    return { logs };
  });

  server.app.get("/api/monitoring/metrics", async (req: FastifyRequest) => {
    const { sessionId } = req.query as any;
    if (sessionId) {
      const metrics = monitoringService.getSessionMetrics(sessionId);
      return { metrics };
    } else {
      const metrics = monitoringService.getAllSessionMetrics();
      return { metrics };
    }
  });

  server.app.delete("/api/monitoring/logs", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = req.query as any;
      // If no sessionId is provided, clear all logs
      monitoringService.clearLogs(sessionId || undefined);
      return { success: true, message: "Logs cleared" };
    } catch (error) {
      console.error("Failed to clear monitoring logs:", error);
      return reply.status(500).send({
        success: false,
        error: "Failed to clear monitoring logs",
        message: (error as Error).message
      });
    }
  });

  server.app.post("/api/monitoring/metrics/reset", async (req: FastifyRequest) => {
    const { sessionId } = req.body as any;
    monitoringService.resetMetrics(sessionId);
    return { success: true, message: "Metrics reset" };
  });

  // WebSocket endpoint for real-time monitoring
  server.app.register(async function (fastify: any) {
    fastify.get('/api/monitoring/stream', { websocket: true }, (connection: any, req: FastifyRequest) => {
      const { sessionId } = req.query as any;
      monitoringService.streamLogs(connection.socket, sessionId);
    });
  });

  // Stop a specific session
  server.app.post("/api/sessions/:sessionId/stop", async (req: FastifyRequest, reply: FastifyReply) => {
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
  server.app.post("/api/sessions/start", async (req: FastifyRequest, reply: FastifyReply) => {
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

  // Get timing data for sessions
  server.app.get("/api/sessions/timings", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fs = require("fs");
      const path = require("path");

      // Read timing data from project directory
      const cwd = process.cwd();
      const timingsDir = path.join(cwd, ".claude/timings");

      if (!existsSync(timingsDir)) {
        return { sessions: [] };
      }

      const { getAllActiveSessions } = require("./utils/sessionManager");
      const activeSessions = await getAllActiveSessions();
      const activeSessionIds = new Set(activeSessions.map((s: any) => s.sessionId));

      const sessionTimings: any[] = [];
      const sessionDirs = fs.readdirSync(timingsDir);

      for (const sessionId of sessionDirs) {
        const timingFile = path.join(timingsDir, sessionId, "session-timings.jsonl");

        if (existsSync(timingFile)) {
          const content = fs.readFileSync(timingFile, "utf-8");
          const lines = content.trim().split("\n").filter((line: string) => line);
          const timings = lines.map((line: string) => JSON.parse(line));

          // Find matching session info
          const sessionInfo = activeSessions.find((s: any) => s.sessionId === sessionId);

          sessionTimings.push({
            sessionId,
            modelPreference: sessionInfo?.modelPreference || "unknown",
            port: sessionInfo?.port || parseInt(timings[0]?.router_port) || 0,
            isActive: activeSessionIds.has(sessionId),
            timings: timings,
            stats: {
              total: timings.length,
              avgDuration: timings.reduce((sum: number, t: any) => sum + t.duration_seconds, 0) / timings.length,
              minDuration: Math.min(...timings.map((t: any) => t.duration_seconds)),
              maxDuration: Math.max(...timings.map((t: any) => t.duration_seconds)),
            }
          });
        }
      }

      return { sessions: sessionTimings };
    } catch (error) {
      console.error("Failed to get timing data:", error);
      reply.status(500).send({ error: "Failed to get timing data" });
    }
  });

  // Directory browser endpoint
  server.app.get("/api/browse-directory", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path: dirPath = homedir() } = req.query as { path?: string };
      const fs = require("fs");
      const path = require("path");

      // Resolve the path to handle ~ and relative paths
      let resolvedPath = dirPath;
      if (dirPath.startsWith("~")) {
        resolvedPath = path.join(homedir(), dirPath.slice(1));
      }
      resolvedPath = path.resolve(resolvedPath);

      // Check if path exists and is a directory
      if (!existsSync(resolvedPath)) {
        return reply.status(404).send({
          success: false,
          message: "Directory not found"
        });
      }

      const stats = statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return reply.status(400).send({
          success: false,
          message: "Path is not a directory"
        });
      }

      // Read directory contents
      const items = readdirSync(resolvedPath);
      const directories = [];

      for (const item of items) {
        // Skip hidden files/folders unless it's the home directory
        if (item.startsWith(".") && item !== "..") continue;

        try {
          const itemPath = path.join(resolvedPath, item);
          const itemStats = statSync(itemPath);

          if (itemStats.isDirectory()) {
            directories.push({
              name: item,
              path: itemPath,
              type: "directory"
            });
          }
        } catch (err) {
          // Skip items we can't access
          continue;
        }
      }

      // Sort directories alphabetically
      directories.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      // Add parent directory option if not at root
      if (resolvedPath !== "/" && resolvedPath !== homedir()) {
        directories.unshift({
          name: "..",
          path: path.dirname(resolvedPath),
          type: "parent"
        });
      }

      return {
        success: true,
        currentPath: resolvedPath,
        directories,
        homePath: homedir()
      };
    } catch (error) {
      console.error("Failed to browse directory:", error);
      return reply.status(500).send({
        success: false,
        message: "Failed to browse directory: " + (error as Error).message
      });
    }
  });

  // Benchmark endpoint for launching multiple terminals
  server.app.post("/api/benchmark/launch", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectPath, prompt, models } = req.body as {
        projectPath: string;
        prompt: string;
        models: Array<{ provider: string; model: string; selected: boolean }>;
      };

      // Validate inputs
      if (!projectPath || !prompt || !models || models.length === 0) {
        return reply.status(400).send({
          success: false,
          message: "Missing required parameters"
        });
      }

      const selectedModels = models.filter(m => m.selected);
      if (selectedModels.length === 0) {
        return reply.status(400).send({
          success: false,
          message: "No models selected"
        });
      }

      const { spawn, execSync } = require("child_process");
      const { platform } = require("os");
      const path = require("path");
      const fs = require("fs");
      const commands: string[] = [];
      let launched = 0;

      // Get the CLI path
      const cliPath = path.join(__dirname, "cli.js");

      // Check if the project directory is a git repository
      let isGitRepo = false;
      try {
        if (fs.existsSync(path.join(projectPath, ".git"))) {
          // Verify it's a valid git repo
          execSync("git status", { cwd: projectPath, stdio: "ignore" });
          isGitRepo = true;
        }
      } catch (err) {
        isGitRepo = false;
      }

      // Generate timestamp for unique worktree names
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

      // Launch terminals for each selected model
      for (const model of selectedModels) {
        const modelPreference = `${model.provider},${model.model}`;
        let workingDirectory = projectPath;
        let setupCommands = "";

        if (isGitRepo) {
          // Create unique worktree name
          const worktreeName = `benchmark-${model.provider}-${model.model.replace(/[/:]/g, "-")}-${timestamp}`;
          const worktreePath = path.join(path.dirname(projectPath), worktreeName);

          // Commands to create and setup worktree
          setupCommands = `cd '${projectPath}' && git worktree add '${worktreePath}' && cd '${worktreePath}' && `;
          workingDirectory = worktreePath;

          // Store worktree path for potential cleanup
          console.log(`Creating worktree: ${worktreeName} at ${worktreePath}`);
        } else {
          // If not a git repo, create a copy of the project directory
          const copyName = `benchmark-${model.provider}-${model.model.replace(/[/:]/g, "-")}-${timestamp}`;
          const copyPath = path.join(path.dirname(projectPath), copyName);

          // Commands to copy the directory and cd into it
          setupCommands = `cp -r '${projectPath}' '${copyPath}' && cd '${copyPath}' && `;
          workingDirectory = copyPath;

          console.log(`Creating project copy: ${copyName} at ${copyPath}`);
        }

        const command = `${setupCommands}export CCR_MODEL_PREFERENCE="${modelPreference}" && node "${cliPath}" code "${prompt}"  --dangerously-skip-permissions`;
        commands.push(command);

        // Platform-specific terminal launching
        if (platform() === "darwin") {
          // macOS - use osascript with proper escaping
          try {
            // Escape the command for AppleScript string
            // Replace backslashes first, then quotes
            const escapedCommand = command
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"');

            // Build AppleScript command
            const script = `tell application "Terminal"
              activate
              do script "${escapedCommand}"
            end tell`;

            // Execute AppleScript
            execSync(`osascript -e '${script.replace(/'/g, "'\\''").replace(/\n/g, "' -e '")}'`, {
              stdio: 'inherit'
            });

            launched++;
            console.log(`Launched terminal for ${model.provider}/${model.model}`);
          } catch (err) {
            console.error(`Failed to launch terminal for ${model.provider}/${model.model}:`, err);
          }
        } else if (platform() === "win32") {
          // Windows - use cmd.exe with start command
          spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", command], {
            detached: true,
            stdio: "ignore",
            shell: true
          }).unref();

          launched++;
        } else {
          // Linux - try common terminal emulators
          const terminals = ["gnome-terminal", "konsole", "xterm", "x-terminal-emulator"];
          let terminalLaunched = false;

          for (const terminal of terminals) {
            try {
              if (terminal === "gnome-terminal") {
                spawn(terminal, ["--", "bash", "-c", `${command}; exec bash`], {
                  detached: true,
                  stdio: "ignore"
                }).unref();
              } else if (terminal === "konsole") {
                spawn(terminal, ["-e", "bash", "-c", `${command}; exec bash`], {
                  detached: true,
                  stdio: "ignore"
                }).unref();
              } else {
                spawn(terminal, ["-e", `bash -c "${command}; exec bash"`], {
                  detached: true,
                  stdio: "ignore"
                }).unref();
              }

              terminalLaunched = true;
              launched++;
              break;
            } catch (err) {
              // Try next terminal
              continue;
            }
          }

          if (!terminalLaunched) {
            console.error(`Could not find terminal emulator for model ${modelPreference}`);
          }
        }

        // Small delay between launching terminals to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success: true,
        message: `Launched ${launched} terminal${launched > 1 ? 's' : ''}${isGitRepo ? ' with git worktrees' : ' with project folder copies'}`,
        launched,
        commands,
        isGitRepo,
        timestamp: isGitRepo ? timestamp : undefined
      };
    } catch (error) {
      console.error("Failed to launch benchmark:", error);
      return reply.status(500).send({
        success: false,
        message: "Failed to launch benchmark: " + (error as Error).message
      });
    }
  });

  return server;
};
