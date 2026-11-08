/** Apply SQL migrations, including pragma guarded additive column directives. */
export async function applyMigrationSql(db: D1Database, sql: string): Promise<void> {
  for (const raw of sql.split('--> statement-breakpoint')) {
    const statement = raw.trim();
    if (!statement) continue;
    const guardedColumn = statement.match(
      /^-- moss:add-column-if-missing\s+(\w+)\s+(\w+)\s+([\s\S]+)$/i,
    );
    if (guardedColumn) {
      const [, table, column, definition] = guardedColumn;
      const { results } = await db.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
      if (!results.some((row) => row.name === column)) {
        await db.prepare(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`).run();
      }
      continue;
    }
    await db.prepare(statement).run();
  }
}
