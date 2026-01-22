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

    // Get total users
    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })

    // Get endpoints stats
    const { data: endpoints } = await supabaseAdmin
      .from('endpoint_lists')
      .select('*')

    // Get total groups
    const { count: totalGroups } = await supabaseAdmin
      .from('user_groups')
      .select('*', { count: 'exact', head: true })

    // Get bot stats
    const { data: bots } = await supabaseAdmin
      .from('bots')
      .select('*')

    // Get recent users with bot info
    const { data: recentUsers } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        phone_number,
        plan_id,
        created_at,
        bots (
          wa_account,
          bot_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    // Format recent users
    const formattedRecentUsers = recentUsers?.map(user => ({
      id: user.id,
      email: user.email,
      phone_number: user.phone_number,
      plan_id: user.plan_id,
      created_at: user.created_at,
      bot_name: user.bots?.bot_name || 'Not assigned',
      wa_account: user.bots?.wa_account || 'Not assigned'
    })) || []

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        totalEndpoints: endpoints?.length || 0,
        activeEndpoints: endpoints?.filter(e => e.is_active).length || 0,
        totalGroups: totalGroups || 0,
        totalBots: bots?.length || 0,
        activeBots: bots?.filter(b => b.is_active).length || 0
      },
      recentUsers: formattedRecentUsers
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load stats' },
      { status: 500 }
    )
  }
}