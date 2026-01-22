import { logoutUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    // Logout from server
    await logoutUser(request)
    
    // Create response
    const response = NextResponse.json({ 
      success: true,
      message: 'Logged out successfully'
    })
    
    // Clear cookie
    response.cookies.delete('session_token')
    
    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}