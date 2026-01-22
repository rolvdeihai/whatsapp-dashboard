// backend/src/managers/MessageManager.js
export default class MessageManager {
  constructor(botManager) {
    this.botManager = botManager;
  }
  
  async handleMessage(message) {
    try {
      const groupManager = this.botManager.getGroupManager();
      if (groupManager.activeGroups.length === 0) return;
      
      const chat = await message.getChat();
      if (!chat.isGroup) return;
      
      if (!groupManager.activeGroups.includes(chat.id._serialized)) return;

      const messageTimestamp = message.timestamp;
      const twoMinutesAgo = Date.now() / 1000 - 120;
      if (messageTimestamp < twoMinutesAgo) return;

      const messageText = message.body;
      
      if (this.isBotCommand(messageText)) {
        const isSearchCommand = messageText.toLowerCase().includes('!ai_search');
        const prompt = this.extractPrompt(message.body, isSearchCommand);
        
        if (!prompt) return;

        await this.botManager.addToQueue(message, chat, prompt, isSearchCommand);
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
    }
  }
  
  isBotCommand(messageText) {
    const commands = ['!bot', '!ai', '@bot', 'bot,', '!ai_search'];
    return commands.some(cmd => messageText.toLowerCase().includes(cmd));
  }
  
  extractPrompt(messageText, isSearchCommand = false) {
    if (isSearchCommand) {
      return messageText.replace(/(!ai_search)\s*/i, '').trim();
    } else {
      return messageText.replace(/(!bot|!ai|@bot|bot,)\s*/i, '').trim();
    }
  }
}