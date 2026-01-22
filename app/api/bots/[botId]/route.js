// app/api/bots/[botId]/route.js

import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { botId } = params

    // Get bot details
    const { data: bot, error } = await supabaseAdmin
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single()

    if (error) throw error

    return NextResponse.json(bot)
  } catch (error) {
    console.error('Bot details error:', error)
    return NextResponse.json(
      { error: 'Failed to load bot details: ' + error.message },
      { status: 500 }
    )
  }
}