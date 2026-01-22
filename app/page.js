// whatsapp-dashboard/app/page.js - UPDATED VERSION WITH SUPABASE ENDPOINTS

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { useRouter } from 'next/navigation';
import './globals.css';

const commonHeaders = {
  'ngrok-skip-browser-warning': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json'
};

function App() {
  const router = useRouter();
  
  // 🚀 User & Endpoint states
  const [userProfile, setUserProfile] = useState(null);
  const [userEndpoints, setUserEndpoints] = useState([]);
  const [selectedBackend, setSelectedBackend] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  
  // 🚀 Connection states
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());
  
  // 🚀 Bot states
  const [qrCode, setQrCode] = useState('');
  const [botStatus, setBotStatus] = useState('disconnected');
  const [savedGroups, setSavedGroups] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // 🚀 Refs
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  
  // 🚀 Load user profile and endpoints
  useEffect(() => {
    loadUserProfile();
  }, []);
  
  const loadUserProfile = async () => {
    try {
      setIsLoadingProfile(true);
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      });
      
      if (response.status === 401) {
        router.push('/login?error=session_expired');
        return;
      }
      
      const data = await response.json();
      
      if (!data.user) {
        router.push('/login');
        return;
      }
      
      setUserProfile(data.user);
      
      // Build endpoints array based on user's assigned endpoint
      const endpoints = [];
      
      // Add user's assigned endpoint if available
      if (data.user.endpoint_url) {
        endpoints.push({
          name: data.user.endpoint_name || 'Assigned Endpoint',
          url: data.user.endpoint_url,
          is_assigned: true
        });
      }
      
      // Also fetch available endpoints from supabase for this user's bot
      if (data.user.bot_id) {
        const endpointsResponse = await fetch(`/api/user/endpoints?bot_id=${data.user.bot_id}`);
        if (endpointsResponse.ok) {
          const endpointsData = await endpointsResponse.json();
          // Filter out already added assigned endpoint
          const additionalEndpoints = endpointsData.filter(ep => 
            !endpoints.some(e => e.url === ep.url)
          );
          endpoints.push(...additionalEndpoints.map(ep => ({
            id: ep.id, // Make sure this includes the ID
            name: ep.name,
            url: ep.url,
            is_assigned: false
          })));
        }
      }
      
      setUserEndpoints(endpoints);
      
      // Set initial selected backend
      if (endpoints.length > 0) {
        setSelectedBackend(endpoints[0].url);
      } else {
        setConnectionError('No endpoints available for your account');
      }
      
    } catch (error) {
      console.error('Failed to load user profile:', error);
      router.push('/login?error=server_error');
    } finally {
      setIsLoadingProfile(false);
    }
  };
  
  // 🚀 Helper function for API calls
  const apiCall = async (endpoint, options = {}) => {
    if (!selectedBackend) {
      throw new Error('No backend selected');
    }
    
    try {
      const response = await fetch(`${selectedBackend}${endpoint}`, {
        ...options,
        headers: {
          ...commonHeaders,
          ...options.headers,
          Referer: selectedBackend
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };
  
  const initializeSocket = useCallback(() => {
    if (!selectedBackend) {
      console.log('❌ No selectedBackend value:', selectedBackend);
      return;
    }

    // DEBUG: Check what we're sending
    console.log('🔍 DEBUG - selectedBackend value:', selectedBackend);
    console.log('🔍 DEBUG - typeof selectedBackend:', typeof selectedBackend);
    console.log('🔍 DEBUG - Will send endpoint_url:', selectedBackend);
    
    if (socketRef.current?.connected) {
      console.log('Socket already connected');
      return;
    }
    
    // Cleanup existing socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionStatus('connecting');
    
    // Create socket WITH DEBUGGING
    console.log('🔍 DEBUG - Creating socket with query:', { endpoint_url: selectedBackend });
    
    const newSocket = io(selectedBackend, {
      transports: ['websocket', 'polling'],
      timeout: 30000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      autoConnect: true,
      forceNew: true,
      multiplex: false,
      query: {
        endpoint_url: selectedBackend
      }
    });
    
    socketRef.current = newSocket;
    setSocket(newSocket);
    
    // 🚀 Socket event handlers
    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      setConnectionStatus('connected');
      setConnectionError(null);
      setReconnectAttempts(0);
      
      // Start heartbeat
      startHeartbeat();
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      setConnectionStatus('error');
      setConnectionError(error.message);
      
      // Auto-reconnect with backoff
      const attempts = reconnectAttempts + 1;
      setReconnectAttempts(attempts);
      
      const backoffDelay = Math.min(30000, Math.pow(2, attempts) * 1000);
      
      console.log(`⏳ Reconnecting in ${backoffDelay}ms (attempt ${attempts})`);
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      reconnectTimerRef.current = setTimeout(() => {
        initializeSocket();
      }, backoffDelay);
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      setConnectionStatus('disconnected');
      
      // Stop heartbeat
      stopHeartbeat();
      
      // Auto-reconnect if not manual disconnect
      if (reason !== 'io client disconnect') {
        setTimeout(() => {
          initializeSocket();
        }, 5000);
      }
    });
    
    // 🚀 Bot events
    newSocket.on('qr-code', (data) => {
      console.log('📱 QR code received');
      setQrCode(data.qr);
      setIsLoading(false);
    });
    
    newSocket.on('bot-status', (data) => {
      console.log('🤖 Bot status:', data.status);
      setBotStatus(data.status);
      setIsLoading(false);
      
      if (data.qrCode) setQrCode(data.qrCode);
    });
    
    newSocket.on('active-groups-updated', (data) => {
      setSelectedGroups(data.groups);
      localStorage.setItem('activeGroups', JSON.stringify(data.groups));
    });
    
    newSocket.on('bot-error', (data) => {
      console.error('Bot error:', data.error);
      setConnectionError(data.error);
    });
    
    newSocket.on('heartbeat-response', (data) => {
      setLastHeartbeat(Date.now());
    });
    
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [selectedBackend, reconnectAttempts]);
  
  // 🚀 Initialize socket when backend is selected
  useEffect(() => {
    if (selectedBackend && !isLoadingProfile) {
      initializeSocket();
    }
  }, [selectedBackend, isLoadingProfile, initializeSocket]);
  
  // 🚀 Heartbeat system
  const startHeartbeat = () => {
    stopHeartbeat();
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 15000);
  };
  
  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };
  
  // 🚀 Load saved groups on mount
  useEffect(() => {
    const saved = localStorage.getItem('activeGroups');
    if (saved) {
      try {
        setSelectedGroups(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing saved groups:', e);
      }
    }
    
    return () => {
      // Cleanup
      stopHeartbeat();
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);
  
  // 🚀 Monitor heartbeat
  useEffect(() => {
    const checkHeartbeat = setInterval(() => {
      const timeSinceHeartbeat = Date.now() - lastHeartbeat;
      if (timeSinceHeartbeat > 45000 && connectionStatus === 'connected') {
        console.warn('⚠️ No heartbeat for 45 seconds, reconnecting...');
        initializeSocket();
      }
    }, 5000);
    
    return () => clearInterval(checkHeartbeat);
  }, [lastHeartbeat, connectionStatus, initializeSocket]);
  
  // 🚀 Bot control functions
  const startBot = () => {
    if (!socketRef.current?.connected || isLoading) return;
    
    setIsLoading(true);
    socketRef.current.emit('start-bot');
  };
  
  const stopBot = () => {
    if (!socketRef.current?.connected) return;
    
    socketRef.current.emit('stop-bot');
    setIsLoading(false);
    setQrCode('');
  };
  
  const forceQR = () => {
    if (!socketRef.current?.connected) return;
    
    socketRef.current.emit('force-qr');
    setIsLoading(true);
  };
  
  const retrySession = () => {
    if (!socketRef.current?.connected) return;
    
    socketRef.current.emit('retry-session');
    setIsLoading(true);
  };
  
  // 🚀 Group management
  const loadSavedGroups = useCallback(async () => {
    if (selectedGroups.length === 0 || !socketRef.current?.connected) {
      setSavedGroups([]);
      return;
    }
    
    try {
      const groups = await apiCall('/api/groups/saved', {
        method: 'POST',
        body: JSON.stringify({ groupIds: selectedGroups }),
      });
      setSavedGroups(groups);
    } catch (error) {
      console.error('Error loading saved groups:', error);
    }
  }, [selectedGroups]);
  
  const searchGroups = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const results = await apiCall(`/api/groups/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching groups:', error);
      alert('Search failed: ' + error.message);
    } finally {
      setSearching(false);
    }
  };
  
  const saveActiveGroups = async () => {
    try {
      await apiCall('/api/active-groups', {
        method: 'POST',
        body: JSON.stringify({ groups: selectedGroups }),
      });
      alert('✅ Active groups saved!');
    } catch (error) {
      console.error('Error saving groups:', error);
      alert('Failed to save groups: ' + error.message);
    }
  };
  
  const toggleGroup = (groupId) => {
    const newSelectedGroups = selectedGroups.includes(groupId)
      ? selectedGroups.filter(id => id !== groupId)
      : [...selectedGroups, groupId];
    
    setSelectedGroups(newSelectedGroups);
    localStorage.setItem('activeGroups', JSON.stringify(newSelectedGroups));
  };
  
  const handleSearch = (e) => {
    e.preventDefault();
    searchGroups();
  };
  
  // 🚀 Change backend
  const changeBackend = (url) => {
    setSelectedBackend(url);
    
    // Reinitialize socket with new backend
    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      initializeSocket();
    }, 100);
  };
  
  // 🚀 Connection status display
  const getConnectionDisplay = () => {
    switch (connectionStatus) {
      case 'connecting':
        return '🔗 Connecting...';
      case 'connected':
        return '✅ Connected';
      case 'error':
        return `❌ Error: ${connectionError}`;
      case 'disconnected':
        return '🔌 Disconnected';
      default:
        return '❓ Unknown';
    }
  };
  
  const getBotDisplay = () => {
    switch (botStatus) {
      case 'connected':
        return '✅ Bot Connected';
      case 'scan_qr':
        return '📱 Scan QR Code';
      case 'loading':
        return '⏳ Loading...';
      case 'authenticated':
        return '🔐 Authenticated';
      case 'disconnected':
        return '🔌 Bot Disconnected';
      default:
        return botStatus;
    }
  };
  
  // 🚀 Load groups when bot is connected
  useEffect(() => {
    if (botStatus === 'connected') {
      loadSavedGroups();
    }
  }, [botStatus, selectedGroups, loadSavedGroups]);
  
  // 🚀 Manual reconnect
  const manualReconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    initializeSocket();
  };
  
  const goToDashboard = () => {
    router.push('/dashboard');
  };
  
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      localStorage.removeItem('authToken');
      localStorage.removeItem('rememberedEmail');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('rememberedEmail');
      router.push('/login');
    }
  };
  
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }
  
  if (!userProfile) {
    return null; // Will redirect to login
  }
  
  return (
    <div className="App">
      <header className="App-header">
        <div className="header-top">
          <h1>WhatsApp Bot Dashboard</h1>
          <div className="user-info">
            <span className="user-email">{userProfile.email}</span>
            <span className="user-plan">{userProfile.plan_id === 'free' ? 'Free Plan' : 'Pro Plan'}</span>
            <button onClick={goToDashboard} className="btn btn-secondary btn-sm">
              Dashboard
            </button>
            <button onClick={handleLogout} className="btn btn-danger btn-sm">
              Logout
            </button>
          </div>
        </div>
        
        {/* Connection Status */}
        <div className="connection-status">
          <div className={`status ${connectionStatus}`}>
            Backend: {getConnectionDisplay()}
            {reconnectAttempts > 0 && ` (Retry ${reconnectAttempts})`}
          </div>
          <div className={`status ${botStatus}`}>
            Bot: {getBotDisplay()}
            {userProfile.bot_name && ` - ${userProfile.bot_name}`}
            {userProfile.wa_account && ` (${userProfile.wa_account})`}
          </div>
          
          {connectionError && (
            <div className="error-message">
              <button onClick={manualReconnect} className="btn btn-sm btn-warning">
                Reconnect
              </button>
            </div>
          )}
        </div>
      </header>
      
      <div className="dashboard">
        {/* Endpoint Selection */}
        <section className="backend-section">
          <h2>Available Endpoints</h2>
          {userEndpoints.length === 0 ? (
            <div className="alert alert-warning">
              No endpoints available for your account. Please contact administrator.
            </div>
          ) : (
            <div className="endpoint-list">
              {userEndpoints.map((endpoint, index) => (
                <div key={endpoint.url} className="endpoint-card">
                  <div className="endpoint-info">
                    <h3>{endpoint.name}</h3>
                    <p className="endpoint-url">{endpoint.url}</p>
                    {endpoint.is_assigned && (
                      <span className="endpoint-badge">Assigned</span>
                    )}
                  </div>
                  <button
                    onClick={() => changeBackend(endpoint.url)}
                    className={`btn ${endpoint.url === selectedBackend ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {endpoint.url === selectedBackend ? '✓ Connected' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        
        {/* Bot Controls */}
        {selectedBackend && (
          <section className="connection-section">
            <h2>Bot Controls</h2>
            
            <div className="button-group">
              <button 
                onClick={startBot} 
                disabled={!socketRef.current?.connected || isLoading || botStatus === 'connected'}
                className="btn btn-primary"
              >
                {isLoading ? 'Loading...' : 
                 botStatus === 'connected' ? 'Connected' : 
                 botStatus === 'scan_qr' ? 'Scan QR' : 'Start Bot'}
              </button>
              
              {botStatus === 'connected' && (
                <button onClick={stopBot} className="btn btn-danger">
                  Stop Bot
                </button>
              )}
              
              {(botStatus === 'scan_qr' || botStatus === 'loading') && (
                <button onClick={forceQR} className="btn btn-warning">
                  Force New QR
                </button>
              )}
            </div>
            
            {/* QR Code Display */}
            {qrCode && botStatus === 'scan_qr' && (
              <div className="qr-code">
                <p>Scan this QR code with WhatsApp:</p>
                <img src={qrCode} alt="QR Code" />
                <p className="qr-help">
                  Open WhatsApp → Settings → Linked Devices → Link a Device
                </p>
              </div>
            )}
          </section>
        )}
        
        {/* Groups Management */}
        {selectedBackend && (botStatus === 'connected' || botStatus === 'scan_qr') && (
          <section className="groups-section">
            <h2>Manage Groups</h2>
            
            {/* Search */}
            <div className="search-section">
              <form onSubmit={handleSearch} className="search-form">
                <input
                  type="text"
                  placeholder="Search groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <button type="submit" disabled={searching} className="btn btn-secondary">
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </form>
              
              {searchResults.length > 0 && (
                <div className="search-results">
                  <h4>Results ({searchResults.length})</h4>
                  {searchResults.map(group => (
                    <div key={group.id} className="group-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(group.id)}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <span className="group-name">{group.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Active Groups */}
            <div className="saved-groups">
              <h3>Active Groups ({selectedGroups.length})</h3>
              
              {selectedGroups.length === 0 ? (
                <p>No active groups</p>
              ) : (
                <div className="groups-list">
                  {savedGroups.map(group => (
                    <div key={group.id} className="group-item saved">
                      <label>
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <span className="group-name">{group.name}</span>
                        <button 
                          onClick={() => toggleGroup(group.id)}
                          className="btn-remove"
                        >
                          ×
                        </button>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedGroups.length > 0 && (
                <button onClick={saveActiveGroups} className="btn btn-success">
                  Save Groups
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      
      {/* Connection Info Footer */}
      <footer className="app-footer">
        <small>
          Connection: {connectionStatus} | 
          Heartbeat: {lastHeartbeat ? 'Active' : 'Inactive'} | 
          Backend: {selectedBackend ? new URL(selectedBackend).hostname : 'None'}
        </small>
      </footer>
    </div>
  );
}

export default App;