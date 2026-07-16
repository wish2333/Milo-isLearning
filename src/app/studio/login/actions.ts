'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function studioLogin(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const password = formData.get('password')

  if (typeof password !== 'string') {
    return '密码错误'
  }

  const expected = process.env.STUDIO_PASSWORD

  // If no password configured, redirect immediately (shouldn't reach here — middleware auto-passes)
  if (!expected) {
    redirect('/studio')
  }

  if (password !== expected) {
    return '密码错误'
  }

  const cookieStore = await cookies()
  cookieStore.set('studio-auth', 'ok', {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  redirect('/studio')
}
