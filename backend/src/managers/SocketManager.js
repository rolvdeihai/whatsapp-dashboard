// backend/src/managers/SocketManager.js
export default class SocketManager {
  constructor(botManager) {
    this.botManager = botManager;
    this.socketConnections = [];
  }
  
  addSocketConnection(socket) {
    this.socketConnections.push(socket);
    console.log('Socket connection added. Total connections:', this.socketConnections.length);
    
    // Safely get session manager
    const sessionManager = this.botManager.getSessionManager ? this.botManager.getSessionManager() : null;
    
    // Safely get full status
    const fullStatus = this.botManager.getFullStatus ? this.botManager.getFullStatus() : { botStatus: 'disconnected' };
    
    this.emitToAllSockets('bot-status', { 
      status: this.botManager.getBotStatus(),
      qrCode: sessionManager ? sessionManager.currentQrCode : null,
      recoveryStatus: sessionManager ? sessionManager.getSessionRecoveryStatus() : null,
      fullStatus: fullStatus
    });
    
    // Safely get active groups
    const activeGroups = this.botManager.getActiveGroups ? this.botManager.getActiveGroups() : [];
    this.emitToAllSockets('active-groups-updated', { 
      groups: activeGroups
    });
    
    // Safely get endpoint status
    const endpointManager = this.botManager.getEndpointManager ? this.botManager.getEndpointManager() : null;
    this.emitToAllSockets('endpoint-status', { 
      endpoints: endpointManager ? endpointManager.endpointStatuses : [],
      activeEndpoint: endpointManager ? endpointManager.activeEndpoint : null,
      locked: endpointManager ? endpointManager.endpointLocked : false
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