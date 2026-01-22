// app/api/user/groups/route.js - COMPLETELY FIXED VERSION
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// Helper function to extract group ID from WhatsApp invite URL
function extractGroupId(url) {
  // Extract from WhatsApp invite URL format
  const match = url.match(/chat\.whatsapp\.com\/([^\/\s]+)/)
  return match ? match[1] : url
}

// Webhook function to notify backend
async function sendWebhookToBackend({ endpointUrl, botAccount, groupInviteUrl, groupName, groupId }) {
  try {
    console.log(`Sending webhook to: ${endpointUrl}/webhook/join-group`);
    console.log('Payload:', { botAccount, groupName, groupId });
    
    // First test if the endpoint is reachable
    try {
      const testResponse = await fetch(`${endpointUrl}/webhook/test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Test response status:', testResponse.status);
      
      if (!testResponse.ok) {
        console.warn(`Backend test failed: ${testResponse.status}`);
      } else {
        const testData = await testResponse.json();
        console.log('Backend test response:', testData);
      }
    } catch (testError) {
      console.warn('Backend test connection failed:', testError.message);
    }
    
    // Send the actual webhook
    const webhookUrl = `${endpointUrl}/webhook/join-group`;
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WEBHOOK_SECRET || 'default-secret'}`
      },
      body: JSON.stringify({
        bot_account: botAccount,
        group_invite_url: groupInviteUrl,
        group_name: groupName,
        group_id: groupId,
        timestamp: new Date().toISOString()
      })
    });

    console.log('Webhook response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Webhook failed (${response.status}):`, errorText);
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log('Webhook success:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('Webhook error:', error.message);
    return { 
      success: false, 
      error: error.message,
      details: 'Check if backend is running and bot is connected'
    };
  }
}

export async function POST(request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { groupInviteUrl, groupName } = await request.json()

    // Validate inputs
    if (!groupInviteUrl || !groupName) {
      return NextResponse.json(
        { error: 'Group invite URL and name are required' },
        { status: 400 }
      )
    }

    // Extract group ID from URL
    const groupId = extractGroupId(groupInviteUrl)

    // 1. Get user's basic data (ONLY columns that exist in users table)
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('plan_id, active_groups, bot_id') // FIXED: Only existing columns
      .eq('id', user.id)
      .single()

    if (userError) {
      console.error('Error fetching user data:', userError)
      return NextResponse.json(
        { error: 'User data not found' },
        { status: 404 }
      )
    }

    // 2. Check group limits based on plan
    const groupLimits = {
      free: 3,
      pro: 20,
      enterprise: 100
    }
    
    const maxGroups = groupLimits[userData.plan_id] || groupLimits.free
    
    if (userData.active_groups >= maxGroups) {
      return NextResponse.json({
        error: `Plan limit reached. Max ${maxGroups} groups allowed for ${userData.plan_id} plan.`
      }, { status: 400 })
    }

    // 3. Check if group already exists for this user
    const { data: existingGroup } = await supabaseAdmin
      .from('user_groups')
      .select('id')
      .eq('user_id', user.id)
      .eq('whatsapp_group_id', groupId)
      .single()

    if (existingGroup) {
      return NextResponse.json(
        { error: 'You have already added this group' },
        { status: 400 }
      )
    }

    // 4. Check if bot is already in this group (via other users)
    const { data: botInGroup } = await supabaseAdmin
      .from('user_groups')
      .select('id, user_id')
      .eq('bot_id', userData.bot_id)
      .eq('whatsapp_group_id', groupId)
      .single()

    if (botInGroup) {
      return NextResponse.json({
        error: 'Your bot is already in this group (added by another user)'
      }, { status: 400 })
    }

    // 5. Get bot info for webhook
    const { data: bot, error: botError } = await supabaseAdmin
      .from('bots')
      .select('wa_account, bot_name')
      .eq('id', userData.bot_id)
      .single()

    if (botError) {
      console.error('Error fetching bot data:', botError)
      return NextResponse.json(
        { error: 'Bot data not found' },
        { status: 404 }
      )
    }

    // 6. Find best endpoint for this bot (lowest current_load)
    const { data: endpoints, error: endpointsError } = await supabaseAdmin
      .from('endpoint_lists')
      .select('*')
      .eq('bot_id', userData.bot_id)
      .eq('is_active', true)
      .order('current_load')
      .limit(1)

    if (endpointsError || !endpoints || endpoints.length === 0) {
      console.error('Error finding endpoints:', endpointsError)
      return NextResponse.json(
        { error: 'No available endpoints for your bot' },
        { status: 400 }
      )
    }

    const bestEndpoint = endpoints[0]

    // 7. Create group with bot and endpoint assignment
    const { data: group, error: groupError } = await supabaseAdmin
      .from('user_groups')
      .insert([
        {
          user_id: user.id,
          whatsapp_group_id: groupId,
          whatsapp_group_name: groupName,
          bot_id: userData.bot_id,
          endpoint_id: bestEndpoint.id,
          group_invite_url: groupInviteUrl,
          is_active: true
        }
      ])
      .select(`
        *,
        bots:bot_id (wa_account, bot_name),
        endpoint_lists:endpoint_id (name, url)
      `)
      .single()

    if (groupError) {
      if (groupError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Group already exists' },
          { status: 400 }
        )
      }
      console.error('Error creating group:', groupError)
      return NextResponse.json(
        { error: 'Failed to create group record' },
        { status: 500 }
      )
    }

    // 8. Format group for response
    const formattedGroup = {
      id: group.id,
      user_id: group.user_id,
      whatsapp_group_id: group.whatsapp_group_id,
      whatsapp_group_name: group.whatsapp_group_name,
      bot_wa_account: group.bots?.wa_account,
      bot_name: group.bots?.bot_name,
      endpoint_name: group.endpoint_lists?.name,
      endpoint_url: group.endpoint_lists?.url,
      group_invite_url: group.group_invite_url,
      is_active: group.is_active,
      created_at: group.created_at
    }

    // 9. Update endpoint load count
    await supabaseAdmin
      .from('endpoint_lists')
      .update({ 
        current_load: bestEndpoint.current_load + 1,
        assigned_groups: bestEndpoint.assigned_groups + 1 
      })
      .eq('id', bestEndpoint.id)

    // 10. Update user's active groups count (DO NOT update endpoint_id - it doesn't exist in users table)
    await supabaseAdmin
      .from('users')
      .update({ 
        active_groups: (userData.active_groups || 0) + 1
        // REMOVED: endpoint_id: bestEndpoint.id - this column doesn't exist in users table
      })
      .eq('id', user.id)

    // 11. Send webhook to backend to make bot join the group
    const webhookResult = await sendWebhookToBackend({
      endpointUrl: bestEndpoint.url,
      botAccount: bot.wa_account,
      groupInviteUrl,
      groupName,
      groupId
    })

    if (!webhookResult.success) {
      // If webhook fails, mark group as inactive but still created
      await supabaseAdmin
        .from('user_groups')
        .update({ is_active: false })
        .eq('id', group.id)
      
      console.warn('Webhook failed, group marked as inactive:', webhookResult.error)
      
      return NextResponse.json({
        success: true,
        warning: 'Group created but bot failed to join. Please try again later.',
        group: formattedGroup
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Group added successfully! The bot will join the group shortly.',
      group: formattedGroup
    })
    
  } catch (error) {
    console.error('Add group error:', error)
    return NextResponse.json(
      { error: 'Failed to add group', details: error.message },
      { status: 500 }
    )
  }
}

// GET groups for a user
export async function GET(request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: groups, error } = await supabaseAdmin
      .from('user_groups')
      .select(`
        *,
        bots:bot_id (wa_account, bot_name),
        endpoint_lists:endpoint_id (name, url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching groups:', error)
      return NextResponse.json(
        { error: 'Failed to fetch groups' },
        { status: 500 }
      )
    }

    // Format groups
    const formattedGroups = groups.map(group => ({
      id: group.id,
      user_id: group.user_id,
      whatsapp_group_id: group.whatsapp_group_id,
      whatsapp_group_name: group.whatsapp_group_name,
      bot_wa_account: group.bots?.wa_account,
      bot_name: group.bots?.bot_name,
      endpoint_name: group.endpoint_lists?.name,
      endpoint_url: group.endpoint_lists?.url,
      group_invite_url: group.group_invite_url,
      is_active: group.is_active,
      created_at: group.created_at
    }))

    return NextResponse.json({ groups: formattedGroups })
  } catch (error) {
    console.error('Get groups error:', error)
    return NextResponse.json(
      { error: 'Failed to get groups' },
      { status: 500 }
    )
  }
}