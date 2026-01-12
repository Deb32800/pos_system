export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate type and size
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    // File has .type and .size in Next's web File polyfill
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    // @ts-ignore size exists on File in runtime
    const size = (file as any).size ?? 0
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Use UPLOADS_PATH env var (set by Electron), fallback to public/uploads
    const uploadsDir = process.env.UPLOADS_PATH || path.join(process.cwd(), 'public', 'uploads')
    await fs.mkdir(uploadsDir, { recursive: true })

    const extFromName = path.extname(file.name) || ''
    const extFromType = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : file.type === 'image/jpeg' ? '.jpg' : ''
    const ext = extFromType || extFromName || '.png'
    const filename = `${nanoid(10)}${ext}`
    const filepath = path.join(uploadsDir, filename)
    await fs.writeFile(filepath, buffer)

    // Return path that will work with our static file serving
    const publicPath = `/uploads/${filename}`
    return NextResponse.json({ path: publicPath })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
