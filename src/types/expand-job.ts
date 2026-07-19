/**
 * V2.1.0 P1：Topic 批量扩充任务领域模型。
 *
 * Job 保存编排元数据与 item 顺序；每个 item 的可恢复状态同时落在
 * ExpandJobCheckpoint 中，后续 pipeline 可以在 item 边界安全暂停、取消和恢复。
 */

export type ExpandJobStatus =
  'created' | 'running' | 'paused' | 'failed' | 'completed' | 'cancelled'

export type ExpandJobItemStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface ExpandJobError {
  code: string
  message: string
  retryable: boolean
}

export interface ExpandJobItem {
  itemId: string
  moduleIndex: number
  topicId?: string
  source: string
  sourceHash: string
  status: ExpandJobItemStatus
  attempts: number
  moduleId?: string
  error?: ExpandJobError
  updatedAt: number
}

export interface ExpandJobCheckpoint {
  jobId: string
  itemId: string
  status: ExpandJobItemStatus
  sourceHash: string
  attempts: number
  moduleId?: string
  error?: ExpandJobError
  updatedAt: number
}

export interface ExpandJob {
  jobId: string
  topicId?: string
  sourceHash: string
  itemIds: string[]
  items: ExpandJobItem[]
  currentItemId: string | null
  status: ExpandJobStatus
  createdAt: number
  updatedAt: number
}
