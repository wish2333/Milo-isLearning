// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ExpandJob } from '@/types/expand-job'

const mode = vi.hoisted(() => ({ production: true }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/runtime/app-mode', () => ({
  get isProductionMode() {
    return mode.production
  },
  get isShowcaseMode() {
    return !mode.production
  },
}))

vi.mock('@/lib/state/settings-store', () => ({
  useSettingsStore: (
    selector: (state: { config: { model: string; provider: string } }) => unknown,
  ) => selector({ config: { model: 'test-model', provider: 'test-provider' } }),
}))

vi.mock('@/lib/state/attempts-store', () => ({
  useAttemptsStore: (selector: (state: { attemptsBySlot: Record<string, never> }) => unknown) =>
    selector({ attemptsBySlot: {} }),
}))

vi.mock('@/lib/runtime/enter-module', () => ({
  enterModule: () => true,
}))

import { ExpandJobView } from '../ExpandJobView'

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function makeJob(status: ExpandJob['status'] = 'running'): ExpandJob {
  return {
    jobId: 'expand-job-1',
    topicId: 'topic-1',
    sourceHash: 'hash-1',
    itemIds: ['item-1', 'item-2'],
    items: [
      {
        itemId: 'item-1',
        moduleIndex: 0,
        topicId: 'topic-1',
        source: '注意力机制',
        sourceHash: 'hash-1',
        status: status === 'failed' ? 'failed' : 'done',
        attempts: status === 'failed' ? 2 : 1,
        ...(status === 'failed'
          ? { error: { code: 'provider_error', message: 'provider 暂时不可用', retryable: true } }
          : { moduleId: 'module-1' }),
        updatedAt: 1,
      },
      {
        itemId: 'item-2',
        moduleIndex: 1,
        topicId: 'topic-1',
        source: '梯度下降',
        sourceHash: 'hash-1',
        status:
          status === 'running'
            ? 'running'
            : status === 'paused' || status === 'failed'
              ? 'queued'
              : status === 'completed'
                ? 'done'
                : status === 'cancelled'
                  ? 'cancelled'
                  : 'queued',
        attempts: status === 'running' ? 1 : 0,
        updatedAt: 1,
      },
    ],
    currentItemId: status === 'running' ? 'item-2' : null,
    status,
    createdAt: 1,
    updatedAt: 1,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ExpandJobView', () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn<FetchImplementation>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mode.production = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn<FetchImplementation>(async (input) => {
      const url = String(input)
      if (url.includes('/api/compile/expand-job?')) return jsonResponse({ job: makeJob() })
      return jsonResponse({ job: makeJob() })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  async function renderJob(status: ExpandJob['status'] = 'running') {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/compile/expand-job?')) return jsonResponse({ job: makeJob(status) })
      if (url.endsWith('/api/compile/expand-job')) {
        const body = JSON.parse(String(init?.body)) as { action: string }
        const nextStatus = body.action === 'pause' ? 'paused' : 'running'
        return jsonResponse({ job: makeJob(nextStatus) })
      }
      if (url.endsWith('/api/compile/cancel')) return jsonResponse({ status: 'cancelled' })
      if (url.endsWith('/api/compile')) return new Response('', { status: 200 })
      return jsonResponse({ job: makeJob(status) })
    })
    await act(async () => {
      root.render(<ExpandJobView jobId="expand-job-1" />)
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  function button(label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )
    if (!(found instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`)
    return found
  }

  it('renders job and item progress states with attempts and source', async () => {
    await renderJob()
    expect(container.textContent).toContain('1/2 个 Module 已完成')
    expect(container.textContent).toContain('已完成')
    expect(container.textContent).toContain('生成中')
    expect(container.textContent).toContain('尝试 1 次')
    expect(container.textContent).toContain('注意力机制')
  })

  it('retries a failed item through the control API', async () => {
    await renderJob('failed')
    expect(container.textContent).toContain('provider 暂时不可用')
    await act(async () => {
      button('重试此项').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const retryCall = fetchMock.mock.calls.find(([input, init]) => {
      return (
        String(input).endsWith('/api/compile/expand-job') && String(init?.body).includes('retry')
      )
    })
    expect(retryCall).toBeDefined()
  })

  it('supports pause, resume and cancel controls', async () => {
    await renderJob()
    await act(async () => {
      button('暂停').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('已暂停')
    await act(async () => {
      button('恢复').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      button('取消任务').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/api/compile/cancel') &&
          String(init?.body).includes('expand-job-1'),
      ),
    ).toBe(true)
  })

  it('does not render the production batch task in showcase mode', async () => {
    mode.production = false
    fetchMock.mockClear()
    await act(async () => {
      root.render(<ExpandJobView jobId="expand-job-1" />)
      await Promise.resolve()
    })
    expect(container.textContent).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
