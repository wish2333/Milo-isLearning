import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../settings-store'

describe('settings-store confirmReviewEnabled', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      config: null,
      availableKeys: null,
      confirmReviewEnabled: true,
      fsrs: { enabled: false, requestRetention: 0.9, maximumInterval: 365 },
    })
  })

  it('defaults to true', () => {
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(true)
  })

  it('setConfirmReviewEnabled(false) disables it', () => {
    useSettingsStore.getState().setConfirmReviewEnabled(false)
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(false)
  })

  it('defaults FSRS disabled with stable replay parameters', () => {
    expect(useSettingsStore.getState().fsrs).toEqual({
      enabled: false,
      requestRetention: 0.9,
      maximumInterval: 365,
    })
  })

  it('updates FSRS settings and clamps invalid numeric values', () => {
    useSettingsStore.getState().updateFsrsConfig({
      enabled: true,
      requestRetention: 2,
      maximumInterval: 0.4,
    })
    expect(useSettingsStore.getState().fsrs).toEqual({
      enabled: true,
      requestRetention: 0.99,
      maximumInterval: 1,
    })
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
      fsrs: { enabled: true, requestRetention: 0.95, maximumInterval: 100 },
    })
    useSettingsStore.getState().clear()
    expect(useSettingsStore.getState().confirmReviewEnabled).toBe(false)
    expect(useSettingsStore.getState().config).toBeNull()
  })
})
