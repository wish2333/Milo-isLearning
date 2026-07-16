'use client'

import { useActionState } from 'react'
import { studioLogin } from './actions'

export default function StudioLoginPage() {
  const [error, formAction, isPending] = useActionState(studioLogin, null)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-base)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '24rem',
          marginInline: 'auto',
          padding: 'var(--space-7) var(--space-6)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 'var(--weight-semibold)',
            lineHeight: 'var(--leading-tight)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--fg-primary)',
            margin: 0,
            marginBottom: 'var(--space-5)',
          }}
        >
          Studio
        </h1>

        <form action={formAction}>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-regular)',
                color: 'var(--fg-secondary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Studio 访问密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              aria-invalid={error !== null ? true : undefined}
              aria-describedby={error !== null ? 'login-error' : undefined}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)',
                color: 'var(--fg-primary)',
                background: 'var(--bg-elevated)',
                border:
                  error !== null ? '1px solid var(--danger)' : '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                outline: 'none',
                transition: 'border-color var(--duration-instant) var(--ease-standard)',
              }}
            />
          </div>

          {error !== null && (
            <p
              id="login-error"
              role="alert"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-sm)',
                color: 'var(--danger)',
                margin: 0,
                marginBottom: 'var(--space-4)',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="alc-button-primary"
            style={{ width: '100%' }}
          >
            {isPending ? '验证中…' : '进入'}
          </button>
        </form>
      </div>
    </div>
  )
}
