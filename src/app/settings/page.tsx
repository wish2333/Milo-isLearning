/**
 * 设置页（M1 占位）
 * 完整实现见 docs/Technical-Specification.md §6.2 settings-store
 */
export default function SettingsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">设置</h1>
      <p className="text-sm text-neutral-500">
        LLM 供应商配置 UI 待 M3 实现。当前 M1 阶段：通过 scripts/ping.ts 验证 Provider 接入。
      </p>
    </main>
  )
}
