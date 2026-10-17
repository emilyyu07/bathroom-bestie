import { runCommand } from "./run";
import { sweepCommand } from "./sweep";

const [cmd] = process.argv.slice(2);
if (cmd === "run") process.exit(runCommand());
else if (cmd === "sweep") process.exit(sweepCommand());
else {
  console.error("usage: pnpm sim <run|sweep>");
  process.exit(2);
}
