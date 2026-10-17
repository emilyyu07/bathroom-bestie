import { runCommand } from "./run";
import { sweepCommand, replayCommand } from "./sweep";

const [cmd] = process.argv.slice(2);
if (cmd === "run") process.exit(runCommand());
else if (cmd === "sweep") process.exit(sweepCommand());
else if (cmd === "replay") process.exit(replayCommand());
else {
  console.error("usage: pnpm sim <run|sweep|replay>");
  process.exit(2);
}
