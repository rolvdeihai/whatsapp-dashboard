import { getCurrentUser, isAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get all users with their bot information
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        phone_number,
        plan_id,
        role,
        created_at,
        updated_at,
        active_groups,
        bots (
          wa_account,
          bot_name
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Format the response to match expected structure
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      phone_number: user.phone_number,
      plan_id: user.plan_id,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
      active_groups: user.active_groups || 0,
      bot_name: user.bots?.bot_name || 'Not assigned',
      wa_account: user.bots?.wa_account || 'Not assigned'
    }))

    return NextResponse.json(formattedUsers || [])
  } catch (error) {
    console.error('Users error:', error)
    return NextResponse.json(
      { error: 'Failed to load users' },
      { status: 500 }
    )
  }
}