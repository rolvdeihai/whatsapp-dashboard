// app/api/auth/auto-login/route.js
import { NextResponse } from 'next/server'
import { verifyJWT, createSession } from '@/lib/auth'

export async function POST(request) {
  try {
    const { token } = await request.json()
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 400 }
      )
    }
    
    // Verify the JWT token
    const payload = verifyJWT(token)
    
    if (!payload) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Token is invalid or expired',
          shouldClear: true // Tell client to clear stored token
        },
        { status: 401 }
      )
    }
    
    // Token is valid - create a new session
    const { sessionToken, jwtToken, expiresAt } = await createSession(
      payload.userId, 
      payload.email, 
      true
    )
    
    const response = NextResponse.json({
      success: true,
      jwtToken: jwtToken, // Return new JWT
      user: {
        id: payload.userId,
        email: payload.email
      }
    })
    
    // Set session cookie
    response.cookies.set({
      name: 'session_token',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })
    
    return response
  } catch (error) {
    console.error('Auto-login error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Auto-login failed',
        shouldClear: true
      },
      { status: 500 }
    )
  }
}