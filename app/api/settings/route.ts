export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/settings -> returns settings as key-value map
export async function GET() {
  try {
    // Allow any authenticated user to read settings (needed for tax rate, store info, etc)
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await db.setting.findMany({
      orderBy: { key: 'asc' },
    })
    const map = settings.reduce((acc: Record<string, string>, s) => {
      acc[s.key] = s.value
      return acc
    }, {})
    return NextResponse.json({ data: map })
  } catch (error) {
    console.error('GET /api/settings error', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// POST /api/settings -> body: { key: string, value: string } | { entries: Record<string,string> }
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Support bulk upsert via entries object
    if (body && body.entries && typeof body.entries === 'object') {
      const entries = body.entries as Record<string, string>
      const operations = Object.entries(entries).map(([key, value]) =>
        db.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
      await db.$transaction(operations)
      return NextResponse.json({ ok: true })
    }

    // Single key/value
    if (!body || typeof body.key !== 'string') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const key = body.key as string
    const value = String(body.value ?? '')
    await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/settings error', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}


