#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, open, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const packageDir = dirname(fileURLToPath(import.meta.url));
const mascotPath = resolve(packageDir, '../assets/mossbit.txt');

const messages = {
  en: {
    usage: 'Usage: moss <init|dev|build|update|migrate> [--status|--remote] [--lang en|th]',
    unknown: (command) => `Unknown command: ${command}`,
    initTitle: 'Mossplan project setup',
    initHint: 'Run moss dev to start the local development server.',
    dev: 'Starting the local development server…',
    build: 'Building the project…',
    failed: (command) => `${command} failed with exit code`,
    missingProject: 'No package.json found in the current directory.',
    buildSummary: (count, seconds) => `${count} pages built in ${seconds.toFixed(1)}s`,
    devVarsCreated: 'Created .dev.vars with local-only random secrets.',
    update: 'Updating Mossplan packages…',
    migrateStatus: 'Migration status',
    migrateBackup: 'D1 Time Travel bookmark captured before migration:',
    migrationApplied: (id) => `Applied migration ${id}`,
    migrationCurrent: 'Database migrations are up to date.',
    checksumMismatch: (id) => `Migration checksum changed after it was applied: ${id}`,
    remoteRequired: 'Migrations require --remote or --local.',
  },
  th: {
    usage: 'วิธีใช้: moss <init|dev|build> [--lang en|th]',
    unknown: (command) => `ไม่รู้จักคำสั่ง: ${command}`,
    initTitle: 'เริ่มต้นโปรเจกต์ Mossplan',
    initHint: 'เรียก moss dev เพื่อเริ่มเซิร์ฟเวอร์สำหรับพัฒนา',
    dev: 'กำลังเริ่มเซิร์ฟเวอร์สำหรับพัฒนา…',
    build: 'กำลัง Build โปรเจกต์…',
    failed: (command) => `${command} ไม่สำเร็จ รหัสออก`,
    missingProject: 'ไม่พบ package.json ในโฟลเดอร์ปัจจุบัน',
    buildSummary: (count, seconds) => `สร้าง ${count} หน้า ใน ${seconds.toFixed(1)} วินาที`,
    devVarsCreated: 'สร้าง .dev.vars พร้อม secret สุ่มสำหรับใช้ในเครื่องนี้',
    update: 'กำลังอัปเดตแพ็กเกจ Mossplan…',
    migrateStatus: 'สถานะ Migration',
    migrateBackup: 'บันทึก Time Travel bookmark ก่อน Migration:',
    migrationApplied: (id) => `รัน Migration ${id} แล้ว`,
    migrationCurrent: 'Migration เป็นเวอร์ชันล่าสุดแล้ว',
    checksumMismatch: (id) => `Checksum ของ Migration ที่รันแล้วเปลี่ยนไป: ${id}`,
    remoteRequired: 'Migration ต้องระบุ --remote หรือ --local',
  },
};

export function selectLanguage(args, env = process.env) {
  const langIndex = args.indexOf('--lang');
  const inlineLang = args.find((arg) => arg.startsWith('--lang='))?.slice(7);
  const requested = langIndex >= 0 ? args[langIndex + 1] : inlineLang;
  return requested === 'th' || (!requested && env.LANG === 'th_TH') ? 'th' : 'en';
}

export function parseCliArgs(args) {
  const commandArgs = [];
  let language;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--lang') {
      if (index + 1 < args.length) language = args[++index];
    } else if (arg.startsWith('--lang=')) {
      language = arg.slice('--lang='.length);
    } else {
      commandArgs.push(arg);
    }
  }
  return { commandArgs, language };
}

async function countHtmlFiles(directory) {
  let count = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += await countHtmlFiles(path);
    else if (entry.isFile() && entry.name.endsWith('.html')) count += 1;
  }
  return count;
}

async function initializeDevVars(cwd, output, lang) {
  const target = resolve(cwd, '.dev.vars');
  const example = resolve(cwd, '.dev.vars.example');
  try {
    await access(target);
    return;
  } catch {
    // Continue only when the target does not exist.
  }
  let contents;
  try {
    contents = await readFile(example, 'utf8');
  } catch {
    return;
  }
  for (const name of ['BETTER_AUTH_SECRET', 'BUILD_CALLBACK_TOKEN', 'CLICK_HASH_SECRET']) {
    contents = contents.replace(
      new RegExp(`^${name}=.*$`, 'm'),
      `${name}=${randomBytes(32).toString('hex')}`,
    );
  }
  try {
    const file = await open(target, 'wx');
    try {
      await file.writeFile(contents, 'utf8');
    } finally {
      await file.close();
    }
    output.log(messages[lang].devVarsCreated);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

export function colorize(
  text,
  {
    truecolor = process.env.COLORTERM === 'truecolor',
    enabled = Boolean(process.stdout.isTTY),
  } = {},
) {
  if (!enabled) return text;
  const start = truecolor ? '\u001b[38;2;127;176;105m' : '\u001b[32m';
  return `${start}${text}\u001b[39m`;
}

export async function runCommand(
  command,
  {
    cwd = process.cwd(),
    lang = 'en',
    env = process.env,
    output = console,
    execute = spawn,
    color = colorize,
    now = () => performance.now(),
    countPages = countHtmlFiles,
  } = {},
) {
  const copy = messages[lang] ?? messages.en;
  if (!['init', 'dev', 'build', 'update', 'migrate'].includes(command)) {
    output.error(command ? copy.unknown(command) : copy.usage);
    return command ? 2 : 0;
  }

  if (command === 'init') {
    await initializeDevVars(cwd, output, lang);
    output.log(
      color(
        await readFile(mascotPath, 'utf8').then((art) =>
          art.split('\n').slice(4).join('\n').trimEnd(),
        ),
      ),
    );
    output.log(copy.initTitle);
    output.log(copy.initHint);
    return 0;
  }

  if (command === 'migrate') {
    return runMigrate(commandArgs.slice(1), { cwd, lang, output, execute, env });
  }

  try {
    await readFile(resolve(cwd, 'package.json'));
  } catch {
    output.error(copy.missingProject);
    return 1;
  }

  output.log(command === 'dev' ? copy.dev : command === 'build' ? copy.build : copy.update);
  const startedAt = now();
  const child = execute(
    'pnpm',
    command === 'update'
      ? ['update', '@mossplan/core', '@mossplan/cli', '--latest']
      : ['run', command],
    {
      cwd,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      const exitCode = code ?? (signal ? 1 : 0);
      if (exitCode !== 0) output.error(`${copy.failed(command)} ${exitCode}`);
      else if (command === 'build') {
        const elapsedSeconds = (now() - startedAt) / 1000;
        countPages(resolve(cwd, 'dist/client')).then((count) => {
          output.log(`${color('✓')} ${copy.buildSummary(count, elapsedSeconds)}`);
          resolveExit(exitCode);
        }, reject);
        return;
      }
      resolveExit(exitCode);
    });
  });
}

const migrationFiles = ['migrations'];

export async function runMigrate(args, { cwd, lang, output, execute, env }) {
  const copy = messages[lang] ?? messages.en;
  const statusOnly = args.includes('--status');
  const remote = args.includes('--remote');
  const local = args.includes('--local');
  if (remote === local) {
    output.error(copy.remoteRequired);
    return 2;
  }
  const target = remote ? '--remote' : '--local';
  const migrationsDir = resolve(cwd, migrationFiles[0]);
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  const migrations = await Promise.all(
    files.map(async (file) => {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      return {
        id: file.replace(/\.sql$/, ''),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
  const run = (args) =>
    execute('pnpm', ['exec', 'wrangler', ...args], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  const invoke = async (args) => {
    const child = run(args);
    if (typeof child === 'string') return child;
    return new Promise((resolveOutput, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolveOutput(stdout) : reject(new Error(stderr || `wrangler exited ${code}`)),
      );
    });
  };
  const db = 'DB';
  const executeSql = async (sql, json = false) =>
    invoke(['d1', 'execute', db, target, ...(json ? ['--json'] : []), '--command', sql]);
  if (remote && !statusOnly) {
    const bookmark = await invoke(['d1', 'time-travel', 'info', db]);
    output.log(copy.migrateBackup);
    output.log(bookmark.trim());
  }
  if (!statusOnly)
    await executeSql(
      'CREATE TABLE IF NOT EXISTS moss_migrations (id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    );
  const existingOutput = await executeSql(
    'SELECT id, checksum FROM moss_migrations ORDER BY id',
    true,
  );
  const rows = JSON.parse(existingOutput).flatMap((item) => item.results ?? []);
  const applied = new Map(rows.map(({ id, checksum }) => [id, checksum]));
  let pending = 0;
  for (const migration of migrations) {
    const checksum = applied.get(migration.id);
    if (checksum && checksum !== migration.checksum)
      throw new Error(copy.checksumMismatch(migration.id));
    if (checksum) continue;
    pending += 1;
    if (statusOnly) {
      output.log(`${migration.id}: pending`);
      continue;
    }
    for (const raw of migration.sql.split('--> statement-breakpoint')) {
      const sql = raw.trim();
      if (!sql) continue;
      const guarded = sql.match(/^-- moss:add-column-if-missing\s+(\w+)\s+(\w+)\s+([\s\S]+)$/i);
      if (guarded) {
        const [, table, column, definition] = guarded;
        const info = JSON.parse(await executeSql(`PRAGMA table_info("${table}")`, true)).flatMap(
          (item) => item.results ?? [],
        );
        if (!info.some((row) => row.name === column))
          await executeSql(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
      } else await executeSql(sql);
    }
    await executeSql(
      `INSERT INTO moss_migrations (id, checksum, applied_at) VALUES ('${migration.id}', '${migration.checksum}', unixepoch())`,
    );
    output.log(copy.migrationApplied(migration.id));
  }
  if (!pending) output.log(copy.migrationCurrent);
  if (statusOnly) output.log(copy.migrateStatus);
  return 0;
}

export async function main(args = process.argv.slice(2), env = process.env, dependencies = {}) {
  const { commandArgs, language } = parseCliArgs(args);
  const lang = language === 'th' || (!language && env.LANG === 'th_TH') ? 'th' : 'en';
  const command = commandArgs[0];
  if (command === '--help' || command === '-h') {
    console.log(messages[lang].usage);
    return 0;
  }
  try {
    return await runCommand(command, { ...dependencies, lang, env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
