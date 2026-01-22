// app/api/endpoints/available/route.js

import { getCurrentUser } from '@/lib/auth'
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

    const { searchParams } = new URL(request.url)
    const botId = searchParams.get('bot_id')

    if (!botId) {
      return NextResponse.json(
        { error: 'Bot ID is required' },
        { status: 400 }
      )
    }

    // Get all active endpoints for this bot, sorted by load
    const { data: endpoints, error } = await supabaseAdmin
      .from('endpoint_lists')
      .select('*')
      .eq('bot_id', botId)
      .eq('is_active', true)
      .order('current_load', { ascending: true })

    if (error) throw error

    return NextResponse.json(endpoints || [])
  } catch (error) {
    console.error('Available endpoints error:', error)
    return NextResponse.json(
      { error: 'Failed to load endpoints: ' + error.message },
      { status: 500 }
    )
  }
}