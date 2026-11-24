/**
 * JavaScript source for a command that runs under the test queue: the block returns once
 * the ticket holding the turn is in phase `running`.
 *
 * A command starts while its ticket is still in phase `spawning` — prospec registers the
 * process tree right after the spawn, in a transaction of its own. A command that reads or
 * rewrites the queue state at once therefore races that registration, and wins on a host
 * where a process starts faster than the registration completes.
 */
export function awaitRegisteredTurn(stateFile: string): string {
  return (
    `{const fs=require('node:fs');const until=Date.now()+20000;for(;;){` +
    `try{const t=JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)},'utf8')).tickets[0];if(t&&t.phase==='running')break}catch{}` +
    `if(Date.now()>until)process.exit(97);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}}`
  );
}
