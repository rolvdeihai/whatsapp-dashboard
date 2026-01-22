// app/api/user/profile/route.js - FIXED VERSION
import { getCurrentUser, isAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user data WITHOUT endpoint_id (it doesn't exist in users table)
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, phone_number, plan_id, active_groups, bot_id, created_at, updated_at')
      .eq('id', user.id)
      .single()

    if (userError) {
      console.error('Error fetching user data:', userError)
      throw userError
    }

    let botData = null
    // Get bot data separately if user has a bot_id
    if (userData.bot_id) {
      const { data: bot, error: botError } = await supabaseAdmin
        .from('bots')
        .select('wa_account, bot_name')
        .eq('id', userData.bot_id)
        .single()
      
      if (!botError) {
        botData = bot
      }
    }

    // Get user's groups to find their endpoint
    let endpointData = null
    const { data: userGroups } = await supabaseAdmin
      .from('user_groups')
      .select('endpoint_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (userGroups?.endpoint_id) {
      const { data: endpoint, error: endpointError } = await supabaseAdmin
        .from('endpoint_lists')
        .select('name, url')
        .eq('id', userGroups.endpoint_id)
        .single()
      
      if (!endpointError) {
        endpointData = endpoint
      }
    }

    // Get user's groups with bot and endpoint info
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('user_groups')
      .select(`
        *,
        bots:bot_id (wa_account, bot_name),
        endpoint_lists:endpoint_id (name, url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (groupsError) {
      console.error('Error fetching groups:', groupsError)
    }

    // Get active groups
    const { data: activeGroups } = await supabaseAdmin
      .from('user_groups')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    // Check admin status
    const adminStatus = await isAdmin(user.id)

    return NextResponse.json({
      user: {
        id: userData.id,
        email: userData.email,
        phone_number: userData.phone_number,
        plan_id: userData.plan_id,
        active_groups: userData.active_groups || 0,
        bot_id: userData.bot_id,
        bot_name: botData?.bot_name || 'Not assigned',
        wa_account: botData?.wa_account || 'Not assigned',
        endpoint_name: endpointData?.name,
        endpoint_url: endpointData?.url,
        is_admin: adminStatus
      },
      groups: groups || [],
      active_groups: activeGroups?.map(g => g.id) || []
    })
  } catch (error) {
    console.error('Profile error:', error)
    return NextResponse.json(
      { error: 'Failed to load profile: ' + error.message },
      { status: 500 }
    )
  }
}