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

    // Get current status
    const { data: endpoint } = await supabaseAdmin
      .from('endpoint_lists')
      .select('is_active')
      .eq('id', id)
      .single()

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint not found' },
        { status: 404 }
      )
    }

    const { data: updated, error } = await supabaseAdmin
      .from('endpoint_lists')
      .update({ is_active: !endpoint.is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Toggle endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to toggle endpoint' },
      { status: 500 }
    )
  }
}