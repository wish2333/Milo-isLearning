import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../settings-store'

describe('settings-store confirmReviewEnabled', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      config: null,
      availableKeys: null,
      confirmReviewEnabled: true,
    })
  })

  it('defaults to true', () => {
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(true)
  })

  it('setConfirmReviewEnabled(false) disables it', () => {
    useSettingsStore.getState().setConfirmReviewEnabled(false)
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(false)
  })

  it('setConfirmReviewEnabled(true) re-enables it', () => {
    useSettingsStore.getState().setConfirmReviewEnabled(false)
    useSettingsStore.getState().setConfirmReviewEnabled(true)
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(true)
  })

  it('resetPreferences() resets confirmReviewEnabled to true', () => {
    useSettingsStore.getState().setConfirmReviewEnabled(false)
    useSettingsStore.getState().resetPreferences()
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(true)
  })

  it('clear() does NOT affect confirmReviewEnabled', () => {
    useSettingsStore.setState({
      config: { provider: 'deepseek', apiKey: 'sk-test', model: 'test', baseURL: '' },
      confirmReviewEnabled: false,
    })
    useSettingsStore.getState().clear()
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(false)
    expect(useSettingsStore.getState().config).toBeNull()
  })
})
