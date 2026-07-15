import 'server-only'

import type { SqliteDatabase } from './db-singleton'

export interface AnalyticsEventRow {
  name: string
  props: Record<string, unknown>
  app_mode: 'showcase' | 'production'
  occurred_at: number
}

/** 批量插入事件。返回插入行数。 */
export function insertEvents(db: SqliteDatabase, events: AnalyticsEventRow[]): number {
  if (events.length === 0) return 0

  const insertSql =
    'INSERT INTO events (name, props_json, app_mode, occurred_at) VALUES (?, ?, ?, ?)'

  db.run('BEGIN')
  let inserted = 0
  try {
    for (const event of events) {
      db.run(insertSql, event.name, JSON.stringify(event.props), event.app_mode, event.occurred_at)
      inserted++
    }
    db.run('COMMIT')
  } catch {
    db.run('ROLLBACK')
    throw new Error('[events-repo] 批量插入事件失败')
  }

  return inserted
}

export interface EventQueryFilter {
  name?: string
  since?: number
  limit?: number
}

/** 查询事件，支持按名称和时间过滤。 */
export function queryEvents(
  db: SqliteDatabase,
  filter: EventQueryFilter = {},
): AnalyticsEventRow[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.name) {
    conditions.push('name = ?')
    params.push(filter.name)
  }
  if (filter.since !== undefined) {
    conditions.push('occurred_at >= ?')
    params.push(filter.since)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitClause = filter.limit ? `LIMIT ?` : ''
  if (filter.limit) params.push(filter.limit)

  const sql =
    `SELECT name, props_json, app_mode, occurred_at FROM events ${where} ORDER BY occurred_at DESC ${limitClause}`.trim()

  const rows = db
    .query<{ name: string; props_json: string; app_mode: string; occurred_at: number }>(sql)
    .all(...params)

  return rows.map((row) => ({
    name: row.name,
    props: JSON.parse(row.props_json) as Record<string, unknown>,
    app_mode: row.app_mode as AnalyticsEventRow['app_mode'],
    occurred_at: row.occurred_at,
  }))
}
