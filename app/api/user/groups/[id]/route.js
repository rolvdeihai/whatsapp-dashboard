// app/api/user/groups/[id]/route.js
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // 1. Get the group to ensure user owns it and get endpoint info
    const { data: group, error: fetchError } = await supabaseAdmin
      .from('user_groups')
      .select(`
        *,
        endpoint_lists:endpoint_id (url),
        bots:bot_id (wa_account)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !group) {
      return NextResponse.json(
        { error: 'Group not found or access denied' },
        { status: 404 }
      )
    }

    // 2. Send webhook to leave group if active
    if (group.is_active && group.endpoint_lists?.url && group.bots?.wa_account) {
      try {
        await fetch(`${group.endpoint_lists.url}/webhook/leave-group`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.WEBHOOK_SECRET || 'default-secret'}`
          },
          body: JSON.stringify({
            bot_account: group.bots.wa_account,
            group_id: group.whatsapp_group_id
          })
        })
      } catch (webhookError) {
        console.error('Leave webhook failed:', webhookError)
        // Continue with deletion even if webhook fails
      }
    }

    // 3. Delete the group from user_groups
    const { error: deleteError } = await supabaseAdmin
      .from('user_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // Double-check user ownership

    if (deleteError) {
      throw deleteError
    }

    // 4. Update user's active groups count
    await supabaseAdmin
      .from('users')
      .update({ 
        active_groups: supabaseAdmin.raw('GREATEST(active_groups - 1, 0)')
      })
      .eq('id', user.id)

    // 5. Update endpoint load count
    if (group.endpoint_id) {
      await supabaseAdmin
        .from('endpoint_lists')
        .update({ 
          current_load: supabaseAdmin.raw('GREATEST(current_load - 1, 0)'),
          assigned_groups: supabaseAdmin.raw('GREATEST(assigned_groups - 1, 0)')
        })
        .eq('id', group.endpoint_id)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Group removed successfully' 
    })

  } catch (error) {
    console.error('Remove group error:', error)
    return NextResponse.json(
      { error: 'Failed to remove group', details: error.message },
      { status: 500 }
    )
  }
}

// app/api/user/groups/[id]/route.js - PATCH method
export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const { is_active } = await request.json()

    if (typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'is_active must be a boolean' },
        { status: 400 }
      )
    }

    // Verify user owns this group
    const { data: group, error: fetchError } = await supabaseAdmin
      .from('user_groups')
      .select('id, is_active')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      )
    }

    // Skip if already in desired state
    if (group.is_active === is_active) {
      return NextResponse.json({ 
        success: true,
        is_active,
        message: 'Group already in desired state'
      })
    }

    // Update group status
    const { error: updateError } = await supabaseAdmin
      .from('user_groups')
      .update({ is_active })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    // Update user's active groups count
    const adjustment = is_active ? 1 : -1
    await supabaseAdmin
      .from('users')
      .update({ 
        active_groups: supabaseAdmin.raw(`GREATEST(active_groups + ${adjustment}, 0)`)
      })
      .eq('id', user.id)

    return NextResponse.json({ 
      success: true,
      is_active,
      message: `Group ${is_active ? 'activated' : 'deactivated'} successfully`
    })

  } catch (error) {
    console.error('Toggle group error:', error)
    return NextResponse.json(
      { error: 'Failed to update group', details: error.message },
      { status: 500 }
    )
  }
}