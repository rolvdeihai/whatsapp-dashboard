// /lib/auth.js

import { supabase, supabaseAdmin } from './supabase'
import CryptoJS from 'crypto-js'

// Secrets
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'dev-password-secret-change-in-production'
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production'
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-in-production'

// Password hashing
export function hashPassword(password) {
  return CryptoJS.HmacSHA256(password, PASSWORD_SECRET).toString()
}

export function verifyPassword(password, hash) {
  const hashedPassword = hashPassword(password)
  return hashedPassword === hash
}

// Generate JWT token for long-term storage
export function generateJWT(userId, email) {
  const payload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30), // 30 days
    iat: Math.floor(Date.now() / 1000)
  }
  
  // Simple JWT encoding (base64)
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(header)))
  const encodedPayload = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(payload)))
  const signature = CryptoJS.HmacSHA256(encodedHeader + '.' + encodedPayload, JWT_SECRET)
  const encodedSignature = CryptoJS.enc.Base64.stringify(signature)
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`
}

export function verifyJWT(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const signature = CryptoJS.HmacSHA256(encodedHeader + '.' + encodedPayload, JWT_SECRET)
    const calculatedSignature = CryptoJS.enc.Base64.stringify(signature)
    
    if (calculatedSignature !== encodedSignature) return null
    
    const payload = JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(encodedPayload)))
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    
    return payload
  } catch (error) {
    console.error('JWT verification error:', error)
    return null
  }
}

// Generate a simple session token for httpOnly cookie
export function generateSessionToken() {
  const timestamp = Date.now().toString()
  const random = Math.random().toString(36).substring(2)
  return CryptoJS.HmacSHA256(timestamp + random, SESSION_SECRET).toString()
}

// User functions
export async function findUserByEmail(email) {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (error || !data) {
      console.log('User not found:', email)
      return null
    }
    return data
  } catch (error) {
    console.error('Error finding user:', error)
    return null
  }
}

export async function createUser({ email, password, phoneNumber }) {
  try {
    const passwordHash = hashPassword(password)
    
    // Find available bot with lowest usage
    const { data: bots, error: botsError } = await supabaseAdmin
      .from('bots')
      .select('*')
      .eq('is_active', true)
      .order('current_users')
    
    if (botsError) throw botsError

    const availableBot = bots.find(b => b.current_users < b.max_users)
    
    if (!availableBot) {
      throw new Error('No available bots. Please try again later.')
    }

    // Find best endpoint for this bot (lowest load)
    const { data: endpoints, error: endpointsError } = await supabaseAdmin
      .from('endpoint_lists')
      .select('*')
      .eq('bot_id', availableBot.id)
      .eq('is_active', true)
      .order('current_load')
      .limit(1)
    
    if (endpointsError) throw endpointsError
    
    if (!endpoints || endpoints.length === 0) {
      throw new Error('No available endpoints for this bot.')
    }
    
    const bestEndpoint = endpoints[0]

    // Create user with bot and endpoint assignment
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert([
        {
          email,
          password_hash: passwordHash,
          phone_number: phoneNumber,
          plan_id: 'free',
          bot_id: availableBot.id
        }
      ])
      .select()
      .single()

    if (userError) throw userError

    // Update bot user count
    await supabaseAdmin
      .from('bots')
      .update({ current_users: availableBot.current_users + 1 })
      .eq('id', availableBot.id)

    // Update endpoint load
    await supabaseAdmin
      .from('endpoint_lists')
      .update({ current_load: bestEndpoint.current_load + 1 })
      .eq('id', bestEndpoint.id)

    return user
  } catch (error) {
    console.error('Create user error:', error)
    throw error
  }
}

export async function authenticateUser(email, password) {
  const user = await findUserByEmail(email)
  if (!user) {
    console.log('User not found:', email)
    return null
  }

  const isValid = verifyPassword(password, user.password_hash)
  if (!isValid) {
    console.log('Invalid password for:', email)
    return null
  }

  // Remove password hash from response
  const { password_hash, ...userWithoutPassword } = user
  return userWithoutPassword
}

// Session functions - FIXED: removed .catch() chains
export async function createSession(userId, email, rememberMe = true) {
  try {
    const sessionToken = generateSessionToken()
    const expiresAt = new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)) // 30 days or 1 day
    
    // Generate JWT for localStorage
    const jwtToken = generateJWT(userId, email)

    // First, delete any existing sessions for this user
    const { error: deleteError } = await supabaseAdmin
      .from('user_sessions')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Error deleting old sessions:', deleteError)
      // Continue anyway, we'll try to create new session
    }

    // Store new session in database
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('user_sessions')
      .insert([
        {
          user_id: userId,
          session_token: sessionToken,
          expires_at: expiresAt.toISOString()
        }
      ])
      .select()
      .single()

    if (sessionError) {
      console.error('Error storing session:', sessionError)
      throw sessionError
    }
    
    console.log('Session created:', session.id)
    
    return { 
      sessionToken, 
      jwtToken, // For localStorage
      expiresAt,
      rememberMe 
    }
  } catch (error) {
    console.error('Error creating session:', error)
    throw error
  }
}

export async function getCurrentUser(request = null) {
  try {
    let sessionToken = null
    let jwtToken = null
    
    // Try to get JWT token from Authorization header first (for localStorage)
    if (request) {
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        jwtToken = authHeader.substring(7)
      }
      
      // Also check cookies
      const cookieHeader = request.headers.get('cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [name, value] = cookie.trim().split('=')
          acc[name] = decodeURIComponent(value)
          return acc
        }, {})
        sessionToken = cookies.session_token
      }
    } else {
      // Try to get from server component context
      try {
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        sessionToken = cookieStore.get('session_token')?.value
      } catch (e) {
        console.log('Not in server component context')
      }
    }
    
    // Try to authenticate with JWT from localStorage
    if (jwtToken) {
      const payload = verifyJWT(jwtToken)
      if (payload?.userId) {
        // Get user directly by ID
        const { data: user, error: userError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', payload.userId)
          .single()
          
        if (!userError && user) {
          const { password_hash, ...userWithoutPassword } = user
          return userWithoutPassword
        }
      }
    }
    
    // Fall back to session token
    if (sessionToken) {
      // Check session in database
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('user_sessions')
        .select('*')
        .eq('session_token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (!sessionError && session) {
        // Get user
        const { data: user, error: userError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', session.user_id)
          .single()

        if (!userError && user) {
          const { password_hash, ...userWithoutPassword } = user
          return userWithoutPassword
        }
      }
    }
    
    console.log('No valid session found')
    return null
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

export async function logoutUser(request = null) {
  try {
    let sessionToken = null
    let jwtToken = null
    
    if (request) {
      const cookieHeader = request.headers.get('cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [name, value] = cookie.trim().split('=')
          acc[name] = decodeURIComponent(value)
          return acc
        }, {})
        sessionToken = cookies.session_token
      }
      
      // Also get JWT token from header
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        jwtToken = authHeader.substring(7)
      }
    }
    
    if (sessionToken) {
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .delete()
        .eq('session_token', sessionToken)
      
      if (error) {
        console.error('Error deleting session:', error)
      }
    }
    
    return true
  } catch (error) {
    console.error('Error during logout:', error)
    return false
  }
}

// Admin functions
export async function isAdmin(userId) {
  try {
    // For now, we'll check if email contains 'admin'
    // You can implement proper admin check later
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('email, role')
      .eq('id', userId)
      .single()
    
    if (error) return false
    
    return user?.role === 'admin' || user?.email?.includes('admin') || user?.email === 'admin@whatsappbot.id'
  } catch (error) {
    return false
  }
}