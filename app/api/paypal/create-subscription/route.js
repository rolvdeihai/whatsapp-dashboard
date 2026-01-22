import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use sandbox for testing, production for live
const PAYPAL_API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

export async function POST(request) {
  try {
    // Get user from session or token (you can adapt this based on your auth)
    const { userId, planId = 'P-3HX69007XT3446823NFWKBXI', couponCode } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Get user from database to verify
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get PayPal access token
    const authResponse = await axios.post(
      `${PAYPAL_API_BASE_URL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: {
          username: process.env.PAYPAL_CLIENT_ID,
          password: process.env.PAYPAL_CLIENT_SECRET
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = authResponse.data.access_token;

    // For testing: If coupon is 'TESTWEBHOOK', use test plan with $0
    const finalPlanId = couponCode === 'TESTWEBHOOK' 
      ? (process.env.PAYPAL_TEST_PLAN_ID || 'P-3HX69007XT3446823NFWKBXI') // Use test plan ID
      : planId;

    console.log(`Creating subscription with plan: ${finalPlanId} for user: ${userId}`);

    // Create subscription
    const subscriptionResponse = await axios.post(
      `${PAYPPAL_API_BASE_URL}/v1/billing/subscriptions`,
      {
        plan_id: finalPlanId,
        custom_id: userId,
        application_context: {
          brand_name: "WhatsApp Group Assistant",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          payment_method: {
            payer_selected: "PAYPAL",
            payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
          },
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscription=success`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscription=cancelled`
        },
        subscriber: {
          email_address: user.email,
          name: {
            given_name: user.email.split('@')[0]
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'PayPal-Request-Id': `sub-${userId}-${Date.now()}`,
          'Prefer': 'return=representation'
        }
      }
    );

    const subscription = subscriptionResponse.data;

    // Save subscription ID to user immediately
    await supabaseAdmin
      .from('users')
      .update({
        subscription_id: subscription.id,
        subscribed_plan_id: finalPlanId,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      approvalUrl: subscription.links.find(link => link.rel === 'approve').href,
      status: subscription.status
    });

  } catch (error) {
    console.error('PayPal subscription error:', error.response?.data || error.message);
    
    return NextResponse.json(
      { 
        error: 'Failed to create subscription',
        details: error.response?.data || error.message 
      },
      { status: 500 }
    );
  }
}