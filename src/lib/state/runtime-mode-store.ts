/**
 * Runtime Mode Store — 运行时模式切换（展示模式部署下的 Studio 上下文）
 *
 * 问题：APP_MODE 是构建时常量。在 showcase 部署中，所有页面都走展示逻辑。
 * 但用户可以从 /studio 进入「完整版」，此时后续导航到的 /learn/* 和 /settings
 * 应该走 production 逻辑，而非 showcase 逻辑。
 *
 * 方案：sessionStorage 持久化的 studioMode flag。
 *   - 进入 /studio 时置 true
 *   - 回到 / (展示首页) 时置 false
 *   - 同一 tab 内导航保持不变
 *
 * 数据层（listStoredModules 等）通过 useRuntimeMode.getState().studioMode
 * 在非 React 上下文中同步读取。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface RuntimeModeState {
  /** true = 用户从 /studio 进入，应按 production 模式过滤数据 */
  studioMode: boolean
  /** 进入 studio 上下文（/studio 页面 mount 时调用） */
  enterStudio: () => void
  /** 退出 studio 上下文（回到展示首页时调用） */
  exitStudio: () => void
}

export const useRuntimeMode = create<RuntimeModeState>()(
  persist(
    (set) => ({
      studioMode: false,
      enterStudio: () => set({ studioMode: true }),
      exitStudio: () => set({ studioMode: false }),
    }),
    {
      name: 'alc:runtime-mode',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
