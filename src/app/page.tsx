import Link from 'next/link'

/**
 * 首页 — 引导用户进入学习流程
 */
export default function HomePage() {
  return (
    <main className="alc-page items-center justify-center p-8">
      <section className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-3">
          <p className="alc-label uppercase tracking-wider">Learning path compiler</p>
          <h1 className="text-4xl font-semibold text-fg-primary">AI Learning Compiler</h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-fg-secondary">
            将任何知识编译成一条低摩擦、高掌握度的学习路径：先理解，再练习，最后讲清楚。
          </p>
        </div>

        <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          <Link href="/learn/import" className="alc-button-primary text-sm">
            开始学习
          </Link>
          <Link href="/settings" className="alc-button-secondary text-sm">
            设置
          </Link>
        </div>

        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 text-left">
          {['导入材料', '编译题库', '费曼解释'].map((label, index) => (
            <div key={label} className="alc-card p-3">
              <p className="alc-muted text-xs tabular-nums">0{index + 1}</p>
              <p className="mt-1 text-sm text-fg-primary">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
