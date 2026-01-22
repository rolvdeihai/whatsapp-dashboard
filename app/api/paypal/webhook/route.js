import crypto from 'crypto';
import axios from 'axios';

// Initialize Supabase admin client
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Verify webhook signature
  const isValid = await verifyPayPalWebhook(req);
  if (!isValid) {
    console.error('❌ Invalid webhook signature');
    return res.status(401).json({ message: 'Invalid signature' });
  }

  const event = req.body;
  console.log('📩 PayPal Webhook:', event.event_type, event.id);

  // Respond immediately to PayPal (important!)
  res.status(200).send('OK');

  // Process event asynchronously
  processWebhookEvent(event);
}

async function verifyPayPalWebhook(req) {
  // PayPal sends these headers
  const transmissionId = req.headers['paypal-transmission-id'];
  const transmissionTime = req.headers['paypal-transmission-time'];
  const certUrl = req.headers['paypal-cert-url'];
  const authAlgo = req.headers['paypal-auth-algo'];
  const transmissionSig = req.headers['paypal-transmission-sig'];
  
  if (!transmissionSig || !process.env.PAYPAL_WEBHOOK_ID) {
    console.error('Missing webhook signature or ID');
    return false;
  }

  // Get PayPal certificate
  const certResponse = await axios.get(certUrl);
  const paypalCert = certResponse.data;
  
  // Create verification string
  const verifyStr = `${transmissionId}|${transmissionTime}|${process.env.PAYPAL_WEBHOOK_ID}|${crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body))
    .digest('hex')}`;
  
  // Verify using PayPal's public key
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(verifyStr);
  verify.end();
  
  return verify.verify(paypalCert, transmissionSig, 'base64');
}

async function processWebhookEvent(event) {
  const eventType = event.event_type;
  const resource = event.resource;
  
  console.log(`Processing ${eventType} for subscription: ${resource.id}`);

  try {
    switch (eventType) {
      case 'PAYMENT.SALE.COMPLETED':
        await handleSubscriptionPayment(resource);
        break;
        
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleNewSubscription(resource);
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(resource);
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handlePaymentFailed(resource);
        break;
        
      case 'BILLING.SUBSCRIPTION.UPDATED':
        await handleSubscriptionUpdated(resource);
        break;
        
      default:
        console.log(`ℹ️ Unhandled event: ${eventType}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${eventType}:`, error);
  }
}

async function handleSubscriptionPayment(resource) {
  const subscriptionId = resource.billing_agreement_id || resource.subscription_id;
  const amount = resource.amount?.total || '0.00';
  const payerEmail = resource.payer?.payer_info?.email;
  const transactionId = resource.id;
  
  if (!subscriptionId) {
    console.error('No subscription ID in payment');
    return;
  }

  // 1. Find user by subscription ID
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .single();

  if (userError || !user) {
    console.error('User not found for subscription:', subscriptionId);
    return;
  }

  // 2. Update user subscription info
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      plan_status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);

  if (updateError) {
    throw new Error(`Failed to update user: ${updateError.message}`);
  }

  // 3. Log transaction
  const { error: txError } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: user.id,
      subscription_id: subscriptionId,
      plan_id: user.subscribed_plan_id || 'P-3HX69007XT3446823NFWKBXI',
      amount: parseFloat(amount),
      payer_email: payerEmail || user.email,
      paypal_transaction_id: transactionId,
      status: 'completed',
      event_time: new Date(resource.create_time).toISOString()
    });

  if (txError) {
    console.error('Failed to log transaction:', txError);
  }

  console.log(`✅ Payment ${transactionId} processed for ${user.email}`);
}

async function handleNewSubscription(resource) {
  // This event comes when user first subscribes
  const subscriptionId = resource.id;
  const customId = resource.custom_id; // This is where we store user ID
  
  if (!customId) {
    console.error('No user ID in subscription activation');
    return;
  }

  // Extract plan ID from subscription details
  const planId = resource.plan_id || 'P-3HX69007XT3446823NFWKBXI';
  
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_id: subscriptionId,
      subscribed_plan_id: planId,
      plan_status: 'active',
      plan_id: planId === 'P-3HX69007XT3446823NFWKBXI' ? 'pro' : 'free',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', customId);

  if (error) {
    console.error('Failed to activate subscription:', error);
    return;
  }

  console.log(`✅ Subscription activated for user ${customId}, plan: ${planId}`);
}

async function handleSubscriptionCancelled(resource) {
  const subscriptionId = resource.id;
  
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      plan_status: 'cancelled',
      plan_id: 'free',
      updated_at: new Date().toISOString()
    })
    .eq('subscription_id', subscriptionId);

  if (error) {
    console.error('Failed to cancel subscription:', error);
    return;
  }

  console.log(`📭 Subscription ${subscriptionId} cancelled`);
}

async function handlePaymentFailed(resource) {
  const subscriptionId = resource.id;
  
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      plan_status: 'payment_failed',
      updated_at: new Date().toISOString()
    })
    .eq('subscription_id', subscriptionId);

  if (error) {
    console.error('Failed to mark payment as failed:', error);
    return;
  }

  console.log(`⚠️ Payment failed for subscription ${subscriptionId}`);
}

async function handleSubscriptionUpdated(resource) {
  // Handle plan changes
  const subscriptionId = resource.id;
  const planId = resource.plan_id;
  
  if (planId) {
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        subscribed_plan_id: planId,
        plan_id: planId === 'P-3HX69007XT3446823NFWKBXI' ? 'pro' : 'free',
        updated_at: new Date().toISOString()
      })
      .eq('subscription_id', subscriptionId);

    if (!error) {
      console.log(`🔄 Subscription ${subscriptionId} updated to plan ${planId}`);
    }
  }
}