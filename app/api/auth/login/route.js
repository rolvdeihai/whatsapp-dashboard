import { authenticateUser, createSession } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { email, password, rememberMe = true } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = await authenticateUser(email, password)
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Create session with remember me option
    const { sessionToken, jwtToken, expiresAt } = await createSession(user.id, user.email, rememberMe)

    // Create response
    const response = NextResponse.json({
      success: true,
      jwtToken: rememberMe ? jwtToken : null, // Only return JWT if remember me is true
      user: {
        id: user.id,
        email: user.email,
        phone_number: user.phone_number,
        bot_name: user.bot_name,
        wa_account: user.wa_account,
        plan_id: user.plan_id
      }
    })

    // Set httpOnly cookie for session
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
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed: ' + error.message },
      { status: 500 }
    )
  }
}