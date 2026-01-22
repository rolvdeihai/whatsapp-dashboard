import { getCurrentUser, isAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

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
    const { isAdmin: makeAdmin } = await request.json()

    // Update user role
    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update({ role: makeAdmin ? 'admin' : 'user' })
      .eq('id', id)
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
      .single()

    if (error) throw error

    // Format response
    const formattedUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      phone_number: updatedUser.phone_number,
      plan_id: updatedUser.plan_id,
      role: updatedUser.role,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
      active_groups: updatedUser.active_groups || 0,
      bot_name: updatedUser.bots?.bot_name || 'Not assigned',
      wa_account: updatedUser.bots?.wa_account || 'Not assigned'
    }

    return NextResponse.json(formattedUser)
  } catch (error) {
    console.error('Update admin error:', error)
    return NextResponse.json(
      { error: 'Failed to update admin status' },
      { status: 500 }
    )
  }
}