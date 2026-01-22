// backend/src/managers/GroupManager.js
export default class GroupManager {
  constructor(botManager) {
    this.botManager = botManager;
    this.activeGroups = [];
    
    // Group caching
    this.groupsCache = {
      data: [],
      lastUpdated: 0,
      cacheDuration: 5 * 60 * 1000,
      isUpdating: false
    };
  }
  
  async getGroups() {
    try {
      if (!this.botManager.getClient() || !this.botManager.getClient().info) {
        console.log('Bot client not ready');
        return [];
      }

      console.time('QuickGroupFetch');
      const chats = await this.botManager.getClient().getChats();
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
      if (!this.botManager.getClient() || !this.botManager.getClient().info || !query || query.length < 2) return [];

      const chats = await this.botManager.getClient().getChats();
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
      if (!this.botManager.getClient() || !this.botManager.getClient().info || !Array.isArray(groupIds) || groupIds.length === 0) return [];

      const chats = await this.botManager.getClient().getChats();
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
  
  setActiveGroups(groups) {
    this.activeGroups = groups;
    this.botManager.saveActiveGroupsToSupabase();
    this.botManager.getSocketManager().emitToAllSockets('active-groups-updated', { groups: groups });
    console.log('✅ Set active groups:', groups);
  }
  
  clearGroupsCache() {
    this.groupsCache.data = [];
    this.groupsCache.lastUpdated = 0;
    console.log('✅ Groups cache cleared');
  }
}