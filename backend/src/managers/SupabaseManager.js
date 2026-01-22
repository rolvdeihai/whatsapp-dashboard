// backend/src/managers/SupabaseManager.js
import { supabase } from '../supabaseClient.js';
import { SupabaseRemoteAuthStore } from '../SupabaseRemoteAuthStore.js';

export default class SupabaseManager {
  constructor(botManager) {
    this.botManager = botManager;
    this.supabaseStore = null;
    
    // Supabase storage monitoring
    this.supabaseMonitor = {
      lastSizeCheck: 0,
      checkInterval: 10 * 60 * 1000,
      lastPurgeTime: 0,
      minPurgeInterval: 30 * 60 * 1000,
    };
    
    // Start monitoring
    setTimeout(() => {
      this.startSupabaseMonitoring();
    }, 10000);
  }
  
  startSupabaseMonitoring() {
    setInterval(async () => {
      await this.checkSupabaseStorage();
    }, this.supabaseMonitor.checkInterval);
    
    setTimeout(() => {
      this.checkSupabaseStorage();
    }, 60000);
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
          value: this.botManager.getGroupManager().activeGroups,
        }, {
          onConflict: 'key'
        });

      if (error) throw error;

      console.log('Active groups saved to Supabase:', this.botManager.getGroupManager().activeGroups);
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
        this.botManager.getGroupManager().activeGroups = Array.isArray(data.value) ? data.value : [];
        console.log('Active groups loaded from Supabase:', this.botManager.getGroupManager().activeGroups);
      } else {
        this.botManager.getGroupManager().activeGroups = [];
        console.log('No active groups found in Supabase, starting empty');
      }

      this.botManager.getSocketManager().emitToAllSockets('active-groups-updated', { 
        groups: this.botManager.getGroupManager().activeGroups 
      });
    } catch (err) {
      console.error('Failed to load active groups from Supabase:', err);
      this.botManager.getGroupManager().activeGroups = [];
    }
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
  
  setSupabaseStore(store) {
    this.supabaseStore = store;
  }
}