// backend/src/managers/EndpointManager.js
export default class EndpointManager {
  constructor(botManager, backendEndpoints) {
    this.botManager = botManager;
    this.backendEndpoints = backendEndpoints;
    this.activeEndpoint = null;
    this.endpointStatuses = [];
    this.lastEndpointCheck = 0;
    this.endpointCheckInterval = 30000; // 30 seconds
    
    // Endpoint failure tracking
    this.endpointFailures = new Map();
    this.maxConsecutiveFailures = 3;
    this.endpointCooldownTime = 60000; // 1 minute
    
    // Endpoint lock system
    this.endpointLocked = false;
    this.endpointLockStartTime = 0;
    this.endpointLockDuration = 5 * 60 * 1000; // 5 minutes
    this.endpointChangeCount = 0;
    this.maxEndpointChanges = 3;
    
    // Start monitoring
    this.startEndpointMonitoring();
  }
  
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
          this.botManager.getSocketManager().emitToAllSockets('endpoint-status', {
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

      // Notify SessionManager of endpoint change
      if (!this.activeEndpoint || this.activeEndpoint.url !== bestEndpoint.url) {
        this.endpointChangeCount++;
        console.log(`🔄 Endpoint change #${this.endpointChangeCount}/${this.maxEndpointChanges}: ${bestEndpoint.name}`);
        
        // Notify SessionManager
        const sessionManager = this.botManager.getSessionManager();
        if (sessionManager && sessionManager.onEndpointChange) {
          await sessionManager.onEndpointChange(bestEndpoint);
        }
      }

      console.log(`🎯 Selected endpoint: ${bestEndpoint.name}`);
      this.activeEndpoint = bestEndpoint;
      
      // Track endpoint changes
      if (!this.activeEndpoint || this.activeEndpoint.url !== bestEndpoint.url) {
        this.endpointChangeCount++;
        console.log(`🔄 Endpoint change #${this.endpointChangeCount}/${this.maxEndpointChanges}: ${bestEndpoint.name}`);
      }
      
      console.log(`🎯 Selected endpoint: ${bestEndpoint.name} (${bestEndpoint.active} active, ${bestEndpoint.queued} queued, ${bestEndpoint.latency.toFixed(0)}ms)`);
      this.activeEndpoint = bestEndpoint;
      
      // Emit status
      this.botManager.getSocketManager().emitToAllSockets('endpoint-status', { 
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
  
  async checkAndSelectBestEndpoint() {
    try {
      // If bot is connecting or connected, be conservative
      if (this.botManager.getClient() && (this.botManager.getIsInitializing() || this.botManager.getClient().info)) {
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
  
  setEndpointLock(locked) {
    this.endpointLocked = locked;
    if (locked) {
      this.endpointLockStartTime = Date.now();
      this.endpointChangeCount = 0;
    }
    
    console.log(`Endpoint lock ${locked ? 'enabled' : 'disabled'}`);
    this.botManager.getSocketManager().emitToAllSockets('endpoint-status', {
      endpoints: this.endpointStatuses,
      activeEndpoint: this.activeEndpoint,
      locked: this.endpointLocked,
      changesRemaining: Math.max(0, this.maxEndpointChanges - this.endpointChangeCount)
    });
    
    return { success: true, locked };
  }
  
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
}