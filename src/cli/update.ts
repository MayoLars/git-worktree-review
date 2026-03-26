import { $ } from "bun";
import { dirname, resolve } from "path";

export default async function update() {
  const repoDir = resolve(dirname(import.meta.dir), "..");

  console.log("Pulling latest changes...");
  const pull = await $`git -C ${repoDir} pull`.quiet();
  const pullOutput = pull.text().trim();
  console.log(pullOutput);

  if (pullOutput === "Already up to date.") {
    return;
  }

  console.log("Installing dependencies...");
  await $`bun install --cwd ${repoDir}`.quiet();
  console.log("Updated successfully!");
}
