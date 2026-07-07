# React useEffect 完整指南

useEffect 是 React 函数组件中处理副作用的核心 Hook。它的行为比许多人想象的更微妙——尤其是依赖数组和清理函数。

## 基本用法

```typescript
import { useEffect, useState } from 'react'

function Profile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then(setUser)
  }, [userId])

  return <div>{user?.name}</div>
}
```

每次 `userId` 变化时，effect 会重新运行，发起一次新请求。这是 useEffect 最常见的模式：依赖某 prop/state，依赖变化时重跑。

## 清理函数

effect 可以返回一个清理函数，它会在组件卸载或下次 effect 运行前被调用：

```typescript
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/users/${userId}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setUser)
    .catch((e) => {
      if (e.name === 'AbortError') return
      throw e
    })
  return () => controller.abort()
}, [userId])
```

清理函数的关键作用是**防止竞态**。如果 userId 从 `'1'` 变成 `'2'`，第一次请求可能比第二次先返回，从而用旧数据覆盖新数据。清理函数通过 abort 上一次请求消除这种竞态。

## 依赖数组的三种形态

```typescript
// 1. 无数组：每次 render 后都跑（基本不要用）
useEffect(() => {
  console.log('runs after every render')
})

// 2. 空数组：仅 mount 时跑一次
useEffect(() => {
  console.log('runs once on mount')
}, [])

// 3. 非空数组：依赖变化时跑
useEffect(() => {
  console.log('runs when deps change')
}, [userId, refreshToken])
```

绝大多数 effect 应该用第三种形态。第一种几乎一定是 bug，第二种适合"全局事件监听器"等与 props 无关的副作用。

## exhaustive-deps 规则

```typescript
// 错误：依赖不完整
useEffect(() => {
  fetch(`/api/users/${userId}/posts/${postId}`)
}, [userId]) // postId 缺失！

// 正确：
useEffect(() => {
  fetch(`/api/users/${userId}/posts/${postId}`)
}, [userId, postId])
```

启用 eslint 的 `react-hooks/exhaustive-deps` 规则可以静态捕获这类 bug。

## 闭包陷阱

```typescript
const [count, setCount] = useState(0)

useEffect(() => {
  const id = setInterval(() => {
    console.log(count) // 永远是 0！
        setCount(count + 1)
  }, 1000)
  return () => clearInterval(id)
}, [])
```

空依赖让 effect 拿到的是首次 render 时的 count（值 0）。解决方案是用函数式更新：

```typescript
const [count, setCount] = useState(0)

useEffect(() => {
  const id = setInterval(() => {
    setCount((c) => c + 1) // 用上一次的最新值
  }, 1000)
  return () => clearInterval(id)
}, [])
```

或把 count 加入依赖数组（但会让 timer 重置）。
