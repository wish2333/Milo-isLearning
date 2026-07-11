/**
 * 主题库持久化 — LocalStorage CRUD
 *
 * 全量存储在 alc:topic-index 中（Topic[] 完整序列化）。
 * 预计主题数量 < 10，单次读写完整列表。
 */

import { nanoid } from 'nanoid'

import type { Topic } from '@/types/domain'
import { storage } from './local-storage'
import { StorageKeys } from './keys'

/** 读取所有主题（按 createdAt 升序） */
export function listTopics(): Topic[] {
  const topics = storage.get<Topic[]>(StorageKeys.topicIndex)
  if (!topics || !Array.isArray(topics)) return []
  return [...topics].sort((a, b) => a.createdAt - b.createdAt)
}

/** 读取单个主题 */
export function getTopic(topicId: string): Topic | null {
  return listTopics().find((t) => t.id === topicId) ?? null
}

/** 查询题库所属的主题（一对多：最多一个） */
export function getTopicByModuleId(moduleId: string): Topic | null {
  return listTopics().find((t) => t.moduleIds.includes(moduleId)) ?? null
}

/** 创建主题 */
export function createTopic(name: string, description?: string, moduleIds: string[] = []): Topic {
  const topics = listTopics()
  const topic: Topic = {
    id: `topic-${nanoid()}`,
    name: name.trim(),
    description: description?.trim() || undefined,
    moduleIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const updatedTopics = enforceExclusiveMembership(topics, moduleIds, topic.id)
  updatedTopics.push(topic)
  storage.set(StorageKeys.topicIndex, updatedTopics)
  return topic
}

/** 更新主题元数据（名称、描述） */
export function updateTopic(topicId: string, patch: { name?: string; description?: string }): void {
  const topics = listTopics()
  const idx = topics.findIndex((t) => t.id === topicId)
  if (idx === -1) return
  topics[idx] = {
    ...topics[idx]!,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description.trim() || undefined }
      : {}),
    updatedAt: Date.now(),
  }
  storage.set(StorageKeys.topicIndex, topics)
}

/** 删除主题（不删除题库本身） */
export function deleteTopic(topicId: string): void {
  const topics = listTopics().filter((t) => t.id !== topicId)
  storage.set(StorageKeys.topicIndex, topics)
}

/** 将题库加入主题（一对多：自动从其他主题移除） */
export function addModuleToTopic(topicId: string, moduleId: string): void {
  const topics = listTopics()
  const cleaned = enforceExclusiveMembership(topics, [moduleId], topicId)
  const target = cleaned.find((t) => t.id === topicId)
  if (target && !target.moduleIds.includes(moduleId)) {
    target.moduleIds.push(moduleId)
    target.updatedAt = Date.now()
  }
  storage.set(StorageKeys.topicIndex, cleaned)
}

/** 将题库从主题移除 */
export function removeModuleFromTopic(topicId: string, moduleId: string): void {
  const topics = listTopics()
  const target = topics.find((t) => t.id === topicId)
  if (!target) return
  target.moduleIds = target.moduleIds.filter((id) => id !== moduleId)
  target.updatedAt = Date.now()
  storage.set(StorageKeys.topicIndex, topics)
}

/** 调整模块在主题中的顺序（上/下移动一位） */
export function moveModuleInTopic(
  topicId: string,
  moduleId: string,
  direction: 'up' | 'down',
): void {
  const topics = listTopics()
  const target = topics.find((t) => t.id === topicId)
  if (!target) return
  const idx = target.moduleIds.indexOf(moduleId)
  if (idx === -1) return
  const swapWith = direction === 'up' ? idx - 1 : idx + 1
  if (swapWith < 0 || swapWith >= target.moduleIds.length) return
  ;[target.moduleIds[idx], target.moduleIds[swapWith]] = [
    target.moduleIds[swapWith]!,
    target.moduleIds[idx]!,
  ]
  target.updatedAt = Date.now()
  storage.set(StorageKeys.topicIndex, topics)
}

/** 批量设置主题模块顺序 */
export function reorderModulesInTopic(topicId: string, newModuleIds: string[]): void {
  const topics = listTopics()
  const target = topics.find((t) => t.id === topicId)
  if (!target) return
  target.moduleIds = newModuleIds
  target.updatedAt = Date.now()
  storage.set(StorageKeys.topicIndex, topics)
}

function enforceExclusiveMembership(
  topics: Topic[],
  moduleIds: string[],
  keepTopicId: string,
): Topic[] {
  return topics.map((t) => {
    if (t.id === keepTopicId) return t
    const hasOverlap = t.moduleIds.some((id) => moduleIds.includes(id))
    if (!hasOverlap) return t
    return {
      ...t,
      moduleIds: t.moduleIds.filter((id) => !moduleIds.includes(id)),
      updatedAt: Date.now(),
    }
  })
}

/**
 * 级联清理：题库被删除时，从所有主题中移除其引用。
 */
export function cascadeDeleteModule(moduleId: string): void {
  const topics = listTopics()
  let changed = false
  for (const t of topics) {
    if (t.moduleIds.includes(moduleId)) {
      t.moduleIds = t.moduleIds.filter((id) => id !== moduleId)
      t.updatedAt = Date.now()
      changed = true
    }
  }
  if (changed) storage.set(StorageKeys.topicIndex, topics)
}
