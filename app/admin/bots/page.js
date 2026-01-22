'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Power, Users } from 'lucide-react'

export default function AdminBotsPage() {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBot, setEditingBot] = useState(null)
  const [formData, setFormData] = useState({
    wa_account: '',
    bot_name: '',
    max_users: 5,
    is_active: true
  })

  useEffect(() => {
    fetchBots()
  }, [])

  const fetchBots = async () => {
    try {
      const response = await fetch('/api/admin/bots')
      const data = await response.json()
      
      if (response.ok) {
        setBots(data)
      }
    } catch (error) {
      console.error('Error fetching bots:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const url = editingBot 
        ? `/api/admin/bots/${editingBot.id}`
        : '/api/admin/bots'
      
      const method = editingBot ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        setShowAddModal(false)
        setEditingBot(null)
        setFormData({
          wa_account: '',
          bot_name: '',
          max_users: 5,
          is_active: true
        })
        fetchBots()
      }
    } catch (error) {
      console.error('Error saving bot:', error)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bots Management</h2>
          <p className="text-gray-600">Manage WhatsApp bot identities</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Bot
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  WhatsApp Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bot Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Endpoints
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bots.map((bot) => (
                <tr key={bot.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{bot.wa_account}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{bot.bot_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <Users className="h-4 w-4 inline mr-1" />
                      {bot.current_users} / {bot.max_users} users
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${(bot.current_users / bot.max_users) * 100}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      bot.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      <Power className="h-3 w-3 mr-1" />
                      {bot.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <a 
                      href={`/admin/endpoints?bot_id=${bot.id}`}
                      className="text-sm text-blue-600 hover:text-blue-900"
                    >
                      View {bot.endpoint_count || 0} endpoints
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setEditingBot(bot)
                        setFormData({
                          wa_account: bot.wa_account,
                          bot_name: bot.bot_name,
                          max_users: bot.max_users,
                          is_active: bot.is_active
                        })
                        setShowAddModal(true)
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          {/* Modal content */}
        </div>
      )}
    </div>
  )
}