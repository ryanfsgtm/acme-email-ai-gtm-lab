// node:sqlite ships with Node 22.13 and later but still prints an ExperimentalWarning on import.
// Silence only that warning so the pipeline output stays readable.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name !== 'ExperimentalWarning') console.warn(warning);
});

let sqlite;
try {
  sqlite = await import('node:sqlite');
} catch {
  console.error(`Error: this needs Node 22.13 or newer, and this computer has Node ${process.versions.node}. Install the current LTS from https://nodejs.org, then run the command again.`);
  process.exit(1);
}

export const { DatabaseSync } = sqlite;
