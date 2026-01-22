// app/api/user/endpoints/route.js

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

    // Get endpoints for the user's bot
    // First, get all endpoints that have the same bot_id
    let query = supabaseAdmin
      .from('endpoint_lists')
      .select('*')
      .eq('is_active', true)
      .order('current_load', { ascending: true })

    if (botId) {
      query = query.eq('bot_id', botId)
    }

    const { data: endpoints, error } = await query

    if (error) throw error

    return NextResponse.json(endpoints || [])
  } catch (error) {
    console.error('Endpoints error:', error)
    return NextResponse.json(
      { error: 'Failed to load endpoints: ' + error.message },
      { status: 500 }
    )
  }
}