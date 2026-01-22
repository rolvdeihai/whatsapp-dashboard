// backend/src/routes/webhook.js - UPDATED WITH BETTER ERROR HANDLING
import express from 'express';

const router = express.Router();

// WhatsApp invite link validation function
async function validateWhatsAppInviteLink(inviteUrl) {
  try {
    // Basic validation
    if (!inviteUrl || typeof inviteUrl !== 'string') {
      return { valid: false, error: 'Invalid invite URL format' };
    }
    
    // Clean up URL - remove any whitespace
    inviteUrl = inviteUrl.trim();
    
    // Check if it's a WhatsApp link
    if (!inviteUrl.includes('chat.whatsapp.com')) {
      return { valid: false, error: 'Not a WhatsApp invite link' };
    }
    
    // Ensure it has https:// prefix
    if (!inviteUrl.startsWith('http')) {
      inviteUrl = 'https://' + inviteUrl;
    }
    
    // Parse URL to extract code
    let inviteCode;
    try {
      const url = new URL(inviteUrl);
      const pathParts = url.pathname.split('/').filter(part => part);
      
      if (pathParts.length === 0) {
        return { valid: false, error: 'No invite code found in URL' };
      }
      
      // The invite code is the last part of the path
      inviteCode = pathParts[pathParts.length - 1];
      
      // WhatsApp invite codes are usually 22 characters
      if (!inviteCode || inviteCode.length < 20 || inviteCode.length > 25) {
        return { valid: false, error: `Invalid invite code length: ${inviteCode?.length}` };
      }
      
      // Check for common invalid patterns
      if (inviteCode.includes(' ') || inviteCode.includes('\n') || inviteCode.includes('\t')) {
        return { valid: false, error: 'Invite code contains whitespace' };
      }
      
    } catch (urlError) {
      console.error('URL parsing error:', urlError);
      // Fallback to string splitting
      const urlParts = inviteUrl.split('chat.whatsapp.com/');
      if (urlParts.length < 2) {
        return { valid: false, error: 'Invalid WhatsApp link format' };
      }
      
      inviteCode = urlParts[1].split('?')[0].split('/')[0].trim();
      
      if (!inviteCode || inviteCode.length < 20 || inviteCode.length > 25) {
        return { valid: false, error: `Invalid invite code length (fallback): ${inviteCode?.length}` };
      }
    }
    
    return { 
      valid: true, 
      inviteCode,
      formattedUrl: `https://chat.whatsapp.com/${inviteCode}`
    };
  } catch (error) {
    console.error('Validation error:', error);
    return { valid: false, error: `Validation failed: ${error.message}` };
  }
}

// Debug function to inspect client methods
function inspectClientMethods(client) {
  if (!client) return 'Client is undefined';
  
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter(name => typeof client[name] === 'function')
    .sort();
  
  console.log('Available client methods:', methods.slice(0, 20)); // Show first 20
  console.log('Has acceptInvite?', typeof client.acceptInvite === 'function');
  console.log('Has getChatById?', typeof client.getChatById === 'function');
  
  return {
    hasAcceptInvite: typeof client.acceptInvite === 'function',
    hasGetChatById: typeof client.getChatById === 'function',
    totalMethods: methods.length
  };
}

// Webhook for joining groups
router.post('/join-group', async (req, res) => {
  try {
    const { bot_account, group_invite_url, group_name, group_id } = req.body;
    
    console.log(`🤖 Webhook received - Joining group:`, {
      bot_account,
      group_name,
      group_id,
      invite_url_preview: group_invite_url?.substring(0, 50) + '...'
    });

    if (!req.botManager) {
      return res.status(500).json({ 
        error: 'Bot manager not initialized' 
      });
    }

    const botManager = req.botManager;
    const client = botManager.getClient();
    
    // Debug: Inspect client methods
    const clientInfo = inspectClientMethods(client);
    console.log('Client inspection:', clientInfo);
    
    // Check if bot is authenticated
    if (!client || !client.info) {
      const status = botManager.getBotStatus();
      console.log('Bot status:', status);
      
      return res.status(503).json({ 
        error: 'Bot not connected. Please make sure the bot is running and authenticated.',
        bot_status: status,
        client_available: !!client,
        client_authenticated: !!(client && client.info)
      });
    }

    try {
      console.log(`Attempting to join group with invite: ${group_invite_url}`);
      
      // Validate invite URL format
      const validation = await validateWhatsAppInviteLink(group_invite_url);
      
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid invite URL',
          details: validation.error,
          received_url: group_invite_url
        });
      }
      
      console.log(`Validated invite. Code: ${validation.inviteCode}, URL: ${validation.formattedUrl}`);
      
      // Try different methods to join group
      let chat = null;
      let methodUsed = '';
      
      // Method 1: Try acceptInvite with formatted URL
      try {
        if (typeof client.acceptInvite === 'function') {
          console.log('Trying client.acceptInvite with formatted URL...');
          chat = await client.acceptInvite(validation.formattedUrl);
          methodUsed = 'acceptInvite(formattedUrl)';
        }
      } catch (inviteError) {
        console.log('Method 1 failed:', inviteError.message);
      }
      
      // Method 2: Try acceptInvite with just the code
      if (!chat && typeof client.acceptInvite === 'function') {
        try {
          console.log('Trying client.acceptInvite with code only...');
          chat = await client.acceptInvite(validation.inviteCode);
          methodUsed = 'acceptInvite(code)';
        } catch (inviteError2) {
          console.log('Method 2 failed:', inviteError2.message);
        }
      }
      
      // Method 3: Try alternative method name (some versions use 'acceptGroupInvite')
      if (!chat && typeof client.acceptGroupInvite === 'function') {
        try {
          console.log('Trying client.acceptGroupInvite...');
          chat = await client.acceptGroupInvite(validation.inviteCode);
          methodUsed = 'acceptGroupInvite(code)';
        } catch (inviteError3) {
          console.log('Method 3 failed:', inviteError3.message);
        }
      }
      
      // Method 4: Try using puppeteer method (if available in your setup)
      if (!chat && botManager.joinGroupViaInvite) {
        try {
          console.log('Trying botManager.joinGroupViaInvite...');
          chat = await botManager.joinGroupViaInvite(validation.inviteCode);
          methodUsed = 'botManager.joinGroupViaInvite';
        } catch (inviteError4) {
          console.log('Method 4 failed:', inviteError4.message);
        }
      }
      
      if (chat) {
        console.log(`✅ Bot successfully joined group using ${methodUsed}:`, {
          groupName: chat.name || group_name,
          groupId: chat.id?._serialized || 'unknown',
          participantsCount: chat.participants?.length || 0
        });
        
        // Get the actual WhatsApp group ID
        let actualGroupId = group_id;
        if (chat.id && chat.id._serialized) {
          actualGroupId = chat.id._serialized;
        }
        
        console.log(`Group ID: ${actualGroupId}`);
        
        // Add to active groups
        if (actualGroupId && actualGroupId !== 'unknown') {
          if (!botManager.activeGroups.includes(actualGroupId)) {
            botManager.activeGroups.push(actualGroupId);
            await botManager.saveActiveGroupsToSupabase();
          }
        }
        
        // Return success response
        return res.json({ 
          success: true, 
          group_id: actualGroupId,
          group_name: chat.name || group_name,
          method_used: methodUsed,
          participants_count: chat.participants?.length || 0,
          message: 'Bot successfully joined the group'
        });
      } else {
        console.error('All join methods failed');
        
        // Provide helpful error message based on common issues
        let errorMessage = 'Failed to join group. All methods attempted.';
        let suggestions = [
          '1. Make sure the invite link is still valid (not expired)',
          '2. Ensure the bot has not already joined this group',
          '3. Check if the group is full (maximum 1024 members)',
          '4. Verify the bot is not banned from the group',
          '5. Try generating a new invite link from the group'
        ];
        
        return res.status(400).json({ 
          error: 'Failed to join group',
          details: errorMessage,
          suggestions: suggestions,
          methods_tried: [
            'acceptInvite(formattedUrl)',
            'acceptInvite(code)',
            'acceptGroupInvite',
            'botManager.joinGroupViaInvite'
          ].filter(method => {
            if (method === 'botManager.joinGroupViaInvite') 
              return !!botManager.joinGroupViaInvite;
            if (method.includes('acceptInvite')) 
              return typeof client.acceptInvite === 'function';
            if (method.includes('acceptGroupInvite')) 
              return typeof client.acceptGroupInvite === 'function';
            return true;
          }),
          client_methods_available: clientInfo
        });
      }
    } catch (joinError) {
      console.error('Error joining group via invite:', joinError);
      console.error('Error stack:', joinError.stack);
      
      // Handle specific WhatsApp Web errors
      const errorMsg = joinError.message || String(joinError);
      
      if (errorMsg.includes('t') || errorMsg.includes('t: t')) {
        return res.status(400).json({ 
          error: 'Invalid or expired invite link',
          details: 'The WhatsApp invite link may be invalid, expired, or the bot may not have permission to join.',
          suggestion: 'Please generate a new invite link from the WhatsApp group settings and try again.'
        });
      }
      
      if (errorMsg.includes('invite') || errorMsg.includes('invitation')) {
        return res.status(400).json({ 
          error: 'Invitation error',
          details: 'There was an issue with the invitation. This might be due to group restrictions or invite limitations.',
          suggestion: 'Ask the group admin to check group settings and ensure "Send Messages" is not restricted to "Admins Only".'
        });
      }
      
      if (errorMsg.includes('already') || errorMsg.includes('participant')) {
        return res.status(400).json({ 
          error: 'Already in group',
          details: 'The bot appears to already be a member of this group.',
          suggestion: 'Check if the bot is already in the group. If so, you can send a message to test.'
        });
      }
      
      return res.status(400).json({ 
        error: 'Failed to join group', 
        details: errorMsg,
        suggestion: 'Please check the invite link and try again. If the issue persists, restart the bot.'
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// TEST ENDPOINT: Simulate joining without actual WhatsApp
router.post('/test-join-group', async (req, res) => {
  try {
    const { group_invite_url } = req.body;
    
    console.log('Testing invite URL validation:', group_invite_url);
    
    const validation = await validateWhatsAppInviteLink(group_invite_url);
    
    if (!validation.valid) {
      return res.json({
        success: false,
        error: validation.error,
        input: group_invite_url
      });
    }
    
    return res.json({
      success: true,
      message: 'Invite URL is valid',
      validation: validation,
      next_step: 'This is a test. Real join would attempt with code: ' + validation.inviteCode
    });
    
  } catch (error) {
    console.error('Test error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Webhook for leaving groups (unchanged, but included for completeness)
router.post('/leave-group', async (req, res) => {
  try {
    const { bot_account, group_id } = req.body;
    
    console.log(`Webhook received - Leaving group: ${group_id}`);
    
    if (!req.botManager) {
      return res.status(500).json({ error: 'Bot manager not initialized' });
    }

    const botManager = req.botManager;
    const client = botManager.getClient();
    
    if (!client) {
      return res.status(503).json({ error: 'Bot not connected' });
    }

    try {
      const chat = await client.getChatById(group_id);
      if (chat) {
        await chat.leave();
        console.log(`✅ Bot left group: ${group_id}`);
        
        // Remove from active groups
        const activeGroups = botManager.activeGroups.filter(id => id !== group_id);
        botManager.setActiveGroups(activeGroups);
        await botManager.saveActiveGroupsToSupabase();
        
        return res.json({ success: true, message: 'Bot left the group' });
      } else {
        return res.status(404).json({ error: 'Group not found' });
      }
    } catch (error) {
      console.error('Error leaving group:', error);
      return res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error('Leave webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Other endpoints (connection-status, test, echo) remain the same
router.get('/connection-status', (req, res) => {
  if (!req.botManager) {
    return res.json({
      status: 'bot_manager_not_available',
      message: 'Bot manager not initialized'
    });
  }
  
  const client = req.botManager.getClient();
  const sessionManager = req.botManager.getSessionManager();
  
  const response = {
    status: req.botManager.getBotStatus(),
    client_available: !!client,
    client_info: client && client.info ? {
      phone: `+${client.info.wid.user}`,
      name: client.info.pushname,
      platform: client.info.platform
    } : null,
    qr_generated: sessionManager?.qrGenerated || false,
    qr_code_available: !!sessionManager?.currentQrCode,
    active_groups: req.botManager.activeGroups || [],
    session_retries: sessionManager?.sessionRecovery?.currentRetries || 0,
    timestamp: new Date().toISOString()
  };
  
  console.log('Connection status check:', response);
  res.json(response);
});

// Test endpoint to verify webhook is working
router.get('/test', (req, res) => {
  if (!req.botManager) {
    return res.json({
      status: 'error',
      message: 'Bot manager not available'
    });
  }
  
  const client = req.botManager.getClient();
  const botStatus = req.botManager.getBotStatus();
  
  return res.json({
    status: 'ok',
    bot_connected: !!(client && client.info),
    bot_status: botStatus,
    active_groups: req.botManager.activeGroups || [],
    timestamp: new Date().toISOString()
  });
});

// Echo endpoint for testing
router.post('/echo', (req, res) => {
  console.log('Webhook echo:', req.body);
  res.json({
    success: true,
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

export default router;