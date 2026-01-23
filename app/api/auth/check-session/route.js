// app/api/auth/check-session/route.js
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user) {
      // Session is invalid - clear everything
      const response = NextResponse.json({ 
        valid: false, 
        message: 'Session expired' 
      })
      
      // Clear all auth cookies
      response.cookies.delete('session_token')
      response.cookies.delete('user_id')
      response.cookies.delete('user_email')
      
      return response
    }
    
    return NextResponse.json({ 
      valid: true, 
      user: { 
        id: user.id, 
        email: user.email,
        is_admin: user.is_admin 
      } 
    })
  } catch (error) {
    console.error('Session check error:', error)
    
    const response = NextResponse.json({ 
      valid: false, 
      message: 'Session check failed' 
    })
    
    // Clear all auth cookies on error
    response.cookies.delete('session_token')
    response.cookies.delete('user_id')
    response.cookies.delete('user_email')
    
    return response
  }
}