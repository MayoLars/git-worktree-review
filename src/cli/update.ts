import { $ } from "bun";
import { dirname, resolve } from "path";
import { getVersion } from "./version";

export default async function update() {
  const repoDir = resolve(dirname(import.meta.dir), "..");
  const oldVersion = await getVersion();

  console.log(`Current version: v${oldVersion}`);
  console.log("Pulling latest changes...");
  const pull = await $`git -C ${repoDir} pull`.quiet();
  const pullOutput = pull.text().trim();
  console.log(pullOutput);

  if (pullOutput === "Already up to date.") {
    return;
  }

  console.log("Installing dependencies...");
  await $`bun install --cwd ${repoDir}`.quiet();

  const newVersion = await getVersion();
  if (newVersion !== oldVersion) {
    console.log(`Updated: v${oldVersion} → v${newVersion}`);
  } else {
    console.log("Updated successfully!");
  }
}
