import { judge } from "./judge";
import { loadScenarios } from "./scenarios";
import { runScenario } from "./runner";

export function runCommand(): number {
  const rows = loadScenarios().map((sc) => ({ sc, v: judge(sc, runScenario(sc)) }));
  const table = rows.map(({ sc, v }) => ({
    scenario: sc.name,
    expected: v.expected,
    actual: v.actual,
    "time-to-alert": v.timeToAlert === null ? "-" : `${v.timeToAlert} min`,
    result: v.pass ? "PASS" : "FAIL",
  }));
  console.table(table);
  const failed = rows.filter((r) => !r.v.pass).length;
  console.log(failed ? `${failed} scenario(s) regressed` : "all scenarios pass");
  return failed ? 1 : 0;
}
