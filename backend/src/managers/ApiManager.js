// backend/src/managers/ApiManager.js
import axios from 'axios';

export default class ApiManager {
  constructor(botManager) {
    this.botManager = botManager;
  }
  
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
}