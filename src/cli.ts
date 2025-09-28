#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { parseStatusLineData, type StatusLineInput } from "./utils/statusline";
import {
  cleanupPidFile,
  isServiceRunning,
  getServiceInfo,
} from "./utils/processCheck";
import { version } from "../package.json";
import { spawn, exec } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  getSessionConfig,
  isSessionRunning,
  getAllActiveSessions,
  type SessionConfig
} from "./utils/sessionManager";

const command = process.argv[2];

const HELP_TEXT = `
Usage: ccr [command]

Commands:
  start         Start server
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  ui            Open the web UI in browser
  sessions      List all active sessions
  -v, version   Show version information
  -h, help      Show help information

Example:
  ccr start
  ccr code "Write a Hello World"
  CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr code "Use GPT-4"
  CCR_MODEL_PREFERENCE=anthropic,claude-3-opus ccr code "Use Claude Opus"
  ccr sessions
  ccr ui
`;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000,
  sessionConfig?: SessionConfig
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const isRunning = sessionConfig
      ? await isSessionRunning(sessionConfig)
      : await isServiceRunning();
    if (isRunning) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  // Check for model preference in environment
  const modelPreference = process.env.CCR_MODEL_PREFERENCE || '';
  let sessionConfig: SessionConfig | null = null;
  let isRunning = false;

  // For session-aware commands, get the session config
  if (['start', 'stop', 'status', 'code'].includes(command)) {
    sessionConfig = getSessionConfig(modelPreference);
    isRunning = await isSessionRunning(sessionConfig);
  } else if (command === 'ui') {
    // For UI command, check if ANY service is running (default or session)
    isRunning = await isServiceRunning();
    if (!isRunning) {
      // Check if there are any active sessions
      const activeSessions = await getAllActiveSessions();
      isRunning = activeSessions.length > 0;
    }
  } else {
    isRunning = await isServiceRunning();
  }

  switch (command) {
    case "start":
      if (sessionConfig) {
        run({ sessionConfig });
      } else {
        run();
      }
      break;
    case "stop":
      if (sessionConfig) {
        const { cleanupSessionPid, getSessionPid } = require("./utils/sessionManager");
        try {
          const pid = getSessionPid(sessionConfig);
          if (pid) {
            process.kill(pid);
            cleanupSessionPid(sessionConfig);
            if (existsSync(sessionConfig.referenceCountFile)) {
              try {
                fs.unlinkSync(sessionConfig.referenceCountFile);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
            console.log(
              `Session ${sessionConfig.sessionId} (${sessionConfig.modelPreference || 'default'}) has been successfully stopped.`
            );
          } else {
            console.log(
              `Session ${sessionConfig.sessionId} is not running.`
            );
          }
        } catch (e) {
          console.log(
            `Failed to stop session ${sessionConfig.sessionId}. It may have already been stopped.`
          );
          cleanupSessionPid(sessionConfig);
        }
      } else {
        try {
          const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
          process.kill(pid);
          cleanupPidFile();
          if (existsSync(REFERENCE_COUNT_FILE)) {
            try {
              fs.unlinkSync(REFERENCE_COUNT_FILE);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          console.log(
            "claude code router service has been successfully stopped."
          );
        } catch (e) {
          console.log(
            "Failed to stop the service. It may have already been stopped."
          );
          cleanupPidFile();
        }
      }
      break;
    case "status":
      await showStatus(sessionConfig);
      break;
    case "statusline":
      // 从stdin读取JSON输入
      let inputData = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("readable", () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          inputData += chunk;
        }
      });

      process.stdin.on("end", async () => {
        try {
          const input: StatusLineInput = JSON.parse(inputData);
          const statusLine = await parseStatusLineData(input);
          console.log(statusLine);
        } catch (error) {
          console.error("Error parsing status line data:", error);
          process.exit(1);
        }
      });
      break;
    case "code":
      if (!isRunning) {
        const sessionLabel = sessionConfig?.modelPreference ?
          ` for session '${sessionConfig.modelPreference}'` : '';
        console.log(`Service not running${sessionLabel}, starting service...`);

        const cliPath = join(__dirname, "cli.js");
        const env = { ...process.env };

        // Pass model preference to the start command
        if (modelPreference) {
          env.CCR_MODEL_PREFERENCE = modelPreference;
        }

        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
          env
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService(10000, 1000, sessionConfig)) {
          const codeArgs = process.argv.slice(3);
          executeCodeCommand(codeArgs, sessionConfig);
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        const codeArgs = process.argv.slice(3);
        executeCodeCommand(codeArgs, sessionConfig);
      }
      break;
    case "ui":
      // Check if specific session is requested via CCR_MODEL_PREFERENCE
      if (modelPreference) {
        const requestedSessionConfig = getSessionConfig(modelPreference);
        const isRequestedSessionRunning = await isSessionRunning(requestedSessionConfig);

        if (isRequestedSessionRunning) {
          // Open UI for the requested session
          const uiUrl = `http://127.0.0.1:${requestedSessionConfig.port}/ui/`;
          console.log(`Opening UI for session: ${requestedSessionConfig.sessionId} (${requestedSessionConfig.modelPreference})`);
          console.log(`Opening UI at ${uiUrl}`);

          // Open URL in browser based on platform
          const platform = process.platform;
          let openCommand = "";

          if (platform === "win32") {
            openCommand = `start ${uiUrl}`;
          } else if (platform === "darwin") {
            openCommand = `open ${uiUrl}`;
          } else if (platform === "linux") {
            openCommand = `xdg-open ${uiUrl}`;
          } else {
            console.error("Unsupported platform for opening browser");
            process.exit(1);
          }

          exec(openCommand, (error) => {
            if (error) {
              console.error("Failed to open browser:", error.message);
              process.exit(1);
            }
          });
          break;
        } else {
          console.log(`Session for '${modelPreference}' is not running.`);
          console.log(`Starting session...`);
          // Will continue to start the service below
          isRunning = false;
        }
      }

      // Check if service is running
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (!(await waitForService())) {
          // If service startup fails, try to start with default config
          console.log(
            "Service startup timeout, trying to start with default configuration..."
          );
          const {
            initDir,
            writeConfigFile,
            backupConfigFile,
          } = require("./utils");
          const { CONFIG_FILE } = require("./constants");

          try {
            // Initialize directories
            await initDir();

            // Check if config file already exists
            const configExists = await fs.promises.access(CONFIG_FILE).then(() => true).catch(() => false);

            if (!configExists) {
              // Only create a minimal default config file if it doesn't exist
              await writeConfigFile({
                PORT: 3456,
                Providers: [],
                Router: {},
              });
              console.log(
                "Created minimal default configuration file at ~/.claude-code-router/config.json"
              );
              console.log(
                "Please edit this file with your actual configuration."
              );
            } else {
              // Config exists but service won't start - likely a config error
              console.log(
                "Configuration file exists but service failed to start. Please check your configuration."
              );
            }

            // Try starting the service again
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: "ignore",
            });

            restartProcess.on("error", (error) => {
              console.error(
                "Failed to start service with default config:",
                error.message
              );
              process.exit(1);
            });

            restartProcess.unref();

            if (!(await waitForService(15000))) {
              // Wait a bit longer for the first start
              console.error(
                "Service startup still failing. Please manually run `ccr start` to start the service and check the logs."
              );
              process.exit(1);
            }
          } catch (error: any) {
            console.error(
              "Failed to create default configuration:",
              error.message
            );
            process.exit(1);
          }
        }
      }

      // Get service info and open UI
      let serviceInfo;
      let selectedSession = null;

      // Check if there are active sessions to get the correct endpoint
      const activeSessions = await getAllActiveSessions();

      if (activeSessions.length > 1) {
        // Multiple sessions running, show them and use the first one
        console.log("\nMultiple sessions detected:");
        activeSessions.forEach((session, index) => {
          const label = session.modelPreference || 'default';
          console.log(`  ${index + 1}. Session ${session.sessionId} (${label}) on port ${session.port}`);
        });
        selectedSession = activeSessions[0];
        console.log(`\nOpening UI for session: ${selectedSession.sessionId} (${selectedSession.modelPreference || 'default'})`);
        console.log(`To specify a different session, use: CCR_MODEL_PREFERENCE="provider,model" ccr ui\n`);
        serviceInfo = {
          endpoint: `http://127.0.0.1:${selectedSession.port}`
        };
      } else if (activeSessions.length === 1) {
        // Single session running
        selectedSession = activeSessions[0];
        serviceInfo = {
          endpoint: `http://127.0.0.1:${selectedSession.port}`
        };
      } else {
        // No sessions, try default service
        serviceInfo = await getServiceInfo();
      }

      // Add temporary API key as URL parameter if successfully generated
      const uiUrl = `${serviceInfo.endpoint}/ui/`;

      console.log(`Opening UI at ${uiUrl}`);

      // Open URL in browser based on platform
      const platform = process.platform;
      let openCommand = "";

      if (platform === "win32") {
        // Windows
        openCommand = `start ${uiUrl}`;
      } else if (platform === "darwin") {
        // macOS
        openCommand = `open ${uiUrl}`;
      } else if (platform === "linux") {
        // Linux
        openCommand = `xdg-open ${uiUrl}`;
      } else {
        console.error("Unsupported platform for opening browser");
        process.exit(1);
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
          process.exit(1);
        }
      });
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "restart":
      if (sessionConfig) {
        const { cleanupSessionPid, getSessionPid } = require("./utils/sessionManager");

        // Stop the session if it's running
        try {
          const pid = getSessionPid(sessionConfig);
          if (pid) {
            process.kill(pid);
            cleanupSessionPid(sessionConfig);
            if (existsSync(sessionConfig.referenceCountFile)) {
              try {
                fs.unlinkSync(sessionConfig.referenceCountFile);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
            console.log(`Session ${sessionConfig.sessionId} has been stopped.`);
          }
        } catch (e) {
          console.log("Session was not running or failed to stop.");
          cleanupSessionPid(sessionConfig);
        }

        // Start the session again
        console.log(`Starting session ${sessionConfig.sessionId}...`);
        const cliPath = join(__dirname, "cli.js");
        const env = { ...process.env };

        if (modelPreference) {
          env.CCR_MODEL_PREFERENCE = modelPreference;
        }

        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
          env
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start session:", error);
          process.exit(1);
        });

        startProcess.unref();
        console.log(`✅ Session ${sessionConfig.sessionId} started successfully.`);
      } else {
        // Default restart behavior
        try {
          const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
          process.kill(pid);
          cleanupPidFile();
          if (existsSync(REFERENCE_COUNT_FILE)) {
            try {
              fs.unlinkSync(REFERENCE_COUNT_FILE);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          console.log("claude code router service has been stopped.");
        } catch (e) {
          console.log("Service was not running or failed to stop.");
          cleanupPidFile();
        }

        console.log("Starting claude code router service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error);
          process.exit(1);
        });

        startProcess.unref();
        console.log("✅ Service started successfully in the background.");
      }
      break;
    case "sessions":
      const sessions = await getAllActiveSessions();
      if (sessions.length === 0) {
        console.log("No active sessions.");
      } else {
        console.log("\nActive Sessions:");
        console.log("================");
        for (const session of sessions) {
          const label = session.modelPreference || 'default';
          console.log(`\nSession ID: ${session.sessionId}`);
          console.log(`Model: ${label}`);
          console.log(`Port: ${session.port}`);
          console.log(`PID: ${require("./utils/sessionManager").getSessionPid(session)}`);
          console.log(`Reference Count: ${require("./utils/sessionManager").getSessionReferenceCount(session)}`);
        }
        console.log();
      }
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
