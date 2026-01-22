// backend/src/managers/SessionManager.js - COMPLETE FIXED VERSION
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client, RemoteAuth } = require('whatsapp-web.js');
import QRCode from 'qrcode';
import { SupabaseRemoteAuthStore } from '../SupabaseRemoteAuthStore.js';
import { supabase } from '../supabaseClient.js';

export default class SessionManager {
  constructor(botManager) {
    this.botManager = botManager;
    this.client = null;
    this.currentQrCode = null;
    this.isInitializing = false;
    this.qrGenerated = false;
    this.currentEndpointId = null;
    this.supabaseStore = null;
    
    // Session recovery settings
    this.sessionRecovery = {
      maxRetries: 3,
      currentRetries: 0,
      retryDelay: 10000,
      backoffFactor: 2,
      maxSessionAge: 6 * 60 * 60 * 1000,
      lastSessionTime: null,
      recoveryInProgress: false
    };
    
    // QR code generation tracking
    this.qrGeneration = {
      lastGenerated: null,
      minInterval: 30000,
      maxAttempts: 3,
      attempts: 0
    };
    
    this.supabaseStore = null;
    this.sessionRetryAttempts = 0;
    this.maxSessionRetries = 3;
    this.isWaitingForSession = false;
    this.forceQR = false;
    
    // Memory monitoring
    this.startMemoryMonitoring();
  }

  // Add to SessionManager.js
  async recoverFromZlibError() {
    console.log('🔄 Zlib corruption detected, clearing corrupted session...');
    
    // Clear the corrupted session
    await this.clearSession();
    
    // Reset counters
    this.sessionRecovery.currentRetries = 0;
    this.sessionRecovery.recoveryInProgress = false;
    
    // Force QR regeneration
    this.forceQR = true;
    this.qrGeneration.attempts = 0;
    
    // Clean up client
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        console.log('Error destroying client:', e.message);
      }
      this.client = null;
      this.botManager.setClient(null);
    }
    
    this.isInitializing = false;
    this.botManager.setIsInitializing(false);
    
    console.log('✅ Session cleared, will require QR scan');
    
    // Wait then initialize fresh
    setTimeout(() => {
      console.log('🔄 Initializing fresh session...');
      this.initializeBot();
    }, 5000);
    
    return true;
  }
  
  // ========== Memory Monitoring Methods ==========
  startMemoryMonitoring() {
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);
  }
  
  checkMemoryUsage() {
    const used = process.memoryUsage();
    const usedMB = Math.round(used.heapUsed / 1024 / 1024);
    const totalMB = Math.round(used.heapTotal / 1024 / 1024);
    
    console.log(`Memory usage: ${usedMB}MB / ${totalMB}MB`);
    
    if (usedMB > 200) {
      console.log('High memory usage detected, performing cleanup...');
      this.performMemoryCleanup();
    }
  }
  
  performMemoryCleanup() {
    console.log('Performing memory cleanup...');
    
    const queueManager = this.botManager.getQueueManager();
    
    if (queueManager.processingQueue.length > queueManager.maxQueueSize) {
      console.log(`Trimming queue from ${queueManager.processingQueue.length} to ${queueManager.maxQueueSize} items`);
      queueManager.processingQueue = queueManager.processingQueue.slice(0, queueManager.maxQueueSize);
    }
    
    if (queueManager.groupCaches.size > queueManager.maxCachedGroups) {
      const entries = Array.from(queueManager.groupCaches.entries());
      const recentEntries = entries.slice(-queueManager.maxCachedGroups);
      queueManager.groupCaches = new Map(recentEntries);
      console.log(`Cleared group caches, keeping ${recentEntries.length} groups`);
    }
    
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }
  }
  
  // ========== Connection Stability Methods ==========
  async initializeWithStability() {
    const now = Date.now();
    
    // Check if we should slow down (too many attempts)
    if (this.connectionStability?.shouldSlowDown) {
      if (now < this.connectionStability.cooldownUntil) {
        const waitTime = Math.ceil((this.connectionStability.cooldownUntil - now) / 1000);
        console.log(`⏳ Cooling down... Too many connection attempts. Waiting ${waitTime} seconds`);
        
        this.botManager.getSocketManager().emitToAllSockets('bot-status', {
          status: 'cooldown',
          waitTime,
          message: 'Too many connection attempts, cooling down...'
        });
        
        return;
      } else {
        this.connectionStability.shouldSlowDown = false;
        this.connectionStability.connectionAttempts = 0;
      }
    }
    
    // Initialize connection stability if not exists
    if (!this.connectionStability) {
      this.connectionStability = {
        lastStableConnection: null,
        connectionAttempts: 0,
        maxConnectionAttempts: 10,
        shouldSlowDown: false,
        cooldownUntil: 0
      };
    }
    
    // Track connection attempts
    this.connectionStability.connectionAttempts++;
    
    if (this.connectionStability.connectionAttempts > this.connectionStability.maxConnectionAttempts) {
      console.log('⚠️ Too many connection attempts, entering cooldown mode');
      this.connectionStability.shouldSlowDown = true;
      this.connectionStability.cooldownUntil = now + (5 * 60 * 1000); // 5 minutes cooldown
      
      this.botManager.getSocketManager().emitToAllSockets('bot-status', {
        status: 'cooldown',
        waitTime: 300,
        message: 'Too many connection attempts. System cooling down for 5 minutes.'
      });
      
      return;
    }
    
    console.log(`🔄 Connection attempt ${this.connectionStability.connectionAttempts}/${this.connectionStability.maxConnectionAttempts}`);
    
    await this.initializeBot();
  }
  
  // ========== Main Bot Initialization ==========
  async initializeBot() {
    if (this.isInitializing) {
      console.log('Bot is already initializing...');
      return;
    }

    if (this.client && this.client.info) {
      console.log('Bot is already connected');
      return;
    }

    this.isInitializing = true;
    this.botManager.setIsInitializing(true);

    try {
      console.log('🔄 Initializing bot with Supabase RemoteAuth...');
    
      // Use the endpoint ID from botManager (set by index.js)
      this.currentEndpointId = this.botManager.currentEndpointId;
      
      console.log(`🔗 Using endpoint ID: ${this.currentEndpointId || 'None'}`);
      
      // Initialize store with endpoint ID (can be null)
      this.supabaseStore = new SupabaseRemoteAuthStore('admin', this.currentEndpointId);
      
      // Check if we should force QR
      if (await this.shouldForceQR()) {
        console.log('🔄 Forcing QR generation...');
        await this.clearSession();
        this.forceQR = true;
      }
      
      // Check if we have a valid session
      const hasValidSession = await this.supabaseStore.sessionExists('RemoteAuth-admin');
      
      if (!hasValidSession) {
        console.log('🔄 No valid session found, will require QR scan');
        this.qrGenerated = false;
      } else {
        console.log('✅ Valid session found in Supabase, attempting to restore...');
        // Check session age if method exists
        if (this.supabaseStore.getSessionAge) {
          const sessionAge = await this.supabaseStore.getSessionAge('RemoteAuth-admin');
          if (sessionAge > this.sessionRecovery.maxSessionAge) {
            console.log(`🔄 Session is too old (${Math.round(sessionAge / (60 * 60 * 1000))} hours), forcing QR`);
            await this.clearSession();
            this.forceQR = true;
          }
        }
      }

      // Initialize client with RemoteAuth
      this.client = new Client({
        authStrategy: new RemoteAuth({
          clientId: 'admin',
          store: this.supabaseStore,
          backupSyncIntervalMs: 60000,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
        takeoverOnConflict: false,
        restartOnAuthFail: true,
      });

      this.setupClientEvents();
      await this.client.initialize();
      
      // Set client in bot manager
      this.botManager.setClient(this.client);
    } catch (error) {
      console.error('❌ Error initializing bot:', error);
      
      if (this.isSessionError(error)) {
        console.log('🔄 Session error detected, attempting recovery...');
        await this.recoverFromSessionError(error);
      } else {
        this.botManager.getSocketManager().emitToAllSockets('bot-error', { 
          error: 'Failed to initialize bot',
          details: error.message
        });
        this.isInitializing = false;
        this.botManager.setIsInitializing(false);
      }
    }
  }

  setCurrentEndpointId(endpointId) {
    console.log(`📌 SessionManager: Setting endpoint ID to ${endpointId}`);
    this.currentEndpointId = endpointId;
    
    if (this.supabaseStore) {
      this.supabaseStore.setEndpointId(endpointId);
    }
  }
  
  // ========== Client Event Setup ==========
  setupClientEvents() {
    if (!this.client) return;

    this.client.on('qr', async (qr) => {
      console.log('🔶 QR code generated - scanning required');
      this.qrGenerated = true;
      this.qrGeneration.attempts++;
      this.qrGeneration.lastGenerated = Date.now();
      
      this.sessionRecovery.currentRetries = 0;
      
      try {
        const qrImage = await QRCode.toDataURL(qr);
        this.currentQrCode = qrImage;
        this.botManager.setCurrentQrCode(qrImage);
        
        this.botManager.getSocketManager().emitToAllSockets('qr-code', { 
          qr: qrImage,
          timestamp: new Date().toISOString()
        });
        
        this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
          status: 'scan_qr',
          retryCount: this.sessionRecovery.currentRetries,
          maxRetries: this.sessionRecovery.maxRetries,
          message: 'Please scan the QR code with WhatsApp'
        });
        
        console.log('✅ QR code generated and sent to frontend');
      } catch (error) {
        console.error('❌ Error generating QR code:', error);
        this.botManager.getSocketManager().emitToAllSockets('bot-error', { 
          error: 'Failed to generate QR code',
          details: error.message
        });
      }
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`📱 Loading Screen: ${percent}% - ${message}`);
      this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
        status: 'loading', 
        percent, 
        message,
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
    });

    this.client.on('authenticated', () => {
      console.log('✅ Bot authenticated with RemoteAuth');
      this.qrGenerated = false;
      this.qrGeneration.attempts = 0;
      
      this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
        status: 'authenticated',
        message: 'Bot authenticated successfully'
      });
      this.forceQR = false;
      this.sessionRecovery.currentRetries = 0;
    });

    this.client.on('ready', async () => {
      console.log('✅ Bot connected successfully with RemoteAuth');
      
      // Lock endpoint when bot is connected
      const endpointManager = this.botManager.getEndpointManager();
      if (endpointManager) {
        endpointManager.setEndpointLock(true);
      }
      
      // Get bot info
      const botInfo = this.client.info;
      console.log('Bot Info:', {
        id: botInfo.wid._serialized,
        phone: `+${botInfo.wid.user}`,
        name: botInfo.pushname,
        platform: botInfo.platform
      });
      
      this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
        status: 'connected',
        message: 'Bot is ready and connected',
        botInfo: {
          phone: `+${botInfo.wid.user}`,
          name: botInfo.pushname
        }
      });
      
      this.isInitializing = false;
      this.botManager.setIsInitializing(false);
      this.isWaitingForSession = false;
      this.sessionRetryAttempts = 0;
      this.forceQR = false;
      this.sessionRecovery.currentRetries = 0;
      this.sessionRecovery.lastSessionTime = Date.now();
      
      this.currentQrCode = null;
      this.botManager.setCurrentQrCode(null);
      
      // Load active groups
      try {
        await this.botManager.loadActiveGroupsFromSupabase();
        console.log('✅ Active groups loaded from Supabase');
      } catch (error) {
        console.error('❌ Error loading active groups:', error);
      }
      
      console.log('✅ Supabase RemoteAuth is automatically handling session persistence');
    });

    this.client.on('remote_session_saved', () => {
      console.log('💾✅ Session saved to remote store - BACKUP SUCCESSFUL');
      
      // FIXED: Safely check for backupSyncIntervalMs
      try {
        const intervalMs = this.client?.options?.authStrategy?.options?.backupSyncIntervalMs;
        if (intervalMs) {
          console.log(`💾 Next backup in ${intervalMs / 1000}s`);
        } else {
          console.log('💾 Next backup: using default interval');
        }
      } catch (error) {
        console.log('💾 Could not determine next backup time');
      }
      
      this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
        status: 'session_saved',
        message: 'Session backup completed'
      });
    });

    this.client.on('remote_session_save_error', (error) => {
      console.error('💾❌ Session backup FAILED:', error.message);
      this.botManager.getSocketManager().emitToAllSockets('bot-error', { 
        error: 'Session backup failed',
        details: error.message 
      });
    });

    this.client.on('auth_failure', (error) => {
      console.error('❌ Bot auth failed:', error);
      this.botManager.getSocketManager().emitToAllSockets('bot-error', { 
        error: 'Authentication failed',
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries,
        details: error.message || 'Unknown auth failure'
      });
      this.isInitializing = false;
      this.botManager.setIsInitializing(false);
      this.qrGenerated = false;
    });

    this.client.on('disconnected', async (reason) => {
      console.log('🔌 Bot disconnected:', reason);
      
      // Unlock endpoint when bot disconnects
      const endpointManager = this.botManager.getEndpointManager();
      if (endpointManager) {
        endpointManager.setEndpointLock(false);
      }
      
      this.botManager.getSocketManager().emitToAllSockets('bot-status', { 
        status: 'disconnected',
        reason: reason,
        message: 'Bot disconnected from WhatsApp'
      });
      
      // Clean up client
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (e) {
          console.log('Error destroying client:', e.message);
        }
        this.client = null;
        this.botManager.setClient(null);
      }
      
      // Reset queue
      const queueManager = this.botManager.getQueueManager();
      if (queueManager) {
        queueManager.resetQueue();
      }
      
      // Schedule reconnection
      setTimeout(async () => {
        console.log('🔄 Attempting to restore session via RemoteAuth...');
        this.initializeWithStability();
      }, 10000);
    });

    this.client.on('message', async (message) => {
      await this.botManager.handleMessage(message);
    });
  }

  // async getEndpointIdFromUrl(endpointUrl) {
  //   try {
  //     // Query endpoint_lists table to find matching endpoint
  //     const { data, error } = await supabase
  //       .from('endpoint_lists')
  //       .select('id')
  //       .eq('url', endpointUrl)
  //       .eq('is_active', true)
  //       .single();

  //     if (error) {
  //       console.error('Error finding endpoint ID:', error);
  //       return null;
  //     }

  //     return data ? data.id : null;
  //   } catch (error) {
  //     console.error('Error in getEndpointIdFromUrl:', error);
  //     return null;
  //   }
  // }

  // When endpoint changes, update the store
  // async onEndpointChange(newEndpoint) {
  //   if (this.supabaseStore && newEndpoint && newEndpoint.url) {
  //     const newEndpointId = await this.getEndpointIdFromUrl(newEndpoint.url);
  //     if (newEndpointId && newEndpointId !== this.currentEndpointId) {
  //       console.log(`🔗 Switching to endpoint: ${newEndpointId}`);
  //       this.currentEndpointId = newEndpointId;
  //       this.supabaseStore.setEndpointId(newEndpointId);
  //     }
  //   }
  // }
  
  // ========== Helper Methods ==========
  async shouldForceQR() {
    if (this.forceQR) {
      return true;
    }
    
    if (this.sessionRecovery.currentRetries >= this.sessionRecovery.maxRetries) {
      console.log(`🔄 Max session retries (${this.sessionRecovery.maxRetries}) exceeded, forcing QR`);
      return true;
    }
    
    if (this.qrGeneration.attempts >= this.qrGeneration.maxAttempts) {
      console.log(`🔄 Too many QR generation attempts (${this.qrGeneration.attempts}), forcing cooldown`);
      return false;
    }
    
    if (this.qrGeneration.lastGenerated) {
      const timeSinceLastQR = Date.now() - this.qrGeneration.lastGenerated;
      if (timeSinceLastQR < this.qrGeneration.minInterval) {
        console.log(`⏳ Too soon to generate QR (${Math.round(timeSinceLastQR/1000)}s ago), waiting...`);
        return false;
      }
    }
    
    return false;
  }
  
  async recoverFromSessionError(error) {
    this.sessionRecovery.currentRetries++;
    console.log(`🔄 Session recovery attempt ${this.sessionRecovery.currentRetries}/${this.sessionRecovery.maxRetries}`);
    
    // Handle Z_DATA_ERROR specifically
    if (error.code === 'Z_DATA_ERROR' || error.message.includes('invalid distance code')) {
      console.log('🔄 Zlib data corruption detected, clearing session...');
      return await this.recoverFromZlibError();
    }
    
    // Clean up existing client
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        console.log('Error destroying client during recovery:', e.message);
      }
      this.client = null;
      this.botManager.setClient(null);
    }
    
    this.isInitializing = false;
    this.botManager.setIsInitializing(false);
    
    // Wait before retrying with backoff
    const delay = this.sessionRecovery.retryDelay * Math.pow(this.sessionRecovery.backoffFactor, this.sessionRecovery.currentRetries - 1);
    console.log(`⏳ Waiting ${delay/1000}s before retry...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry initialization
    await this.initializeBot();
  }
  
  isSessionError(error) {
    const sessionErrors = [
      'Z_DATA_ERROR',
      'invalid code lengths set',
      'ProtocolError',
      'Execution context was destroyed',
      'Session',
      'Authentication',
      'No Page',
      'Target closed',
      'Failed to launch'
    ];
    
    const errorString = JSON.stringify(error).toLowerCase();
    return sessionErrors.some(errorType => 
      errorString.includes(errorType.toLowerCase()) ||
      error.message?.includes(errorType) ||
      error.code?.includes(errorType)
    );
  }
  
  async clearSession() {
    try {
      console.log('🔄 Clearing session from Supabase...');
      
      if (this.supabaseStore) {
        await this.supabaseStore.delete({ session: 'RemoteAuth-admin' });
        console.log('✅ Session cleared from Supabase');
      }
      
      // Also try to clear any local session files
      try {
        const fs = await import('fs');
        const path = await import('path');
        const sessionDir = path.join(process.cwd(), 'auth');
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log('✅ Local session files cleared');
        }
      } catch (fsError) {
        console.log('Note: Could not clear local files:', fsError.message);
      }
      
      this.sessionRecovery.currentRetries = 0;
      this.sessionRecovery.lastSessionTime = null;
      this.qrGeneration.attempts = 0;
      this.qrGenerated = false;
      
    } catch (error) {
      console.error('❌ Error clearing session:', error);
    }
  }
  
  async forceQRGeneration() {
    console.log('🔄 Force QR generation requested...');
    
    // Reset counters
    this.sessionRecovery.currentRetries = this.sessionRecovery.maxRetries;
    this.qrGeneration.attempts = 0;
    this.qrGeneration.lastGenerated = null;
    this.forceQR = true;
    
    await this.clearSession();
    
    // Clean up existing client
    if (this.client) {
      try {
        await this.client.destroy();
        console.log('✅ Client destroyed');
      } catch (error) {
        console.error('Error destroying client:', error);
      }
      this.client = null;
      this.botManager.setClient(null);
    }
    
    this.isInitializing = false;
    this.botManager.setIsInitializing(false);
    this.isWaitingForSession = false;
    
    // Wait then reinitialize
    setTimeout(() => {
      console.log('🔄 Reinitializing bot for QR generation...');
      this.initializeBot();
    }, 2000);
    
    return true;
  }
  
  getBotStatus() {
    if (!this.client) return 'disconnected';
    if (this.client.info) return 'connected';
    if (this.qrGenerated) return 'scan_qr';
    if (this.isInitializing) return 'loading';
    return 'disconnected';
  }
  
  getSessionRecoveryStatus() {
    return {
      currentRetries: this.sessionRecovery.currentRetries,
      maxRetries: this.sessionRecovery.maxRetries,
      lastSessionTime: this.sessionRecovery.lastSessionTime,
      sessionAge: this.sessionRecovery.lastSessionTime ? 
        Date.now() - this.sessionRecovery.lastSessionTime : null
    };
  }
  
  stopBot() {
    console.log('🛑 Stopping bot and cleaning up memory...');
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.botManager.setClient(null);
    }
    
    this.isInitializing = false;
    this.botManager.setIsInitializing(false);
    
    console.log('✅ Bot stopped and memory cleaned up');
  }
}