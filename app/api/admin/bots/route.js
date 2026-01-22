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

    // Get bots with endpoint counts
    const { data: bots, error } = await supabaseAdmin
      .from('bots')
      .select(`
        *,
        endpoint_lists (id)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Format response
    const formattedBots = bots.map(bot => ({
      ...bot,
      endpoint_count: bot.endpoint_lists?.length || 0
    }))

    return NextResponse.json(formattedBots)
  } catch (error) {
    console.error('Bots error:', error)
    return NextResponse.json(
      { error: 'Failed to load bots' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const botData = await request.json()

    const { data: bot, error } = await supabaseAdmin
      .from('bots')
      .insert([{
        wa_account: botData.wa_account,
        bot_name: botData.bot_name,
        max_users: botData.max_users || 5,
        current_users: 0,
        is_active: botData.is_active !== false
      }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(bot)
  } catch (error) {
    console.error('Create bot error:', error)
    return NextResponse.json(
      { error: 'Failed to create bot' },
      { status: 500 }
    )
  }
}