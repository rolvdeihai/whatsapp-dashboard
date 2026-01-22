import { NextResponse } from 'next/server'
import { getCurrentUser, isAdmin } from '@/lib/auth'

export async function middleware(request) {
  const { pathname } = request.nextUrl
  
  // Public paths (no auth required)
  const publicPaths = [
    '/login', 
    '/signup', 
    '/', 
    '/api/auth/login', 
    '/api/auth/signup',
    '/api/auth/check-token',
    '/api/health',
    '/api/debug'
  ]
  
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // Try to get current user
  let user = null
  try {
    user = await getCurrentUser(request)
  } catch (error) {
    console.error('Middleware auth error:', error)
  }
  
  if (!user) {
    // Check if we have a JWT token in localStorage (client will send via header)
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Allow the request to proceed, the API route will handle it
      return NextResponse.next()
    }
    
    // Redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  // Check admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    try {
      const adminCheck = await isAdmin(user.id)
      if (!adminCheck) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } catch (error) {
      console.error('Admin check error:', error)
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/profile',
    '/api/user/:path*',
    '/api/admin/:path*'
  ]
}