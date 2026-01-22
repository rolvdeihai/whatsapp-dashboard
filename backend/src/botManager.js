// backend/src/botManager.js
// Development patch loading - MUST BE THE FIRST THING
// (async () => {
//   if (process.env.NODE_ENV === 'development') {
//     try {
//       console.log('🛠️ Development mode detected, applying RemoteAuth patch...');
//       // Use dynamic import to run immediately
//       await import('./patch-loader.js');
//     } catch (error) {
//       console.log('⚠️ Failed to load patch (may not exist in production):', error.message);
//     }
//   }
// })();

await import('./patch-loader.js');

// Then use CommonJS require for whatsapp-web.js to ensure patch works
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client, RemoteAuth } = require('whatsapp-web.js');

import path from 'path';
import { fileURLToPath } from 'url';

// Import managers
import SessionManager from './managers/SessionManager.js';
import QueueManager from './managers/QueueManager.js';
import GroupManager from './managers/GroupManager.js';
import EndpointManager from './managers/EndpointManager.js';
import MessageManager from './managers/MessageManager.js';
import ApiManager from './managers/ApiManager.js';
import SupabaseManager from './managers/SupabaseManager.js';
import SocketManager from './managers/SocketManager.js';

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
    // Core properties
    this.client = null;
    this.isInitializing = false;
    this._currentQrCode = null;
    
    // Paths
    this.authPath = process.env.NODE_ENV === 'production' 
      ? path.join('/tmp/whatsapp_auth')
      : path.join(__dirname, '../auth');
    
    this.cacheDir = process.env.NODE_ENV === 'production'
      ? '/tmp/group_cache'
      : path.join(__dirname, '../group_cache');
    
    // Initialize all managers
    this.supabaseManager = new SupabaseManager(this);
    this.sessionManager = new SessionManager(this);
    this.queueManager = new QueueManager(this);
    this.groupManager = new GroupManager(this);
    this.endpointManager = new EndpointManager(this, BACKEND_ENDPOINTS);
    this.messageManager = new MessageManager(this);
    this.apiManager = new ApiManager(this);
    this.socketManager = new SocketManager(this);
    this.currentEndpointId = null;
    
    // Initialize with stability
    setTimeout(() => {
      this.sessionManager.initializeWithStability();
    }, 3000);
  }

  // Delegate methods to managers (maintain same public API)
  
  // Session methods
  initializeBot() {
    return this.sessionManager.initializeBot();
  }
  
  stopBot() {
    return this.sessionManager.stopBot();
  }
  
  forceQRGeneration() {
    return this.sessionManager.forceQRGeneration();
  }
  
  clearSession() {
    return this.sessionManager.clearSession();
  }
  
  // Group methods
  getGroups() {
    return this.groupManager.getGroups();
  }
  
  searchGroups(query) {
    return this.groupManager.searchGroups(query);
  }
  
  getSavedGroups(groupIds) {
    return this.groupManager.getSavedGroups(groupIds);
  }
  
  refreshGroups() {
    return this.groupManager.refreshGroups();
  }
  
  setActiveGroups(groups) {
    return this.groupManager.setActiveGroups(groups);
  }
  
  // Queue methods
  addToQueue(message, chat, prompt, isSearchCommand) {
    return this.queueManager.addToQueue(message, chat, prompt, isSearchCommand);
  }
  
  // Message handling
  handleMessage(message) {
    return this.messageManager.handleMessage(message);
  }
  
  isBotCommand(messageText) {
    return this.messageManager.isBotCommand(messageText);
  }
  
  extractPrompt(messageText, isSearchCommand) {
    return this.messageManager.extractPrompt(messageText, isSearchCommand);
  }
  
  // API methods
  callExternalAPI(payload) {
    return this.apiManager.callExternalAPI(payload);
  }
  
  callExternalAPISearch(payload) {
    return this.apiManager.callExternalAPISearch(payload);
  }
  
  makeApiCall(endpointPath, payload, isSearch = false) {
    return this.apiManager.makeApiCall(endpointPath, payload, isSearch);
  }
  
  // Supabase methods
  saveActiveGroupsToSupabase() {
    return this.supabaseManager.saveActiveGroupsToSupabase();
  }
  
  loadActiveGroupsFromSupabase() {
    return this.supabaseManager.loadActiveGroupsFromSupabase();
  }
  
  getSupabaseStatus() {
    return this.supabaseManager.getSupabaseStatus();
  }
  
  manualPurgeSessions(fullPurge = false) {
    return this.supabaseManager.manualPurgeSessions(fullPurge);
  }
  
  // Endpoint methods
  getBestEndpoint() {
    return this.endpointManager.getBestEndpoint();
  }
  
  checkAndSelectBestEndpoint() {
    return this.endpointManager.checkAndSelectBestEndpoint();
  }
  
  setEndpointLock(locked) {
    return this.endpointManager.setEndpointLock(locked);
  }
  
  getEndpointLockStatus() {
    return this.endpointManager.getEndpointLockStatus();
  }
  
  // Status methods
  getBotStatus() {
    return this.sessionManager ? this.sessionManager.getBotStatus() : 'disconnected';
  }
  
  getFullStatus() {
    // Get the current QR code from session manager
    const currentQrCode = this.sessionManager ? this.sessionManager.currentQrCode : null;
    const recoveryStatus = this.sessionManager ? this.sessionManager.getSessionRecoveryStatus() : { 
      currentRetries: 0, 
      maxRetries: 5, 
      lastSessionTime: null, 
      sessionAge: null 
    };
    
    return {
      botStatus: this.getBotStatus(),
      qrCode: currentQrCode,
      recoveryStatus: recoveryStatus,
      supabase: this.getSupabaseStatus(),
      activeGroupsCount: this.groupManager.activeGroups ? this.groupManager.activeGroups.length : 0,
      queueLength: this.queueManager.processingQueue ? this.queueManager.processingQueue.length : 0,
      isProcessing: this.queueManager.isProcessing || false,
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      endpoints: {
        statuses: this.endpointManager.endpointStatuses || [],
        active: this.endpointManager.activeEndpoint || null,
        backendEndpoints: this.endpointManager.backendEndpoints || [],
        locked: this.endpointManager.endpointLocked || false
      }
    };
  }
  
  // Socket methods (delegated to socket manager)
  addSocketConnection(socket) {
    return this.socketManager.addSocketConnection(socket);
  }
  
  removeSocketConnection(socket) {
    return this.socketManager.removeSocketConnection(socket);
  }
  
  emitToAllSockets(event, data) {
    return this.socketManager.emitToAllSockets(event, data);
  }
  
  // Helper methods that managers need
  getClient() {
    return this.client;
  }
  
  setClient(client) {
    this.client = client;
  }

  setCurrentEndpointId(endpointId) {
    console.log(`🔗 Setting current endpoint ID: ${endpointId}`);
    this.currentEndpointId = endpointId;
    
    if (this.sessionManager) {
      this.sessionManager.setCurrentEndpointId(endpointId);
    }
  }
  
  getCurrentQrCode() {
    return this.sessionManager ? this.sessionManager.currentQrCode : null;
  }
  
  setCurrentQrCode(qrCode) {
    if (this.sessionManager) {
      this.sessionManager.currentQrCode = qrCode;
    }
  }
  
  getIsInitializing() {
    return this.isInitializing;
  }
  
  setIsInitializing(value) {
    this.isInitializing = value;
  }
  
  // Getter for managers to access other managers
  getSessionManager() {
    return this.sessionManager;
  }
  
  getQueueManager() {
    return this.queueManager;
  }
  
  getGroupManager() {
    return this.groupManager;
  }
  
  getApiManager() {
    return this.apiManager;
  }
  
  getSupabaseManager() {
    return this.supabaseManager;
  }
  
  getEndpointManager() {
    return this.endpointManager;
  }
  
  getSocketManager() {
    return this.socketManager;
  }
  
  getMessageManager() {
    return this.messageManager;
  }
  
  // Getter for active groups (for compatibility)
  get activeGroups() {
    return this.groupManager ? this.groupManager.activeGroups || [] : [];
  }
  
  // Getter for currentQrCode (for compatibility)
  get currentQrCode() {
    return this.getCurrentQrCode();
  }
}

export default BotManager;