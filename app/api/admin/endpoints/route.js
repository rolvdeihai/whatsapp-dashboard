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

    // Get endpoints with their associated bot information
    const { data: endpoints, error } = await supabaseAdmin
      .from('endpoint_lists')
      .select(`
        *,
        bots (
          wa_account,
          bot_name,
          max_users,
          current_users,
          is_active
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Format the response to include bot info at the root level for easier access
    const formattedEndpoints = endpoints.map(endpoint => ({
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      assigned_groups: endpoint.assigned_groups,
      max_capacity: endpoint.max_capacity,
      current_load: endpoint.current_load,
      is_active: endpoint.is_active,
      created_at: endpoint.created_at,
      // Bot information - FIXED: use is_active (not bot_active)
      wa_account: endpoint.bots?.wa_account || 'Not assigned',
      bot_name: endpoint.bots?.bot_name || 'Not assigned',
      bot_id: endpoint.bot_id,
      bot_max_users: endpoint.bots?.max_users || 0,
      bot_current_users: endpoint.bots?.current_users || 0,
      bot_active: endpoint.bots?.is_active || false  // ← CHANGED HERE
    }))

    return NextResponse.json(formattedEndpoints || [])
  } catch (error) {
    console.error('Endpoints error:', error)
    return NextResponse.json(
      { error: 'Failed to load endpoints' },
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

    const endpointData = await request.json()

    // Validate that bot_id is provided
    if (!endpointData.bot_id) {
      return NextResponse.json(
        { error: 'Bot ID is required' },
        { status: 400 }
      )
    }

    // Get bot info to verify it exists
    const { data: bot, error: botError } = await supabaseAdmin
      .from('bots')
      .select('wa_account, bot_name')
      .eq('id', endpointData.bot_id)
      .single()

    if (botError) {
      return NextResponse.json(
        { error: 'Bot not found' },
        { status: 400 }
      )
    }

    const { data: endpoint, error } = await supabaseAdmin
      .from('endpoint_lists')
      .insert([{
        bot_id: endpointData.bot_id,
        name: endpointData.name,
        url: endpointData.url,
        max_capacity: endpointData.max_capacity || 100,
        current_load: 0,
        assigned_groups: 0,
        is_active: endpointData.is_active !== false
      }])
      .select(`
        *,
        bots (
          wa_account,
          bot_name
        )
      `)
      .single()

    if (error) throw error

    // Format response
    const formattedEndpoint = {
      ...endpoint,
      wa_account: endpoint.bots?.wa_account,
      bot_name: endpoint.bots?.bot_name
    }

    return NextResponse.json(formattedEndpoint)
  } catch (error) {
    console.error('Create endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to create endpoint' },
      { status: 500 }
    )
  }
}