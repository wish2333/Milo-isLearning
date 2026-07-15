import 'server-only'

import { getDb } from '@/lib/persistence/server/db-singleton'
import { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'
import type { StorageRepository } from '@/lib/persistence/shared/repository'

/**
 * Server 端 repository 单例 -- 每 server 进程一个实例。
 * 仅在 /api/data/* 路由内部使用。
 */

let repo: ServerSQLiteRepository | null = null

export function getServerRepo(): StorageRepository {
  if (!repo) {
    repo = new ServerSQLiteRepository(getDb())
  }
  return repo
}
