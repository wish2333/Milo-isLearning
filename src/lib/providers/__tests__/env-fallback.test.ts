import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEnvLLMConfig } from '../env-fallback'

describe('getEnvLLMConfig', () => {
  beforeEach(() => {
    vi.stubEnv('DEFAULT_LLM_PROVIDER', 'deepseek')
    vi.stubEnv('DEFAULT_LLM_MODEL', 'deepseek-chat')
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test-123')
    vi.stubEnv('DEEPSEEK_BASE_URL', undefined)
  })

  it('returns LLMConfig when env vars are set', () => {
    const config = getEnvLLMConfig()
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('deepseek')
    expect(config!.apiKey).toBe('sk-test-123')
    expect(config!.model).toBe('deepseek-chat')
  })

  it('returns null when API key is missing', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    const config = getEnvLLMConfig()
    expect(config).toBeNull()
  })

  it('uses default baseURL when not overridden', () => {
    const config = getEnvLLMConfig()
    expect(config!.baseURL).toBe('https://api.deepseek.com')
  })
})
