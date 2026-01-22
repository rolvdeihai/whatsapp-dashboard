'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Power } from 'lucide-react'

export default function AdminEndpoints() {
  const [endpoints, setEndpoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingEndpoint, setEditingEndpoint] = useState(null)
  const [bots, setBots] = useState([])

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    max_capacity: 100,  // Changed from max_users
    bot_id: '',          // Add bot_id field
    is_active: true
  })

  /* -------------------------------
     Prevent background scrolling
  -------------------------------- */
  useEffect(() => {
    if (showAddModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [showAddModal])

  // Add to useEffect or create a separate function
  const fetchBots = async () => {
    try {
      const response = await fetch('/api/admin/bots')
      const data = await response.json()
      if (response.ok) {
        setBots(data)
      }
    } catch (error) {
      console.error('Error fetching bots:', error)
    }
  }

  useEffect(() => {
    fetchEndpoints()
    fetchBots()
  }, [])

  const fetchEndpoints = async () => {
    try {
      const response = await fetch('/api/admin/endpoints')
      const data = await response.json()
      if (response.ok) setEndpoints(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    })
  }

  const resetForm = () => {
    setEditingEndpoint(null)
    setFormData({
      name: '',
      wa_account: '',
      bot_name: '',
      url: '',
      max_users: 5,
      is_active: true
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const url = editingEndpoint
        ? `/api/admin/endpoints/${editingEndpoint.id}`
        : '/api/admin/endpoints'

      const method = editingEndpoint ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setShowAddModal(false)
        resetForm()
        fetchEndpoints()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleEdit = (endpoint) => {
    setEditingEndpoint(endpoint)
    setFormData({
      name: endpoint.name,
      url: endpoint.url,
      max_capacity: endpoint.max_capacity, // Endpoint's max capacity
      bot_id: endpoint.bot_id,             // Just store bot_id
      is_active: endpoint.is_active        // Endpoint's active status
    })
    setShowAddModal(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this endpoint?')) return
    await fetch(`/api/admin/endpoints/${id}`, { method: 'DELETE' })
    fetchEndpoints()
  }

  const toggleEndpointStatus = async (id) => {
    await fetch(`/api/admin/endpoints/${id}/toggle`, { method: 'PUT' })
    fetchEndpoints()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Endpoints Management</h2>
          <p className="text-gray-600">Manage your WhatsApp bot endpoints</p>
        </div>

        <button
          onClick={() => {
            resetForm()
            setShowAddModal(true)
          }}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Endpoint
        </button>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                WhatsApp Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bot Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bot Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {endpoints.map((endpoint) => (
              <tr key={endpoint.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{endpoint.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{endpoint.wa_account}</div>
                  <div className="text-xs text-gray-500">
                    Bot ID: {endpoint.bot_id?.slice(0, 8)}...
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{endpoint.bot_name}</div>
                  <div className={`text-xs ${endpoint.bot_active ? 'text-green-600' : 'text-red-600'}`}>
                    {endpoint.bot_active ? 'Bot Active' : 'Bot Inactive'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 truncate max-w-xs">{endpoint.url}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {endpoint.current_load} / {endpoint.max_capacity} groups
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-green-600 h-2.5 rounded-full" 
                      style={{ width: `${Math.min((endpoint.current_load / endpoint.max_capacity) * 100, 100)}%` }}
                    ></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {endpoint.bot_current_users} / {endpoint.bot_max_users} users
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${Math.min((endpoint.bot_current_users / endpoint.bot_max_users) * 100, 100)}%` }}
                    ></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => toggleEndpointStatus(endpoint.id, endpoint.is_active)}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      endpoint.is_active
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-red-100 text-red-800 hover:bg-red-200'
                    }`}
                  >
                    <Power className="h-3 w-3 mr-1" />
                    {endpoint.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(endpoint)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(endpoint.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= MODAL ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-500 bg-opacity-75"
            onClick={() => {
              setShowAddModal(false)
              resetForm()
            }}
          />

          {/* Modal */}
          <div className="relative z-50 bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-medium mb-4">
              {editingEndpoint ? 'Edit Endpoint' : 'Add New Endpoint'}
            </h3>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                
                {/* Always show bot selection, but disable when editing */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Select Bot {editingEndpoint && '(Cannot change after creation)'}
                  </label>
                  <select
                    name="bot_id"
                    value={formData.bot_id || ''}
                    onChange={handleInputChange}
                    required={!editingEndpoint}
                    disabled={!!editingEndpoint} // Disable when editing
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select a bot...</option>
                    {bots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        {bot.bot_name} ({bot.wa_account}) - {bot.current_users}/{bot.max_users} users
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">URL</label>
                  <input
                    type="url"
                    name="url"
                    value={formData.url}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max Capacity (groups)</label>
                  <input
                    type="number"
                    name="max_capacity"  // Changed from max_users
                    value={formData.max_capacity}
                    onChange={handleInputChange}
                    required
                    min="1"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Active</label>
                </div>
              </div>
              
              {/* Add submit button */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                >
                  {editingEndpoint ? 'Update' : 'Create'} Endpoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
