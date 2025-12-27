// backend/src/botManager.js - FIXED REMOTEAUTH VERSION
import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth } = pkg;
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import axios from 'axios';
import { supabase } from './supabaseClient.js';
import { SupabaseRemoteAuthStore } from './SupabaseRemoteAuthStore.js';

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.log('🔶 Unhandled Rejection at:', promise, 'reason:', reason);
  
  if (reason.code === 'ENOENT' && reason.path && reason.path.includes('wwebjs_temp_session_admin')) {
    console.log('🔶 Ignoring RemoteAuth temporary directory cleanup error - this is normal');
    return;
  }
  
  console.error('🔶 Unhandled Rejection (non-critical):', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
  
  if (error.code === 'ENOENT' && error.path && error.path.includes('wwebjs_temp_session_admin')) {
    console.log('🔶 Ignoring RemoteAuth file system error - this is normal');
    return;
  }
  
  console.error('🔴 Critical error,可能需要重启:', error);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define backend endpoints configuration
const BACKEND_ENDPOINTS = [
  {
    name: 'Primary Server',
    url: process.env.API_ENDPOINT_PRIMARY || process.env.API_ENDPOINT,
    priority: 1,
    maxConcurrent: 5,
    enabled: true
  },
  {
    name: 'Secondary Server',
    url: process.env.API_ENDPOINT_SECONDARY,
    priority: 2,
    maxConcurrent: 5,
    enabled: !!process.env.API_ENDPOINT_SECONDARY
  },
  {
    name: 'Backup Server',
    url: process.env.API_ENDPOINT_BACKUP,
    priority: 3,
    maxConcurrent: 3,
    enabled: !!process.env.API_ENDPOINT_BACKUP
  }
].filter(endpoint => endpoint.enabled);

class BotManager {
  constructor() {
    this.client = null;
    this.activeGroups = [];
    this.socketConnections = [];
    this.isInitializing = false;
    this.currentQrCode = null;
    
    // Session recovery settings
    this.sessionRecovery = {
      maxRetries: 5,
      currentRetries: 0,
      retryDelay: 5000,
      backoffFactor: 2,
      maxSessionAge: 24 * 60 * 60 * 1000,
      lastSessionTime: null,
      recoveryInProgress: false
    };
    
    this.supabaseStore = null;

    this.clientConfig = {
      authStrategy: null,
      puppeteer: {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
          '--max_old_space_size=512',
          '--disable-features=AudioServiceOutOfProcess'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      },
      takeoverOnConflict: true,
      restartOnAuthFail: true,
      qrMaxRetries: 5
    };

    // 🚀 Connection stability
    this.connectionStability = {
      lastStableConnection: null,
      connectionAttempts: 0,
      maxConnectionAttempts: 10,
      shouldSlowDown: false,
      cooldownUntil: 0
    };
    
    // Backend endpoints management
    this.backendEndpoints = BACKEND_ENDPOINTS;
    this.activeEndpoint = null;
    this.endpointStatuses = [];
    this.lastEndpointCheck = 0;
    this.endpointCheckInterval = 30000; // 30 seconds
    
    // Paths
    this.authPath = process.env.NODE_ENV === 'production' 
      ? path.join('/tmp/whatsapp_auth')
      : path.join(__dirname, '../auth');
    
    this.cacheDir = process.env.NODE_ENV === 'production'
      ? '/tmp/group_cache'
      : path.join(__dirname, '../group_cache');
    
    this.ensureDirectoryExists(this.authPath);
    this.ensureDirectoryExists(this.cacheDir);

    // Group caching
    this.groupsCache = {
      data: [],
      lastUpdated: 0,
      cacheDuration: 5 * 60 * 1000,
      isUpdating: false
    };
    
    // Global queue
    this.processingQueue = [];
    this.isProcessing = false;
    this.currentProcessingRequest = null;
    this.maxQueueSize = 10;
    
    // Rate limiting
    this.lastCommandTime = 0;
    this.minCommandInterval = 3000;
    
    // In-memory cache
    this.groupCaches = new Map();
    this.maxCachedGroups = 5;
    this.maxCachedMessages = 30;

    // Endpoint failure tracking
    this.endpointFailures = new Map();
    this.maxConsecutiveFailures = 3;
    this.endpointCooldownTime = 60000; // 1 minute

    this.sessionRetryAttempts = 0;
    this.maxSessionRetries = 3;
    this.isWaitingForSession = false;
    this.forceQR = false;

    // Endpoint lock system
    this.endpointLocked = false;
    this.endpointLockStartTime = 0;
    this.endpointLockDuration = 5 * 60 * 1000; // 5 minutes
    this.endpointChangeCount = 0;
    this.maxEndpointChanges = 3;

    // Supabase storage monitoring
    this.supabaseMonitor = {
      lastSizeCheck: 0,
      checkInterval: 10 * 60 * 1000,
      lastPurgeTime: 0,
      minPurgeInterval: 30 * 60 * 1000,
    };

    // Delay startup untuk pastikan semua service ready
    setTimeout(() => {
      this.initializeWithStability();
    }, 3000);

    setTimeout(() => {
      this.checkAndCleanCorruptedSessions();
    }, 15000);

    // Start monitoring
    setTimeout(() => {
      this.startSupabaseMonitoring();
    }, 10000);
    
    this.startMemoryMonitoring();
    this.loadActiveGroupsFromSupabase();
    
    // Start endpoint monitoring
    this.startEndpointMonitoring();
  }

  // 🚀 Initialize with stability checks
  async initializeWithStability() {
    const now = Date.now();
    
    // Check if we should slow down (too many attempts)
    if (this.connectionStability.shouldSlowDown) {
      if (now < this.connectionStability.cooldownUntil) {
        const waitTime = Math.ceil((this.connectionStability.cooldownUntil - now) / 1000);
        console.log(`⏳ Cooling down... Too many connection attempts. Waiting ${waitTime} seconds`);
        
        this.emitToAllSockets('bot-status', {
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
    
    // Track connection attempts
    this.connectionStability.connectionAttempts++;
    
    if (this.connectionStability.connectionAttempts > this.connectionStability.maxConnectionAttempts) {
      console.log('⚠️ Too many connection attempts, entering cooldown mode');
      this.connectionStability.shouldSlowDown = true;
      this.connectionStability.cooldownUntil = now + (5 * 60 * 1000); // 5 minutes cooldown
      
      this.emitToAllSockets('bot-status', {
        status: 'cooldown',
        waitTime: 300,
        message: 'Too many connection attempts. System cooling down for 5 minutes.'
      });
      
      return;
    }
    
    console.log(`🔄 Connection attempt ${this.connectionStability.connectionAttempts}/${this.connectionStability.maxConnectionAttempts}`);
    
    await this.initializeBot();
  }

  // Supabase monitoring
  startSupabaseMonitoring() {
    setInterval(async () => {
      await this.checkSupabaseStorage();
    }, this.supabaseMonitor.checkInterval);
    
    setTimeout(() => {
      this.checkSupabaseStorage();
    }, 60000);
  }

  // Endpoint monitoring system
  startEndpointMonitoring() {
    // Initial check
    setTimeout(() => {
      this.checkAndSelectBestEndpoint();
    }, 5000);
    
    // Periodic checks
    setInterval(() => {
      this.checkAndSelectBestEndpoint();
    }, this.endpointCheckInterval);
  }

  ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
    } catch (error) {
      console.error(`Failed to create directory ${dirPath}:`, error);
    }
  }

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
    
    if (this.processingQueue.length > this.maxQueueSize) {
      console.log(`Trimming queue from ${this.processingQueue.length} to ${this.maxQueueSize} items`);
      this.processingQueue = this.processingQueue.slice(0, this.maxQueueSize);
    }
    
    if (this.groupCaches.size > this.maxCachedGroups) {
      const entries = Array.from(this.groupCaches.entries());
      const recentEntries = entries.slice(-this.maxCachedGroups);
      this.groupCaches = new Map(recentEntries);
      console.log(`Cleared group caches, keeping ${recentEntries.length} groups`);
    }
    
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }
  }

  // Check endpoint status
  async checkEndpointStatus(endpoint) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const startTime = performance.now();
      const response = await fetch(`${endpoint.url}/queue-status`, {
        signal: controller.signal
      });
      const latency = performance.now() - startTime;
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      console.log(`${endpoint.name}: ${data.active}/${data.max_concurrent} active, ${data.queued} queued, ${latency.toFixed(0)}ms latency`);
      
      // Reset failure count on success
      this.endpointFailures.delete(endpoint.name);
      
      return {
        ...endpoint,
        active: data.active,
        queued: data.queued,
        max: data.max_concurrent,
        available: data.active < data.max_concurrent,
        latency: latency,
        success: true,
        lastChecked: Date.now()
      };
    } catch (error) {
      console.log(`${endpoint.name}: Unavailable - ${error.message}`);
      
      const failures = this.endpointFailures.get(endpoint.name) || 0;
      this.endpointFailures.set(endpoint.name, failures + 1);
      
      return {
        ...endpoint,
        available: false,
        error: error.message,
        latency: Number.MAX_SAFE_INTEGER,
        success: false,
        lastChecked: Date.now(),
        consecutiveFailures: failures + 1
      };
    }
  }

  // Get best available endpoint with intelligent selection
  async getBestEndpoint() {
    try {
      // 🔒 Check if endpoint is locked
      if (this.endpointLocked && this.activeEndpoint) {
        const lockAge = Date.now() - this.endpointLockStartTime;
        
        // If lock is still valid, keep current endpoint
        if (lockAge < this.endpointLockDuration) {
          console.log(`🔒 Endpoint locked: ${this.activeEndpoint.name} (lock expires in ${Math.round((this.endpointLockDuration - lockAge) / 1000)}s)`);
          
          const status = await this.checkEndpointStatus(this.activeEndpoint);
          this.endpointStatuses = [status];
          this.emitToAllSockets('endpoint-status', {
            endpoints: this.endpointStatuses,
            activeEndpoint: this.activeEndpoint,
            locked: this.endpointLocked,
            changesRemaining: Math.max(0, this.maxEndpointChanges - this.endpointChangeCount)
          });
          
          return this.activeEndpoint;
        } else {
          console.log('🔓 Endpoint lock expired');
          this.endpointLocked = false;
          this.endpointChangeCount = 0;
        }
      }
      
      // 🔒 If too many endpoint changes recently, lock for stability
      if (this.endpointChangeCount >= this.maxEndpointChanges) {
        console.log('⚠️ Too many endpoint changes, locking for stability');
        this.endpointLocked = true;
        this.endpointLockStartTime = Date.now();
        return this.activeEndpoint;
      }
      
      console.log('Checking endpoint statuses...');
      const statuses = await Promise.all(
        this.backendEndpoints.map(endpoint => this.checkEndpointStatus(endpoint))
      );
      
      this.endpointStatuses = statuses;
      
      const available = statuses.filter(s => {
        const failures = this.endpointFailures.get(s.name) || 0;
        const isInCooldown = s.lastChecked && 
          (Date.now() - s.lastChecked < this.endpointCooldownTime) && 
          failures >= this.maxConsecutiveFailures;
        
        return s.available && !isInCooldown;
      });
      
      // Log status
      statuses.forEach(status => {
        const failures = this.endpointFailures.get(status.name) || 0;
        if (status.available && failures < this.maxConsecutiveFailures) {
          console.log(`✅ ${status.name}: Available (${status.active}/${status.max} active, ${status.latency.toFixed(0)}ms)`);
        } else {
          console.log(`❌ ${status.name}: Unavailable - ${status.error || 'Too many failures'}`);
        }
      });
      
      // Find available endpoints
      if (available.length === 0) {
        console.log('No endpoints available, using fallback to first server');
        const fallback = this.backendEndpoints[0];
        this.activeEndpoint = fallback;
        return fallback;
      }

      // Intelligent selection with stability preference
      const bestEndpoint = available.sort((a, b) => {
        // 1. Prefer current endpoint if available (STABILITY)
        if (this.activeEndpoint) {
          if (a.url === this.activeEndpoint.url && a.available) return -1;
          if (b.url === this.activeEndpoint.url && b.available) return 1;
        }
        
        // 2. Then by health metrics
        if (a.active !== b.active) return a.active - b.active;
        if (a.queued !== b.queued) return a.queued - b.queued;
        if (a.latency !== b.latency) return a.latency - b.latency;
        return a.priority - b.priority;
      })[0];
      
      // Track endpoint changes
      if (!this.activeEndpoint || this.activeEndpoint.url !== bestEndpoint.url) {
        this.endpointChangeCount++;
        console.log(`🔄 Endpoint change #${this.endpointChangeCount}/${this.maxEndpointChanges}: ${bestEndpoint.name}`);
      }
      
      console.log(`🎯 Selected endpoint: ${bestEndpoint.name} (${bestEndpoint.active} active, ${bestEndpoint.queued} queued, ${bestEndpoint.latency.toFixed(0)}ms)`);
      this.activeEndpoint = bestEndpoint;
      
      // Emit status
      this.emitToAllSockets('endpoint-status', { 
        endpoints: statuses,
        activeEndpoint: this.activeEndpoint,
        locked: this.endpointLocked,
        changesRemaining: Math.max(0, this.maxEndpointChanges - this.endpointChangeCount)
      });
      
      return bestEndpoint;
      
    } catch (error) {
      console.error('Endpoint selection error:', error);
      return this.activeEndpoint || this.backendEndpoints[0];
    }
  }

  // Check and select best endpoint
  async checkAndSelectBestEndpoint() {
    try {
      // If bot is connecting or connected, be conservative
      if (this.client && (this.isInitializing || this.client.info)) {
        console.log('Bot is active, using conservative endpoint check...');
        // Only check current endpoint health
        if (this.activeEndpoint) {
          await this.checkEndpointStatus(this.activeEndpoint);
        }
        return;
      }
      
      // Only do full check periodically
      const timeSinceLastCheck = Date.now() - this.lastEndpointCheck;
      if (timeSinceLastCheck < 60000) {
        return;
      }
      
      await this.getBestEndpoint();
      this.lastEndpointCheck = Date.now();
      
    } catch (error) {
      console.error('Error in endpoint check:', error);
    }
  }

  // Make API call with endpoint selection
  // Dalam botManager.js - versi yang diperbaiki
  async makeApiCall(endpointPath, payload, isSearch = false) {
    try {
      const apiUrl = process.env.API_ENDPOINT;
      if (!apiUrl) {
        console.error('API_ENDPOINT environment variable not set');
        throw new Error('API endpoint not configured');
      }
      
      const fullUrl = `${apiUrl}${endpointPath}`;
      console.log(`[API] Calling: ${fullUrl}`);
      
      const response = await axios.post(
        fullUrl,
        payload,
        {
          timeout: 10 * 60 * 1000,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      return response.data;
      
    } catch (error) {
      console.error('API call failed:', error.message);
      throw error;
    }
  }

  // Dalam botManager.js - tambahkan method untuk membersihkan session korup
  async checkAndCleanCorruptedSessions() {
    try {
      if (!this.supabaseStore) {
        this.supabaseStore = new SupabaseRemoteAuthStore('admin');
      }
      
      const sessions = await this.supabaseStore.list();
      console.log(`🔍 Checking ${sessions.length} sessions for corruption...`);
      
      for (const session of sessions) {
        const sessionId = session.id.replace('admin-', '');
        const hasValidSession = await this.supabaseStore.sessionExists(sessionId);
        
        if (!hasValidSession) {
          console.log(`🧹 Deleting corrupted session: ${sessionId}`);
          await this.supabaseStore.delete({ session: sessionId });
        }
      }
    } catch (error) {
      console.error('Error checking for corrupted sessions:', error);
    }
  }

  async getNextAvailableEndpoint(currentEndpoint) {
    const statuses = this.endpointStatuses.length > 0 
      ? this.endpointStatuses 
      : await Promise.all(this.backendEndpoints.map(e => this.checkEndpointStatus(e)));
    
    const available = statuses.filter(s => {
      if (s.name === currentEndpoint.name) return false;
      
      const failures = this.endpointFailures.get(s.name) || 0;
      const isInCooldown = s.lastChecked && 
        (Date.now() - s.lastChecked < this.endpointCooldownTime) && 
        failures >= this.maxConsecutiveFailures;
      
      return s.available && !isInCooldown;
    });
    
    if (available.length === 0) {
      return null;
    }
    
    return available.sort((a, b) => {
      if (a.active !== b.active) return a.active - b.active;
      if (a.queued !== b.queued) return a.queued - b.queued;
      if (a.latency !== b.latency) return a.latency - b.latency;
      return a.priority - b.priority;
    })[0];
  }

  async checkSupabaseStorage() {
    try {
      const now = Date.now();
      if (now - this.supabaseMonitor.lastPurgeTime < this.supabaseMonitor.minPurgeInterval) {
        return;
      }

      if (this.supabaseStore) {
        const stats = await this.supabaseStore.getStorageStats();
        console.log(`📊 Supabase session storage: ${stats.sessionsCount} sessions, ${stats.totalSizeMB}MB`);
        
        if (stats.sessionsCount > 5) {
          const cleaned = await this.supabaseStore.cleanupOldSessions(7 * 24);
          if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old sessions from Supabase`);
            this.supabaseMonitor.lastPurgeTime = Date.now();
          }
        }
      }
    } catch (error) {
      console.error('Error checking Supabase storage:', error);
    }
  }

  async shouldForceQR() {
    // If we already have a client info, don't force QR
    if (this.client && this.client.info) {
      return false;
    }
    
    if (this.sessionRecovery.currentRetries >= this.sessionRecovery.maxRetries) {
      console.log(`🔄 Max session retries (${this.sessionRecovery.maxRetries}) exceeded, forcing QR`);
      return true;
    }
    
    // Check if we have a valid session in Supabase
    if (this.supabaseStore) {
      const hasValidSession = await this.supabaseStore.sessionExists('RemoteAuth-admin');
      if (!hasValidSession) {
        console.log('🔄 No valid session in Supabase, QR will be required');
        this.forceQR = false; // Reset to let normal flow happen
      }
    }
    
    if (this.sessionRecovery.lastSessionTime) {
      const sessionAge = Date.now() - this.sessionRecovery.lastSessionTime;
      if (sessionAge > this.sessionRecovery.maxSessionAge) {
        console.log(`🔄 Session is too old (${Math.round(sessionAge / (60 * 60 * 1000))} hours), forcing QR`);
        return true;
      }
    }
    
    return this.forceQR;
  }

  async recoverFromSessionError(error) {
    this.sessionRecovery.currentRetries++;
    console.log(`🔄 Session recovery attempt ${this.sessionRecovery.currentRetries}/${this.sessionRecovery.maxRetries}`);
    
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        console.log('Error destroying client during recovery:', e);
      }
      this.client = null;
    }
    
    await new Promise(resolve => setTimeout(resolve, this.sessionRecovery.retryDelay));
    
    if (this.sessionRecovery.currentRetries >= this.sessionRecovery.maxRetries) {
      console.log('🔄 Max retries reached, forcing QR generation');
      await this.clearSession();
      this.forceQR = true;
    }
    
    this.isInitializing = false;
    await this.initializeBot();
  }

  isSessionError(error) {
    const sessionErrors = [
      'ProtocolError',
      'Execution context was destroyed',
      'Session',
      'Authentication',
      'No Page',
      'Target closed'
    ];
    
    return sessionErrors.some(errorType => 
      error.name?.includes(errorType) || 
      error.message?.includes(errorType) ||
      error.originalMessage?.includes(errorType)
    );
  }

  async getGroups() {
    try {
      if (!this.client || !this.client.info) {
        console.log('Bot client not ready');
        return [];
      }

      console.time('QuickGroupFetch');
      const chats = await this.client.getChats();
      console.timeEnd('QuickGroupFetch');

      if (!Array.isArray(chats)) return [];

      const groups = [];
      let count = 0;
      const MAX_GROUPS = 50;

      for (const chat of chats) {
        if (count >= MAX_GROUPS) break;
        if (chat?.isGroup) {
          groups.push({
            id: chat.id?._serialized,
            name: chat.name || chat.subject || 'Unknown Group',
            participantCount: chat.participants?.length || 0,
          });
          count++;
        }
      }

      console.log(`Quickly loaded ${groups.length} groups`);
      return groups;

    } catch (error) {
      console.error('Error in quick groups fetch:', error);
      return [];
    }
  }

  async searchGroups(query) {
    try {
      if (!this.client || !this.client.info || !query || query.length < 2) return [];

      const chats = await this.client.getChats();
      const searchTerm = query.toLowerCase();
      const results = [];

      for (const chat of chats) {
        if (chat?.isGroup) {
          const name = (chat.name || chat.subject || '').toLowerCase();
          if (name.includes(searchTerm)) {
            results.push({
              id: chat.id?._serialized,
              name: chat.name || chat.subject || 'Unknown Group',
            });
            if (results.length >= 20) break;
          }
        }
      }

      console.log(`Found ${results.length} groups matching "${query}"`);
      return results;

    } catch (error) {
      console.error('Error searching groups:', error);
      return [];
    }
  }

  async getSavedGroups(groupIds) {
    try {
      if (!this.client || !this.client.info || !Array.isArray(groupIds) || groupIds.length === 0) return [];

      const chats = await this.client.getChats();
      const savedGroups = [];

      for (const groupId of groupIds) {
        const chat = chats.find(c => c?.isGroup && c.id?._serialized === groupId);
        if (chat) {
          savedGroups.push({
            id: groupId,
            name: chat.name || chat.subject || 'Unknown Group',
          });
        }
        if (savedGroups.length % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      console.log(`Loaded ${savedGroups.length} saved groups`);
      return savedGroups;

    } catch (error) {
      console.error('Error loading saved groups:', error);
      return [];
    }
  }

  async refreshGroups() {
    console.log('Manually refreshing groups cache...');
    return await this.getGroups(true);
  }

  async addToQueue(message, chat, prompt, isSearchCommand) {
    const now = Date.now();
    if (now - this.lastCommandTime < this.minCommandInterval) {
      try {
        await message.reply('Please wait a few seconds before sending another command.');
      } catch (error) {
        console.error('Failed to send rate limit message:', error);
      }
      return;
    }

    if (this.processingQueue.length >= this.maxQueueSize) {
      try {
        await message.reply('*Queue is full!*\n\nPlease try again later when the queue has space.');
      } catch (error) {
        console.error('Failed to send queue full message:', error);
      }
      return;
    }

    const request = {
      message,
      chat,
      prompt,
      isSearchCommand,
      timestamp: Date.now(),
      groupId: chat.id._serialized,
      groupName: chat.name
    };

    this.processingQueue.push(request);
    const queuePosition = this.processingQueue.length;
    console.log(`[QUEUE] Added request. Position: ${queuePosition}, Group: ${chat.name}`);

    if (!this.isProcessing) {
      this.processQueue();
    } else {
      const waitMessage = `*Your request has been added to the queue.*\n\n` +
                         `*Position in queue:* ${queuePosition}\n` +
                         `*Estimated wait time:* ${queuePosition * 1} minute(s)\n\n` +
                         `_Only one message can be processed at a time across all groups._`;
      
      try {
        await message.reply(waitMessage);
      } catch (error) {
        console.error(`[QUEUE] Failed to send queue notification:`, error);
      }
    }

    this.lastCommandTime = now;
  }

  async processQueue() {
    if (this.processingQueue.length === 0) {
      this.isProcessing = false;
      this.currentProcessingRequest = null;
      return;
    }

    this.isProcessing = true;
    const request = this.processingQueue[0];
    this.currentProcessingRequest = request;
    
    console.log(`[QUEUE] Processing request. Group: ${request.groupName}, Remaining: ${this.processingQueue.length - 1}`);

    try {
      if (this.processingQueue.length > 1) {
        const startMessage = `*Starting to process your request...*\n\n` +
                            `_Please wait while I generate your response..._`;
        await request.message.reply(startMessage);
      }

      await this.executeCommand(request.message, request.chat, request.prompt, request.isSearchCommand);
      
      this.processingQueue.shift();
      this.currentProcessingRequest = null;
      console.log(`[QUEUE] Request completed. Queue length: ${this.processingQueue.length}`);
      
    } catch (error) {
      console.error(`[QUEUE] Error processing request for group ${request.groupName}:`, error);
      this.processingQueue.shift();
      this.currentProcessingRequest = null;
      
      try {
        await request.message.reply('Sorry, there was an error processing your request. Please try again.');
      } catch (replyError) {
        console.error('Failed to send error notification:', replyError);
      }
    } finally {
      if (this.processingQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      } else {
        this.isProcessing = false;
        this.currentProcessingRequest = null;
      }
    }
  }

  async executeCommand(message, chat, prompt, isSearchCommand) {
    console.log(`[EXECUTE] Processing command: "${prompt.substring(0, 50)}..."`);
    
    try {
      const waMessages = await chat.fetchMessages({ limit: 50 });
      const metadata = await chat.groupMetadata;
      
      // Add null check for metadata
      if (!metadata) {
        console.log(`[EXECUTE] No group metadata available.`);
        await message.reply('Sorry, I cannot access group information. Please try again.');
        return;
      }

      const participantMap = new Map();
      const participantsToProcess = metadata.participants ? metadata.participants.slice(0, 30) : [];
      
      for (const participant of participantsToProcess) {
        try {
          const contact = await this.client.getContactById(participant.id);
          const name = contact?.pushname || 
                      contact?.verifiedName || 
                      contact?.number || 
                      participant.id._serialized.split('@')[0];
          participantMap.set(participant.id._serialized, name);
        } catch (err) {
          participantMap.set(participant.id._serialized, participant.id._serialized.split('@')[0]);
        }
      }

      const formattedMessages = [];
      for (const msg of waMessages) {
        if (!msg.body || msg.fromMe) continue;
        const senderId = msg.author || msg.from;
        const userName = participantMap.get(senderId) || senderId?.split('@')[0] || 'Unknown';
        formattedMessages.push({
          timestamp: new Date(msg.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' '),
          user: userName,
          message: msg.body.substring(0, 300),
          group_name: chat.name || 'Unknown Group',
        });
      }

      formattedMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const currentMessages = formattedMessages.slice(-30);
      const newMessages = this.getNewMessagesFromMemory(chat.id._serialized, currentMessages);

      console.log(`[EXECUTE] Using ${newMessages.length} new messages (from ${currentMessages.length} total) for context`);

      const contact = await message.getContact();
      const phoneNumber = (message.author || message.from).split('@')[0];
      const displayName = contact?.pushname || 
                        contact?.verifiedName || 
                        contact?.number || 
                        phoneNumber;
      const senderFormatted = `${phoneNumber} (${displayName})`;

      let response;
      if (isSearchCommand) {
        response = await this.callExternalAPISearch({
          messages: newMessages,
          prompt: prompt,
          groupName: chat.name || 'Unknown Group',
          sender: senderFormatted,
          timestamp: new Date().toISOString(),
          totalMessageCount: currentMessages.length,
          newMessageCount: newMessages.length
        });
      } else {
        response = await this.callExternalAPI({
          messages: newMessages,
          prompt: prompt,
          groupName: chat.name || 'Unknown Group',
          sender: senderFormatted,
          timestamp: new Date().toISOString(),
          totalMessageCount: currentMessages.length,
          newMessageCount: newMessages.length
        });
      }
      
      console.log(`[EXECUTE] API response received`);
      await message.reply(response);
      console.log(`[EXECUTE] Reply sent successfully.`);

    } catch (error) {
      console.error(`[EXECUTE] Error in executeCommand:`, error);
      try {
        await message.reply('Sorry, there was an error processing your request. Please try again.');
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
      }
    }
  }

  getNewMessagesFromMemory(groupId, currentMessages) {
    const cachedMessages = this.groupCaches.get(groupId) || [];
    
    if (cachedMessages.length === 0) {
      const messagesToCache = currentMessages.slice(-this.maxCachedMessages);
      this.groupCaches.set(groupId, messagesToCache);
      return currentMessages;
    }

    const cachedMessageMap = new Map();
    cachedMessages.forEach(msg => {
      const key = `${msg.timestamp}_${msg.user}_${msg.message.substring(0, 50)}`;
      cachedMessageMap.set(key, true);
    });

    const newMessages = currentMessages.filter(msg => {
      const key = `${msg.timestamp}_${msg.user}_${msg.message.substring(0, 50)}`;
      return !cachedMessageMap.has(key);
    });

    const updatedCache = currentMessages.slice(-this.maxCachedMessages);
    this.groupCaches.set(groupId, updatedCache);

    console.log(`[CACHE] Group ${groupId}: ${cachedMessages.length} cached, ${currentMessages.length} current, ${newMessages.length} new messages`);
    return newMessages;
  }

  getBotStatus() {
    if (this.client && this.client.info) return 'connected';
    return 'disconnected';
  }

  async getSupabaseStatus() {
    try {
      if (!this.supabaseStore) {
        return {
          sessionsCount: 0,
          totalSizeMB: 0,
          lastCheck: new Date().toISOString(),
          status: 'store_not_initialized',
          storageType: 'Supabase PostgreSQL'
        };
      }

      const stats = await this.supabaseStore.getStorageStats();
      
      return {
        sessionsCount: stats.sessionsCount,
        totalSizeMB: stats.totalSizeMB,
        lastCheck: stats.lastUpdated,
        status: 'connected',
        storageType: 'Supabase PostgreSQL'
      };
    } catch (error) {
      return {
        sessionsCount: 0,
        totalSizeMB: 0,
        lastCheck: new Date().toISOString(),
        status: 'error',
        error: error.message,
        storageType: 'Supabase PostgreSQL'
      };
    }
  }

  async saveActiveGroupsToSupabase() {
    try {
      const { error } = await supabase
        .from('bot_settings')
        .upsert({
          key: 'active_groups',
          value: this.activeGroups,
        }, {
          onConflict: 'key'
        });

      if (error) throw error;

      console.log('Active groups saved to Supabase:', this.activeGroups);
    } catch (err) {
      console.error('Failed to save active groups to Supabase:', err);
    }
  }

  async loadActiveGroupsFromSupabase() {
    try {
      const { data, error } = await supabase
        .from('bot_settings')
        .select('value')
        .eq('key', 'active_groups')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading active groups from Supabase:', error);
        return;
      }

      if (data && data.value) {
        this.activeGroups = Array.isArray(data.value) ? data.value : [];
        console.log('Active groups loaded from Supabase:', this.activeGroups);
      } else {
        this.activeGroups = [];
        console.log('No active groups found in Supabase, starting empty');
      }

      this.emitToAllSockets('active-groups-updated', { groups: this.activeGroups });
    } catch (err) {
      console.error('Failed to load active groups from Supabase:', err);
      this.activeGroups = [];
    }
  }

  // In botManager.js - fix for initializeBot() method
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
    
    try {
      console.log('🔄 Initializing bot with Supabase RemoteAuth...');
      
      this.supabaseStore = new SupabaseRemoteAuthStore('admin');
      
      // 🚀 NEW: Check if we have a valid session BEFORE initializing
      const hasValidSession = await this.supabaseStore.sessionExists('RemoteAuth-admin');
      
      if (!hasValidSession) {
        console.log('🔄 No valid session found, will require QR scan');
        this.forceQR = false; // Let normal flow happen
      } else {
        console.log('✅ Valid session found, attempting to restore...');
      }

      if (await this.shouldForceQR()) {
        console.log('🔄 Forcing QR generation due to session recovery');
        await this.clearSession();
      }

      // Initialize client with RemoteAuth
      this.client = new Client({
        authStrategy: new RemoteAuth({
          clientId: 'admin',
          store: this.supabaseStore,
          backupSyncIntervalMs: 60000,
          dataPath: this.authPath,
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
            '--max_old_space_size=512',
          ],
        },
        takeoverOnConflict: false,
        restartOnAuthFail: true,
        puppeteerOptions: {
          protocolTimeout: 60000, // Increased timeout for WhatsApp Web
        }
      });

      this.setupClientEvents();
      await this.client.initialize();

    } catch (error) {
      console.error('❌ Error initializing bot:', error);
      
      if (this.isSessionError(error)) {
        console.log('🔄 Session error detected, attempting recovery...');
        await this.recoverFromSessionError(error);
      } else {
        this.emitToAllSockets('bot-error', { error: error.message });
        this.isInitializing = false;
      }
    }
  }

  setupClientEvents() {
    if (!this.client) return;

    let qrGenerated = false;

    this.client.on('qr', async (qr) => {
      console.log('🔶 QR code generated - scanning required');
      qrGenerated = true;
      
      this.sessionRecovery.currentRetries = 0;
      
      try {
        const qrImage = await QRCode.toDataURL(qr);
        this.currentQrCode = qrImage;
        this.emitToAllSockets('qr-code', { 
          qr: qrImage
        });
        this.emitToAllSockets('bot-status', { 
          status: 'scan_qr',
          retryCount: this.sessionRecovery.currentRetries,
          maxRetries: this.sessionRecovery.maxRetries
        });
        console.log('✅ QR code generated and sent to frontend');
      } catch (error) {
        console.error('❌ Error generating QR code:', error);
        this.emitToAllSockets('bot-error', { error: 'Failed to generate QR code' });
      }
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`📱 Loading Screen: ${percent}% - ${message}`);
      this.emitToAllSockets('bot-status', { 
        status: 'loading', 
        percent, 
        message,
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
    });

    this.client.on('authenticated', () => {
      console.log('✅ Bot authenticated with RemoteAuth');
      this.emitToAllSockets('bot-status', { 
        status: 'authenticated',
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
      this.forceQR = false;
      this.sessionRecovery.currentRetries = 0;
    });

    this.client.on('ready', async () => {
      console.log('✅ Bot connected successfully with RemoteAuth');
      
      // 🔒 LOCK ENDPOINT when bot is connected
      this.endpointLocked = true;
      this.endpointLockStartTime = Date.now();
      this.endpointChangeCount = 0;
      
      this.emitToAllSockets('bot-status', { 
        status: 'connected',
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
      this.isInitializing = false;
      this.isWaitingForSession = false;
      this.sessionRetryAttempts = 0;
      this.forceQR = false;
      this.sessionRecovery.currentRetries = 0;
      this.sessionRecovery.lastSessionTime = Date.now();
      
      this.currentQrCode = null;
      await this.loadActiveGroupsFromSupabase();
      
      try {
        await this.checkSupabaseStorage();
      } catch (error) {
        console.log('Could not check Supabase storage after connection');
      }
      
      console.log('✅ Supabase RemoteAuth is automatically handling session persistence');
    });

    this.client.on('remote_session_saved', () => {
      console.log('💾 Session saved to remote store');
      this.emitToAllSockets('bot-status', { status: 'session_saved' });
    });

    this.client.on('auth_failure', (error) => {
      console.error('❌ Bot auth failed:', error);
      this.emitToAllSockets('bot-error', { 
        error: 'Authentication failed',
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
      this.isInitializing = false;
    });

    this.client.on('disconnected', async (reason) => {
      console.log('🔌 Bot disconnected:', reason);
      
      // 🔓 UNLOCK endpoint when bot disconnects
      this.endpointLocked = false;
      this.endpointChangeCount = 0;
      
      this.emitToAllSockets('bot-status', { 
        status: 'disconnected',
        reason: reason,
        retryCount: this.sessionRecovery.currentRetries,
        maxRetries: this.sessionRecovery.maxRetries
      });
      
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (e) {
          console.log('Error destroying client:', e);
        }
        this.client = null;
      }
      
      this.isProcessing = false;
      this.currentProcessingRequest = null;
      
      this.groupsCache.data = [];
      this.groupsCache.lastUpdated = 0;
      this.processingQueue = [];
      this.groupCaches.clear();
      
      setTimeout(async () => {
        console.log('🔄 Attempting to restore session via RemoteAuth...');
        this.initializeWithStability();
      }, 5000);
    });

    this.client.on('message', async (message) => {
      await this.handleMessage(message);
    });
  }

  stopBot() {
    console.log('🛑 Stopping bot and cleaning up memory...');
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    this.isInitializing = false;
    this.processingQueue = [];
    this.isProcessing = false;
    this.currentProcessingRequest = null;
    this.groupCaches.clear();
    this.sessionRecovery.currentRetries = 0;
    
    console.log('✅ Bot stopped and memory cleaned up');
  }

  setActiveGroups(groups) {
    this.activeGroups = groups;
    this.saveActiveGroupsToSupabase();
    this.emitToAllSockets('active-groups-updated', { groups: groups });
    console.log('✅ Set active groups:', groups);
  }

  async handleMessage(message) {
    try {
      if (this.activeGroups.length === 0) return;
      
      const chat = await message.getChat();
      if (!chat.isGroup) return;
      
      if (!this.activeGroups.includes(chat.id._serialized)) return;

      const messageTimestamp = message.timestamp;
      const twoMinutesAgo = Date.now() / 1000 - 120;
      if (messageTimestamp < twoMinutesAgo) return;

      const messageText = message.body;
      
      if (this.isBotCommand(messageText)) {
        const isSearchCommand = messageText.toLowerCase().includes('!ai_search');
        const prompt = this.extractPrompt(message.body, isSearchCommand);
        
        if (!prompt) return;

        await this.addToQueue(message, chat, prompt, isSearchCommand);
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
    }
  }

  isBotCommand(messageText) {
    const commands = ['!bot', '!ai', '@bot', 'bot,', '!ai_search'];
    return commands.some(cmd => messageText.toLowerCase().includes(cmd));
  }

  // In botManager.js - fix callExternalAPI method
  async callExternalAPI(payload) {
    const apiUrl = process.env.API_ENDPOINT;
    if (!apiUrl) {
      console.error('API_ENDPOINT environment variable not set');
      return 'Sorry, API endpoint is not configured.';
    }
    
    const generateEndpoint = `${apiUrl}/generate_real_time`;
    
    console.log(`[API] Calling: ${generateEndpoint}`);
    console.log(`[API] Sending ${payload.messages?.length || 0} messages`);

    try {
      const response = await axios.post(
        generateEndpoint,
        {
          messages: payload.messages || [],
          prompt: payload.prompt || '',
          group_name: payload.groupName || 'Unknown Group',
          sender: payload.sender || 'Unknown User',
          timestamp: payload.timestamp || new Date().toISOString(),
          cache_info: {
            total_messages: payload.totalMessageCount || 0,
            new_messages: payload.newMessageCount || 0,
            has_cached_context: (payload.totalMessageCount || 0) > (payload.newMessageCount || 0)
          }
        },
        {
          timeout: 10 * 60 * 1000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = response.data;
      
      // SAFE response extraction
      let responseText = 'I received your message but cannot generate a response right now.';
      
      if (data) {
        if (typeof data === 'string') {
          responseText = data;
        } else if (typeof data === 'object') {
          responseText = data.response || 
                        data.answer || 
                        data.text || 
                        data.message || 
                        'I received your message but cannot generate a response right now.';
        }
      }
      
      console.log(`[API] Response received: ${responseText.substring(0, 100)}...`);
      return responseText;

    } catch (error) {
      console.error('API call failed:', error.message);
      return 'Sorry, there was an error processing your request. Please try again later.';
    }
  }

  // Similarly for callExternalAPISearch
  async callExternalAPISearch(payload) {
    try {
      const data = await this.makeApiCall('/generate_realtime_search', {
        messages: payload.messages,
        prompt: payload.prompt,
        group_name: payload.groupName || 'Unknown Group',
        sender: payload.sender || 'Unknown User',
        timestamp: payload.timestamp || new Date().toISOString(),
        enable_search: true,
        max_search_results: 3,
        cache_info: {
          total_messages: payload.totalMessageCount || 0,
          new_messages: payload.newMessageCount || 0,
          has_cached_context: (payload.totalMessageCount || 0) > (payload.newMessageCount || 0)
        }
      }, true);

      // SAFE response extraction
      let responseText = 'Sorry, I could not generate a search response.';
      
      if (data) {
        if (typeof data === 'string') {
          responseText = data;
        } else if (typeof data === 'object') {
          responseText = data.response || 
                        data.answer || 
                        data.text || 
                        data.message || 
                        'I received your search request but cannot generate a response right now.';
          
          // Safely add search info
          if (data.search_info) {
            const searchQuery = data.search_info.search_query || 'unknown query';
            const articlesFound = data.search_info.articles_found || 0;
            responseText += `\n\n*Search Info:* Queried "${searchQuery}"`;
            if (articlesFound > 0) {
              responseText += `, found ${articlesFound} articles`;
            }
          }
        }
      }
      
      console.log(`[API-SEARCH] Response received: ${responseText.substring(0, 100)}...`);
      return responseText;
      
    } catch (error) {
      console.error('Search API call failed:', error.message);
      return 'Sorry, the search request failed. Please try again later or use !ai for a faster response.';
    }
  }

  extractPrompt(messageText, isSearchCommand = false) {
    if (isSearchCommand) {
      return messageText.replace(/(!ai_search)\s*/i, '').trim();
    } else {
      return messageText.replace(/(!bot|!ai|@bot|bot,)\s*/i, '').trim();
    }
  }

  clearGroupsCache() {
    this.groupsCache.data = [];
    this.groupsCache.lastUpdated = 0;
    console.log('✅ Groups cache cleared');
  }

  async clearSession() {
    try {
      if (this.supabaseStore) {
        await this.supabaseStore.delete({ session: 'RemoteAuth-admin' });
        console.log('✅ Session cleared from Supabase');
      }
      
      this.sessionRecovery.currentRetries = 0;
      this.sessionRecovery.lastSessionTime = null;
      
    } catch (error) {
      console.error('❌ Error clearing Supabase session:', error);
    }
  }

  async forceQRGeneration() {
    console.log('🔄 Force QR generation requested...');
    this.forceQR = true;
    this.sessionRecovery.currentRetries = this.sessionRecovery.maxRetries;
    
    await this.clearSession();
    
    if (this.client) {
      try {
        await this.client.destroy();
        console.log('✅ Client destroyed');
      } catch (error) {
        console.error('Error destroying client:', error);
      }
      this.client = null;
    }
    
    this.isInitializing = false;
    this.isWaitingForSession = false;
    
    setTimeout(() => {
      console.log('🔄 Reinitializing bot for QR generation...');
      this.initializeBot();
    }, 2000);
    
    return true;
  }

  // 🚀 Add method to manually lock/unlock endpoint
  setEndpointLock(locked) {
    this.endpointLocked = locked;
    if (locked) {
      this.endpointLockStartTime = Date.now();
      this.endpointChangeCount = 0;
    }
    
    console.log(`Endpoint lock ${locked ? 'enabled' : 'disabled'}`);
    this.emitToAllSockets('endpoint-status', {
      endpoints: this.endpointStatuses,
      activeEndpoint: this.activeEndpoint,
      locked: this.endpointLocked,
      changesRemaining: Math.max(0, this.maxEndpointChanges - this.endpointChangeCount)
    });
    
    return { success: true, locked };
  }
  
  // 🚀 Add method to get endpoint lock status
  getEndpointLockStatus() {
    const lockAge = Date.now() - this.endpointLockStartTime;
    const timeRemaining = Math.max(0, this.endpointLockDuration - lockAge);
    
    return {
      locked: this.endpointLocked,
      lockStartTime: this.endpointLockStartTime,
      lockDuration: this.endpointLockDuration,
      timeRemaining: timeRemaining,
      changesCount: this.endpointChangeCount,
      maxChanges: this.maxEndpointChanges,
      changesRemaining: Math.max(0, this.maxEndpointChanges - this.endpointChangeCount),
      activeEndpoint: this.activeEndpoint
    };
  }

  async manualPurgeSessions(fullPurge = false) {
    console.log(`🔧 Manual Supabase purge requested (full: ${fullPurge})`);
    return await this.purgeSupabaseSessions(fullPurge);
  }

  async purgeSupabaseSessions(fullPurge = false) {
    try {
      console.log('🧹 Purging Supabase sessions...');
      
      if (!this.supabaseStore) {
        return { success: false, error: 'Supabase store not initialized' };
      }
      
      if (fullPurge) {
        const sessions = await this.supabaseStore.list();
        let deletedCount = 0;
        
        for (const session of sessions) {
          const baseSession = session.id.replace('admin-', '');
          await this.supabaseStore.delete({ session: baseSession });
          deletedCount++;
        }
        
        this.supabaseMonitor.lastPurgeTime = Date.now();
        
        return {
          success: true,
          deletedCount,
          message: `Deleted ${deletedCount} sessions from Supabase`,
          forceFullPurge: true
        };
      } else {
        const deletedCount = await this.supabaseStore.cleanupOldSessions(24);
        
        this.supabaseMonitor.lastPurgeTime = Date.now();
        
        return {
          success: true,
          deletedCount,
          message: `Cleaned up ${deletedCount} old sessions`,
          forceFullPurge: false
        };
      }
    } catch (error) {
      console.error('❌ Error purging Supabase sessions:', error);
      return {
        success: false,
        error: error.message,
        deletedCount: 0,
        forceFullPurge: false
      };
    }
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

  getFullStatus() {
    return {
      botStatus: this.getBotStatus(),
      qrCode: this.currentQrCode,
      recoveryStatus: this.getSessionRecoveryStatus(),
      supabase: this.getSupabaseStatus(),
      activeGroupsCount: this.activeGroups.length,
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      endpoints: {
        statuses: this.endpointStatuses,
        active: this.activeEndpoint,
        backendEndpoints: this.backendEndpoints,
        locked: this.endpointLocked
      }
    };
  }

  addSocketConnection(socket) {
    this.socketConnections.push(socket);
    console.log('Socket connection added. Total connections:', this.socketConnections.length);
    
    this.emitToAllSockets('bot-status', { 
      status: this.getBotStatus(),
      qrCode: this.currentQrCode,
      recoveryStatus: this.getSessionRecoveryStatus(),
      fullStatus: this.getFullStatus()
    });
    
    this.emitToAllSockets('active-groups-updated', { groups: this.activeGroups });
    this.emitToAllSockets('endpoint-status', { 
      endpoints: this.endpointStatuses,
      activeEndpoint: this.activeEndpoint,
      locked: this.endpointLocked
    });
  }

  removeSocketConnection(socket) {
    this.socketConnections = this.socketConnections.filter(s => s !== socket);
    console.log('Socket connection removed. Total connections:', this.socketConnections.length);
  }

  emitToAllSockets(event, data) {
    this.socketConnections.forEach(socket => {
      try {
        socket.emit(event, data);
      } catch (error) {
        console.error('Error emitting to socket:', error);
      }
    });
  }
}

export default BotManager;