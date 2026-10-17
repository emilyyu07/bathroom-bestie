import { format, runArrivalNight, runExitAloneNight } from "../src/demo";

const line = (s: string) => console.log(s);
line("=== MAIN RUN: she leaves the group alone and does not get home ===\n");
await runExitAloneNight((e) => line(format(e)));
line("\n=== SHORT RUN: the same walk, but she arrives home ===\n");
await runArrivalNight((e) => line(format(e)));
line("\n(Scripted: in-memory store, fake clock. The real demo runs on the emulator.)");
