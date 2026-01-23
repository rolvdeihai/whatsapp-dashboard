// app/subscription/page.js
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SubscriptionPage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.user);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = () => {
    // Redirect to PayPal subscription
    window.location.href = 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-84S4477372307922TNFYIXQQ';
  };

  const handleManageSubscription = () => {
    // For managing existing subscription
    alert('For subscription management, please visit PayPal website directly');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Subscription Management</h1>
          <div className="flex gap-2 mt-4">
            <button onClick={() => router.push('/')} className="btn btn-secondary">
              Back to Home
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn btn-primary">
              Dashboard
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Free Plan */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-700">Free Plan</h2>
              <div className="text-3xl font-bold mt-2">$0<span className="text-sm text-gray-500">/month</span></div>
            </div>
            
            <ul className="space-y-3 mb-6">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>Basic group management</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>WhatsApp bot connection</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>1 endpoint connection</span>
              </li>
              <li className="flex items-center">
                <span className="text-red-500 mr-2">✗</span>
                <span>Advanced features</span>
              </li>
              <li className="flex items-center">
                <span className="text-red-500 mr-2">✗</span>
                <span>Priority support</span>
              </li>
            </ul>

            {userProfile?.plan_id === 'free' ? (
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <span className="text-green-700">Current Plan</span>
              </div>
            ) : (
              <button 
                onClick={() => router.push('/')}
                className="w-full btn btn-secondary"
              >
                Downgrade
              </button>
            )}
          </div>

          {/* Pro Plan */}
          <div className="bg-white rounded-lg shadow p-6 border-2 border-blue-500">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-700">Pro Plan</h2>
              <div className="text-3xl font-bold mt-2">$9.99<span className="text-sm text-gray-500">/month</span></div>
              <div className="text-sm text-blue-600 mt-1">Most Popular</div>
            </div>
            
            <ul className="space-y-3 mb-6">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>All advanced features</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>Priority support</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>Multiple endpoints</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>Unlimited groups</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                <span>Scheduled messages</span>
              </li>
            </ul>

            {userProfile?.plan_id === 'pro' ? (
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <span className="text-blue-700">✅ Active Subscription</span>
                <button 
                  onClick={handleManageSubscription}
                  className="w-full btn btn-secondary mt-2"
                >
                  Manage Subscription
                </button>
              </div>
            ) : (
              <button 
                onClick={handleSubscribe}
                className="w-full btn btn-success"
              >
                Subscribe with PayPal
              </button>
            )}
            
            <p className="text-xs text-gray-500 mt-3 text-center">
              You'll be redirected to PayPal to complete the subscription
            </p>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Payment Information</h3>
          <div className="text-sm text-gray-600">
            <p>• We use PayPal for secure payment processing</p>
            <p>• Cancel anytime - no long-term commitment</p>
            <p>• No hidden fees</p>
            <p>• Subscription renews automatically</p>
            <p className="mt-4">
              <strong>PayPal Plan ID:</strong> P-84S4477372307922TNFYIXQQ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}