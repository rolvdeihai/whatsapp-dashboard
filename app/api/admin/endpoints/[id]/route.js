import { getCurrentUser, isAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// PUT endpoint (update)
export async function PUT(request, { params }) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const endpointData = await request.json()

    // Get current endpoint to check if bot_id is being changed
    const { data: currentEndpoint } = await supabaseAdmin
      .from('endpoint_lists')
      .select('bot_id')
      .eq('id', id)
      .single()

    // If bot_id is being updated, validate the new bot exists
    if (endpointData.bot_id && endpointData.bot_id !== currentEndpoint?.bot_id) {
      const { data: bot, error: botError } = await supabaseAdmin
        .from('bots')
        .select('id')
        .eq('id', endpointData.bot_id)
        .single()

      if (botError) {
        return NextResponse.json(
          { error: 'Bot not found' },
          { status: 400 }
        )
      }

      // Check if endpoint has groups assigned
      const { data: groups } = await supabaseAdmin
        .from('user_groups')
        .select('id')
        .eq('endpoint_id', id)

      if (groups && groups.length > 0) {
        return NextResponse.json(
          { error: 'Cannot change bot for endpoint that has groups assigned' },
          { status: 400 }
        )
      }
    }

    const updateData = {
      name: endpointData.name,
      url: endpointData.url,
      max_capacity: endpointData.max_capacity,
      is_active: endpointData.is_active
    }

    // Only update bot_id if provided and different
    if (endpointData.bot_id && endpointData.bot_id !== currentEndpoint?.bot_id) {
      updateData.bot_id = endpointData.bot_id
    }

    const { data: endpoint, error } = await supabaseAdmin
      .from('endpoint_lists')
      .update(updateData)
      .eq('id', id)
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
    console.error('Update endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to update endpoint: ' + error.message },
      { status: 500 }
    )
  }
}

// DELETE endpoint
export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser(request)
    
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // 1. Get the endpoint to be deleted with bot info
    const { data: endpointToDelete, error: endpointError } = await supabaseAdmin
      .from('endpoint_lists')
      .select(`
        *,
        bots (
          wa_account,
          bot_name,
          current_users
        )
      `)
      .eq('id', id)
      .single()

    if (endpointError) throw endpointError

    // 2. Check if there are other endpoints with the same bot_id
    const { data: alternativeEndpoints, error: altError } = await supabaseAdmin
      .from('endpoint_lists')
      .select('*')
      .eq('bot_id', endpointToDelete.bot_id)
      .neq('id', id)
      .eq('is_active', true)

    if (altError) throw altError

    // 3. Check if there are users assigned to this bot
    const { data: usersOnThisBot, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('bot_id', endpointToDelete.bot_id)

    if (usersError) throw usersError

    // 4. Decision logic
    if (alternativeEndpoints && alternativeEndpoints.length > 0) {
      // There are alternative endpoints for this bot
      // Check if there are groups currently assigned to this specific endpoint
      const { data: groupsOnThisEndpoint, error: groupsError } = await supabaseAdmin
        .from('user_groups')
        .select('id')
        .eq('endpoint_id', id)
        .limit(1)

      if (groupsError) throw groupsError

      if (groupsOnThisEndpoint && groupsOnThisEndpoint.length > 0) {
        // There are groups using this endpoint, we need to reassign them
        const firstAlternative = alternativeEndpoints[0]
        
        // Update groups to use alternative endpoint
        await supabaseAdmin
          .from('user_groups')
          .update({ endpoint_id: firstAlternative.id })
          .eq('endpoint_id', id)

        // Get count of groups being moved
        const { count: groupsCount } = await supabaseAdmin
          .from('user_groups')
          .select('*', { count: 'exact', head: true })
          .eq('endpoint_id', id)

        // Update the alternative endpoint's current_load
        await supabaseAdmin
          .from('endpoint_lists')
          .update({ 
            current_load: firstAlternative.current_load + (groupsCount || 0),
            assigned_groups: firstAlternative.assigned_groups + (groupsCount || 0)
          })
          .eq('id', firstAlternative.id)
      }

      // Now delete the endpoint
      const { error: deleteError } = await supabaseAdmin
        .from('endpoint_lists')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      return NextResponse.json({ 
        success: true,
        message: 'Endpoint deleted. Groups reassigned to alternative endpoint.' 
      })

    } else if (usersOnThisBot && usersOnThisBot.length > 0) {
      // No alternative endpoints AND there are users assigned to this bot
      return NextResponse.json(
        { 
          error: 'Cannot delete endpoint. This is the only endpoint for this bot and there are users assigned to it.' 
        },
        { status: 400 }
      )
    } else {
      // No alternative endpoints AND no users on this bot - safe to delete
      const { error: deleteError } = await supabaseAdmin
        .from('endpoint_lists')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      return NextResponse.json({ 
        success: true,
        message: 'Endpoint deleted (no users assigned to this bot).' 
      })
    }
  } catch (error) {
    console.error('Delete endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to delete endpoint: ' + error.message },
      { status: 500 }
    )
  }
}