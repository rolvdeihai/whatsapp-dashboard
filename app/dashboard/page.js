// app/dashboard/page.js - UPDATED

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Users, Settings, Home } from 'lucide-react'
import './dashboard.css'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Form states
  const [groupInviteUrl, setGroupInviteUrl] = useState('')
  const [groupName, setGroupName] = useState('')
  const [activeGroups, setActiveGroups] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      console.log('Loading user data...')
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      })
      
      console.log('Profile response status:', response.status)
      
      if (response.status === 401) {
        router.push('/login?error=session_expired')
        return
      }
      
      const data = await response.json()
      console.log('Profile data received:', data)
      
      if (!data.user) {
        console.error('No user data in response')
        router.push('/login')
        return
      }

      console.log('Setting user data:', data.user)
      setUser(data.user)
      setGroups(data.groups || [])
      setActiveGroups(data.active_groups || [])
    } catch (error) {
      console.error('Failed to load user data:', error)
      router.push('/login?error=server_error')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      const authToken = localStorage.getItem('authToken')
      
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      localStorage.removeItem('authToken')
      localStorage.removeItem('rememberedEmail')
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      localStorage.removeItem('authToken')
      localStorage.removeItem('rememberedEmail')
      router.push('/login')
    }
  }

  const goToAdminDashboard = () => {
    router.push('/admin')
  }

  const goToAdminEndpoints = () => {
    router.push('/admin/endpoints')
  }

  const goToAdminUsers = () => {
    router.push('/admin/users')
  }

  // In app/dashboard/page.js - Update handleAddGroup function
  const handleAddGroup = async (e) => {
    e.preventDefault()
    if (!groupInviteUrl.trim() || !groupName.trim()) {
      alert('Please fill in both fields')
      return
    }

    setIsSaving(true)
    try {
      console.log('Adding group:', { groupInviteUrl, groupName })
      
      const response = await fetch('/api/user/groups', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        credentials: 'include',
        body: JSON.stringify({
          groupInviteUrl: groupInviteUrl.trim(),
          groupName: groupName.trim()
        })
      })

      console.log('Add group response status:', response.status)
      
      const data = await response.json()
      console.log('Add group response data:', data)
      
      if (data.success) {
        // Group was created in database
        setGroups(prev => [...prev, data.group])
        setGroupInviteUrl('')
        setGroupName('')
        
        // Show appropriate message based on webhook result
        if (data.warning) {
          alert(data.warning + ' ' + data.message)
        } else {
          alert(data.message || 'Group added successfully! The bot will join shortly.')
        }
        
        // Reload user data to update active groups count
        loadUserData()
      } else {
        // Show specific error message
        if (data.error.includes('expired') || data.error.includes('invalid')) {
          alert(`Error: ${data.error}\n\nPlease generate a new invite link by:\n1. Opening the WhatsApp group\n2. Tap on group name\n3. Tap "Invite to group"\n4. Tap "Reset link"\n5. Copy the new link`)
        } else {
          alert(data.error || 'Failed to add group')
        }
      }
    } catch (error) {
      console.error('Error adding group:', error)
      alert('Failed to add group. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveGroup = async (groupId) => {
    if (!confirm('Remove bot from this group? The bot will leave the WhatsApp group.')) return;

    try {
      const response = await fetch(`/api/user/groups/${groupId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const data = await response.json();
      
      if (data.success) {
        setGroups(prev => prev.filter(g => g.id !== groupId));
        setActiveGroups(prev => prev.filter(id => id !== groupId));
        alert(data.message || 'Group removed successfully!');
        
        // Reload user data to update active groups count
        loadUserData()
      } else {
        alert(data.error || 'Failed to remove group');
      }
    } catch (error) {
      console.error('Error removing group:', error);
      alert('Failed to remove group');
    }
  };

  const handleToggleGroup = async (groupId, currentActive) => {
    try {
      const newActiveState = !currentActive
      console.log('Toggling group:', groupId, 'to:', newActiveState)
      
      const response = await fetch(`/api/user/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: newActiveState })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setGroups(prev => prev.map(group => 
          group.id === groupId 
            ? { ...group, is_active: newActiveState }
            : group
        ));
        
        // Update active groups list
        if (newActiveState) {
          setActiveGroups(prev => [...prev, groupId]);
        } else {
          setActiveGroups(prev => prev.filter(id => id !== groupId));
        }
        
        // Reload user data to update active groups count
        loadUserData()
      } else {
        alert(data.error || 'Failed to update group');
      }
    } catch (error) {
      console.error('Error toggling group:', error);
      alert('Failed to update group status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    )
  }

  // Debug: Log user data to see what's available
  console.log('Current user data:', user)

  return (
    <div className="dashboard-container">
      {/* Navigation */}
      <nav className="dashboard-nav">
        <div className="nav-content">
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold">WhatsApp Bot Dashboard</h1>
            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
              {user?.plan_id === 'free' ? 'Free Plan' : 'Pro Plan'}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">{user?.email}</span>
            
            {user?.is_admin && (
              <div className="relative group">
                <button
                  onClick={goToAdminDashboard}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Admin Panel
                </button>
                
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 hidden group-hover:block">
                  <button
                    onClick={goToAdminDashboard}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Home className="h-4 w-4 inline mr-2" />
                    Admin Dashboard
                  </button>
                  <button
                    onClick={goToAdminEndpoints}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Settings className="h-4 w-4 inline mr-2" />
                    Manage Endpoints
                  </button>
                  <button
                    onClick={goToAdminUsers}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Users className="h-4 w-4 inline mr-2" />
                    Manage Users
                  </button>
                </div>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="dashboard-main">
        {/* Sidebar */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Your Bot</h3>
            <div className="bot-info">
              <div className="info-item">
                <span className="info-label">Bot Name:</span>
                <span className="info-value">
                  {user?.bot_name || 'Not assigned'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">WA Number:</span>
                <span className="info-value">
                  {user?.wa_account || 'Not assigned'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Active Groups:</span>
                <span className="info-value">{user?.active_groups || 0}</span>
              </div>
              {user?.is_admin && (
                <div className="info-item">
                  <span className="info-label">Role:</span>
                  <span className="info-value flex items-center">
                    <Shield className="h-3 w-3 mr-1 text-purple-600" />
                    Admin
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Quick Actions</h3>
            <button 
              onClick={() => document.getElementById('add-group-form')?.scrollIntoView()}
              className="sidebar-action"
            >
              Add New Group
            </button>
            
            {user?.is_admin && (
              <>
                <button 
                  onClick={goToAdminDashboard}
                  className="sidebar-action bg-purple-100 text-purple-700 hover:bg-purple-200"
                >
                  <Shield className="h-4 w-4 inline mr-2" />
                  Admin Dashboard
                </button>
                <button 
                  onClick={goToAdminEndpoints}
                  className="sidebar-action bg-purple-100 text-purple-700 hover:bg-purple-200"
                >
                  Manage Endpoints
                </button>
                <button 
                  onClick={goToAdminUsers}
                  className="sidebar-action bg-purple-100 text-purple-700 hover:bg-purple-200"
                >
                  Manage Users
                </button>
              </>
            )}
            
            <button className="sidebar-action">
              View Usage
            </button>
            <button className="sidebar-action">
              Upgrade Plan
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="dashboard-content">
          {/* Bot Status Card */}
          <div className="content-section">
            <h2 className="section-title">Bot Status</h2>
            <div className="bot-status-card">
              <div className="status-indicator connected"></div>
              <div>
                <h3 className="status-title">Bot is Active</h3>
                <p className="status-description">
                  Your bot is connected and ready to monitor groups
                </p>
              </div>
            </div>
          </div>

          {/* Add Group Form */}
          <div id="add-group-form" className="content-section">
            <h2 className="section-title">Add WhatsApp Group</h2>
            <form onSubmit={handleAddGroup} className="group-form">
              <div className="form-group">
                <label htmlFor="groupName" className="form-label">
                  Group Name
                </label>
                <input
                  type="text"
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="form-input"
                  placeholder="Enter group name"
                  required
                  disabled={isSaving}
                />
              </div>
              <div className="form-group">
                <label htmlFor="groupInviteUrl" className="form-label">
                  Group Invite URL
                </label>
                <input
                  type="url"
                  id="groupInviteUrl"
                  value={groupInviteUrl}
                  onChange={(e) => setGroupInviteUrl(e.target.value)}
                  className="form-input"
                  placeholder="https://chat.whatsapp.com/..."
                  required
                  disabled={isSaving}
                />
                <div className="form-help">
                  <p><strong>How to get the invite link:</strong></p>
                  <ol className="list-decimal ml-4 mt-1 space-y-1 text-sm">
                    <li>Open the WhatsApp group on your phone</li>
                    <li>Tap on the group name at the top</li>
                    <li>Scroll down and tap "Invite to group"</li>
                    <li>Tap "Copy link" or "Reset link" to get a fresh invite</li>
                    <li>Paste the link here</li>
                  </ol>
                  <p className="mt-2 text-xs text-red-600">
                    <strong>Note:</strong> If the bot fails to join, try resetting the invite link and using the new one.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className={`submit-button ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSaving ? 'Adding...' : 'Add Group & Invite Bot'}
              </button>
            </form>
          </div>

          {/* Manage Groups */}
          <div className="content-section">
            <div className="section-header">
              <h2 className="section-title">Your Groups ({groups.length})</h2>
            </div>

            {groups.length === 0 ? (
              <div className="empty-state">
                <p>No groups added yet. Add your first group above.</p>
              </div>
            ) : (
              <div className="groups-list">
                {groups.map(group => (
                  <div key={group.id} className="group-card">
                    <div className="group-info">
                      <div className="group-header">
                        <h3 className="group-name">{group.whatsapp_group_name}</h3>
                        <div className="group-actions">
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={group.is_active}
                              onChange={() => handleToggleGroup(group.id, group.is_active)}
                              disabled={isSaving}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                          <button
                            onClick={() => handleRemoveGroup(group.id)}
                            className="remove-button"
                            disabled={isSaving}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <p className="group-id">Group ID: {group.whatsapp_group_id}</p>
                      <p className="group-assigned">
                        Bot: {group.bot_name} ({group.bot_wa_account})
                      </p>
                      {group.endpoint_name && (
                        <p className="endpoint-info">
                          Endpoint: {group.endpoint_name}
                        </p>
                      )}
                      <div className={`group-status ${group.is_active ? 'active' : 'inactive'}`}>
                        {group.is_active ? 'Active' : 'Inactive'}
                      </div>
                      <div className="group-timestamp">
                        Added: {new Date(group.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Usage Stats */}
          <div className="content-section">
            <h2 className="section-title">Usage Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-number">{groups.length}</div>
                <div className="stat-label">Total Groups</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{user?.active_groups || 0}</div>
                <div className="stat-label">Active Groups</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">
                  {groups.filter(g => g.is_active).length}
                </div>
                <div className="stat-label">Currently Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{user?.plan_id || 'free'}</div>
                <div className="stat-label">Current Plan</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}