import { loadConfig, saveConfig } from "../core/config";
import { getFlag } from "./utils";

export default async function config() {
  const portStr = getFlag("--port") ?? getFlag("-p");
  const idleTimeoutStr = getFlag("--idletimeout");

  if (!portStr && !idleTimeoutStr) {
    const current = await loadConfig();
    console.log("Current config (.wtr.json):");
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  const current = await loadConfig();

  if (portStr) {
    const port = parseInt(portStr);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Error: Port must be a number between 1 and 65535.");
      process.exit(1);
    }
    current.port = port;
    console.log(`Saved port ${port} to .wtr.json`);
  }

  if (idleTimeoutStr) {
    const idleTimeout = parseInt(idleTimeoutStr);
    if (isNaN(idleTimeout) || idleTimeout < 1 || idleTimeout > 300) {
      console.error("Error: Idle timeout must be a number between 1 and 300 (seconds).");
      process.exit(1);
    }
    current.idleTimeout = idleTimeout;
    console.log(`Saved idleTimeout ${idleTimeout}s to .wtr.json`);
  }

  await saveConfig(current);
}
