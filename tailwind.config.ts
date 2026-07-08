import type { Config } from 'tailwindcss'

/**
 * Tailwind CSS 配置
 *
 * 把 globals.css 中的设计 token 暴露成 Tailwind utility：
 *   - 颜色：bg-bg-base / text-fg-primary / border-border-subtle / ...
 *   - 字体：font-serif / font-mono / font-sans / font-display
 *   - 字号：text-xs..text-4xl 全部映射到 --text-* CSS 变量
 *           （让"规范字号"直接生效，组件中已有的 text-lg/xl/2xl/3xl/4xl
 *            会从 Tailwind 默认值切换到规范值，整体字号放大约 30%）
 *   - 字重 / 行高：同步暴露
 *
 * 设计规范源：docs/ui-design/styles.css §1.2-§1.4
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          overlay: 'var(--bg-overlay)',
        },
        fg: {
          primary: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          tertiary: 'var(--fg-tertiary)',
          quaternary: 'var(--fg-quaternary)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          'primary-hover': 'var(--accent-primary-hover)',
          'primary-soft': 'var(--accent-primary-soft)',
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        stage: {
          concept: 'var(--stage-concept)',
          challenge: 'var(--stage-challenge)',
          feynman: 'var(--stage-feynman)',
        },
        state: {
          completed: 'var(--state-completed)',
          active: 'var(--state-active)',
          locked: 'var(--state-locked)',
        },
      },
      fontFamily: {
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
      },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-normal)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-normal)' }],
        md: ['var(--text-md)', { lineHeight: 'var(--leading-normal)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-normal)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-snug)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-snug)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
        '5xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
        '6xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
      },
      fontWeight: {
        regular: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
      },
      letterSpacing: {
        tight: 'var(--tracking-tight)',
        normal: 'var(--tracking-normal)',
        wide: 'var(--tracking-wide)',
        mono: 'var(--tracking-mono)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
