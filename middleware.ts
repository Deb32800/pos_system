import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// JWT_SECRET is required - Electron auto-generates this, dev must set in .env
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret && process.env.NODE_ENV === 'development') {
    console.warn('⚠️ JWT_SECRET not set - using development fallback')
}
const SECRET_KEY = new TextEncoder().encode(jwtSecret || 'dev-only-secret-not-for-production')

const publicPaths = ['/auth/login', '/auth/signup', '/auth/forgot-password']
const adminPaths = ['/admin']
const staffPaths = ['/staff']

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Allow public paths
    if (publicPaths.some(path => pathname.startsWith(path))) {
        return NextResponse.next()
    }

    // Allow public API paths
    if (pathname.startsWith('/api/auth/')) {
        return NextResponse.next()
    }

    // Get session token
    const token = request.cookies.get('session')?.value

    if (!token) {
        // API routes: Return 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        // Page routes: Redirect to login
        const url = new URL('/auth/login', request.url)
        url.searchParams.set('from', pathname)
        return NextResponse.redirect(url)
    }

    try {
        // Verify token
        const verified = await jwtVerify(token, SECRET_KEY)
        const user = verified.payload.user as any

        // Check role-based access
        if (adminPaths.some(path => pathname.startsWith(path))) {
            if (user.role !== 'ADMIN') {
                // Staff trying to access admin, redirect to staff
                return NextResponse.redirect(new URL('/staff', request.url))
            }
        }

        if (staffPaths.some(path => pathname.startsWith(path))) {
            if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
                // Invalid role
                return NextResponse.redirect(new URL('/auth/login', request.url))
            }
        }

        // For root path, redirect based on role
        if (pathname === '/') {
            const redirectUrl = user.role === 'ADMIN' ? '/admin' : '/staff'
            return NextResponse.redirect(new URL(redirectUrl, request.url))
        }

        return NextResponse.next()
    } catch (error) {
        // API routes: Return 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        // Page routes: Redirect to login
        const response = NextResponse.redirect(new URL('/auth/login', request.url))
        response.cookies.delete('session')
        return response
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
