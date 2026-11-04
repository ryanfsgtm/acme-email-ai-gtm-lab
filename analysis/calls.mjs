#!/usr/bin/env node
// Call analysis pipeline driver. Run `node analysis/calls.mjs help`.
import { existsSync } from 'node:fs';
import { DB_PATH } from './lib/corpus.mjs';

const HELP = `Usage: node analysis/calls.mjs <command> [options]

Commands
  init      Start a run. With no options it covers the class slice: 200 calls
            sampled across every call type, the same 200 for everyone. Options:
              --all                every call (2,500; about 125 subagent jobs)
              --limit N            a sample of N calls, in proportion to call types
              --call-type "Name"   only one call type, e.g. "Pricing and procurement"
              --segment Name       only SMB, Mid-market or Enterprise accounts
              --batch-size N       calls per subagent job (default 20)
              --wave N             jobs handed out per step (default 10)
              --audit N            calls to re-check with the auditor (default 2%, 10 to 50)
              --replace            start over with a different scope; the old run
                                   moves to work-archive/
            Running init again with the same scope keeps the existing run.
  next      Do the next step. Runs the scripted work itself and stops when
            subagents are needed, printing which agent to start for which job file.
            Repeat until it prints DONE. It prints WAIT while subagents it handed
            out are still working. --stalled hands those jobs out again (use it
            only when they have finished or failed). --json for machine output.
  status    Show progress.
  report    Rebuild reports/call-insights.html from work/calls.sqlite.
  sql "Q"   Run a read-only SQL query against work/calls.sqlite.
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const int = (value, name, min = 1) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be a whole number of at least ${min}`);
  return n;
};
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US');

function printDispatch(result) {
  const p = result.progress;
  const stageName = { extract: 'extract', themes: 'name themes', review: 'audit and headlines' }[p.stage] ?? p.stage;
  console.log(`NEXT: start ${result.jobs.length} subagent${result.jobs.length === 1 ? '' : 's'} (${fmt(result.pending)} job${result.pending === 1 ? '' : 's'} pending in this stage)`);
  console.log(`Stage: ${stageName}. ${fmt(p.calls_accepted)} of ${fmt(p.calls_in_scope)} calls analyzed, ${fmt(p.calls_failed)} failed.${result.running ? ` ${result.running} earlier job${result.running === 1 ? ' is' : 's are'} still running; leave ${result.running === 1 ? 'it' : 'them'} alone.` : ''}\n`);
  const width = Math.max(...result.jobs.map((j) => j.agent.length));
  for (const job of result.jobs) console.log(`  ${job.agent.padEnd(width)}  ${job.file}`);
  console.log('\nStart one subagent per line above, all in the same message: use the agent named on the line, and make the whole prompt "Job: <file>".');
  console.log('Wait until every one has finished, then run `node analysis/calls.mjs next` again.');
}

function printWait(result) {
  const p = result.progress;
  console.log(`WAIT: ${result.running} subagent${result.running === 1 ? ' is' : 's are'} still working on jobs handed out ${result.minutes} min ago.`);
  console.log(`${fmt(p.calls_accepted)} of ${fmt(p.calls_in_scope)} calls analyzed so far, ${fmt(p.calls_failed)} failed.\n`);
  console.log('Start nothing new. When those subagents have finished, run `node analysis/calls.mjs next` again.');
  console.log('If they have all finished or failed and you still see WAIT, run `node analysis/calls.mjs next --stalled` to hand their jobs out again.');
}

function printDone(result) {
  const c = result.coverage;
  const mb = (result.report_bytes / 1e6).toFixed(1);
  console.log('DONE');
  console.log(`Report:   ${result.report} (${mb} MB, ${result.transcripts_mode === 'full' ? 'full transcripts' : 'transcript excerpts'})`);
  console.log(`Database: ${result.database}`);
  console.log(`Calls:    ${fmt(c.calls_analyzed)} of ${fmt(c.calls_in_scope)} analyzed, ${fmt(c.calls_failed)} failed`);
  console.log(`Insights: ${fmt(c.insights_verified)} of ${fmt(c.insights_total)} kept (quote found in the transcript)`);
  console.log(`Quotes:   ${fmt(c.quotes_matched)} of ${fmt(c.quotes_total)} found word for word`);
  if (c.audit.sampled) console.log(`Audit:    ${fmt(c.audit.insights_checked - c.audit.unsupported_insights)} of ${fmt(c.audit.insights_checked)} insights confirmed on re-reading ${fmt(c.audit.sampled)} calls; ${fmt(c.audit.major_issues)} calls with major issues, ${fmt(c.audit.sentiment_wrong)} sentiment disputes`);
  console.log(`\nPublish ${result.report} as an artifact and share the link.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? 'help';
  if (command === 'help' || args.help) {
    console.log(HELP);
    return;
  }
  const pipeline = await import('./lib/pipeline.mjs');
  if (command === 'init') {
    const { run, existing } = pipeline.initRun({
      limit: int(args.limit, 'limit'),
      callType: typeof args.callType === 'string' ? args.callType : undefined,
      segment: typeof args.segment === 'string' ? args.segment : undefined,
      batchSize: int(args.batchSize, 'batch-size'),
      wave: int(args.wave, 'wave'),
      audit: int(args.audit, 'audit', 0),
      replace: Boolean(args.replace),
      all: Boolean(args.all),
      seed: typeof args.seed === 'string' ? args.seed : undefined,
    });
    if (existing) {
      console.log(`A run for ${run.scope.label} already exists, so nothing changed. Continue it with: node analysis/calls.mjs next`);
      return;
    }
    const jobs = Math.ceil(run.call_ids.length / run.batch_size);
    console.log(`Run created: ${run.scope.label}, ${fmt(jobs)} extraction job${jobs === 1 ? '' : 's'} of up to ${run.batch_size} calls, audit sample of ${run.audit_size}.`);
    console.log('Next: node analysis/calls.mjs next');
    return;
  }
  if (command === 'next') {
    const result = pipeline.next({ stalled: Boolean(args.stalled) });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else if (result.action === 'dispatch') printDispatch(result);
    else if (result.action === 'wait') printWait(result);
    else printDone(result);
    return;
  }
  if (command === 'status') {
    const s = pipeline.status();
    if (args.json) { console.log(JSON.stringify(s, null, 2)); return; }
    console.log(`Scope:    ${s.scope}`);
    console.log(`Calls:    ${fmt(s.calls_accepted)} of ${fmt(s.calls_in_scope)} analyzed, ${fmt(s.calls_failed)} failed`);
    for (const [stage, c] of Object.entries(s.jobs)) console.log(`Jobs:     ${stage.padEnd(10)} ${c.done} done, ${c.pending} pending, ${c.abandoned} abandoned`);
    console.log(`Database: ${s.database ?? 'not built yet'}`);
    console.log(`Report:   ${s.report ?? 'not built yet'}`);
    return;
  }
  if (command === 'report') {
    if (!existsSync(DB_PATH)) throw new Error('No database yet. Run `node analysis/calls.mjs next` until it prints DONE.');
    const { buildReport } = await import('./report/build.mjs');
    const r = buildReport();
    console.log(`Report rebuilt: reports/call-insights.html (${(r.bytes / 1e6).toFixed(1)} MB, ${r.transcriptsMode} transcripts)`);
    return;
  }
  if (command === 'sql') {
    const sql = args._.slice(1).join(' ');
    if (!sql) throw new Error('Pass a query, for example: node analysis/calls.mjs sql "SELECT * FROM theme_summary ORDER BY calls DESC LIMIT 10"');
    if (!existsSync(DB_PATH)) throw new Error('No database yet. Run `node analysis/calls.mjs next` until it prints DONE.');
    const { DatabaseSync } = await import('./lib/sqlite.mjs');
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const rows = db.prepare(sql).all();
    db.close();
    if (!rows.length) { console.log('(no rows)'); return; }
    const shown = rows.slice(0, 200);
    console.table(shown);
    if (rows.length > shown.length) console.log(`${fmt(rows.length - shown.length)} more rows not shown. Add LIMIT or narrow the query.`);
    return;
  }
  throw new Error(`Unknown command "${command}".\n\n${HELP}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
