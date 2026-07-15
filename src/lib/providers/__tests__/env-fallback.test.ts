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

  describe('openai-compat provider', () => {
    beforeEach(() => {
      vi.stubEnv('DEFAULT_LLM_PROVIDER', 'openai-compat')
      vi.stubEnv('DEFAULT_LLM_MODEL', 'my-model')
      vi.stubEnv('OPENAI_COMPAT_API_KEY', 'sk-oc-test')
    })

    it('returns null when baseURL is not set', () => {
      vi.stubEnv('OPENAI_COMPAT_BASE_URL', undefined)
      expect(getEnvLLMConfig()).toBeNull()
    })

    it('returns null when baseURL is empty string', () => {
      vi.stubEnv('OPENAI_COMPAT_BASE_URL', '')
      expect(getEnvLLMConfig()).toBeNull()
    })

    it('returns config when baseURL is provided', () => {
      vi.stubEnv('OPENAI_COMPAT_BASE_URL', 'https://api.example.com/v1')
      const config = getEnvLLMConfig()
      expect(config).not.toBeNull()
      expect(config!.provider).toBe('openai-compat')
      expect(config!.baseURL).toBe('https://api.example.com/v1')
    })
  })
})
