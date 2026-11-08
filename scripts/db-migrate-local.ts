import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const migrationFiles = [
  'migrations/0000_baseline.sql',
  'migrations/0003_runtime_site_settings.sql',
  'migrations/0004_setup_api.sql',
  'migrations/0005_article_language.sql',
];

for (const file of migrationFiles) {
  const sql = readFileSync(resolve(root, file), 'utf8');
  const guarded = [...sql.matchAll(/^-- moss:add-column-if-missing\s+(\w+)\s+(\w+)\s+(.+)$/gim)];
  if (!guarded.length) {
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--local', '--file', file], {
      cwd: root,
      stdio: 'inherit',
    });
    continue;
  }
  for (const [, table, column, definition] of guarded) {
    const output = execFileSync(
      process.execPath,
      [
        wrangler,
        'd1',
        'execute',
        'DB',
        '--local',
        '--json',
        '--command',
        `PRAGMA table_info("${table}")`,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const rows = (JSON.parse(output) as Array<{ results?: Array<{ name: string }> }>).flatMap(
      (result) => result.results ?? [],
    );
    if (!rows.some((row) => row.name === column)) {
      execFileSync(
        process.execPath,
        [
          wrangler,
          'd1',
          'execute',
          'DB',
          '--local',
          '--command',
          `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`,
        ],
        { cwd: root, stdio: 'inherit' },
      );
    }
  }
}
