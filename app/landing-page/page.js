// File: /app/landing-page/page.js
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Check, 
  MessageCircle, 
  Users, 
  Shield, 
  Zap, 
  Star,
  Clock,
  HelpCircle,
  ArrowRight,
  Smartphone,
  LogOut,
  LayoutDashboard, // Changed from Dashboard to LayoutDashboard
  Home
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/user/profile', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setIsLoggedIn(true);
            setUserData(data.user);
          }
        }
      } catch (error) {
        console.log('Not logged in or error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      const authToken = localStorage.getItem('authToken');
      
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      localStorage.removeItem('authToken');
      localStorage.removeItem('rememberedEmail');
      setIsLoggedIn(false);
      setUserData(null);
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('rememberedEmail');
      setIsLoggedIn(false);
      setUserData(null);
    }
  };

  const handleDashboard = () => {
    router.push('/dashboard');
  };

  // Pricing plans with PayPal subscription
  const pricingPlans = [
    {
      id: 'free',
      name: 'Coba Gratis',
      price: 'Rp 0',
      period: '/30 hari pertama',
      description: 'Mulai dengan 100 pesan WhatsApp gratis',
      features: [
        '100 pesan WhatsApp gratis',
        '1 grup aktif',
        'Bot respons otomatis',
        'Dukungan email',
        'Masa percobaan 30 hari'
      ],
      ctaText: isLoggedIn ? 'Buka Dashboard' : 'Mulai Gratis',
      ctaColor: 'bg-gray-600 hover:bg-gray-700',
      popular: false
    },
    {
      id: 'pro',
      name: 'Paket Pro',
      price: 'Rp 299.000',
      period: '/bulan',
      description: 'Ideal untuk bisnis kecil hingga menengah',
      features: [
        '5,000 pesan WhatsApp/bulan',
        '5 grup aktif',
        'Bot AI cerdas',
        'Dukungan prioritas',
        'Analitik lengkap',
        'Integrasi API'
      ],
      ctaText: isLoggedIn ? 'Upgrade Sekarang' : 'Daftar Sekarang',
      ctaColor: 'bg-green-600 hover:bg-green-700',
      popular: true
    }
  ];

  const handlePlanSelection = (planId) => {
    setSelectedPlan(planId);
    
    if (isLoggedIn) {
      if (planId === 'free') {
        // Already on free plan, go to dashboard
        router.push('/dashboard');
      } else {
        // Upgrade to pro plan - redirect to PayPal
        window.location.href = 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-84S4477372307922TNFYIXQQ';
      }
    } else {
      // Not logged in, redirect to signup
      router.push(`/signup?plan=${planId}`);
    }
  };

  const handleGetStarted = () => {
    if (isLoggedIn) {
      router.push('/dashboard');
    } else {
      router.push('/signup?plan=free');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <MessageCircle className="h-8 w-8 text-green-600" />
            <span className="text-xl font-bold text-gray-900">WhatsAppBot.id</span>
          </div>
          <div className="flex items-center space-x-6">
            <a href="#features" className="text-gray-600 hover:text-green-600">Fitur</a>
            <a href="#pricing" className="text-gray-600 hover:text-green-600">Harga</a>
            <a href="#faq" className="text-gray-600 hover:text-green-600">FAQ</a>
          </div>
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">{userData?.email}</p>
                    <p className="text-xs text-gray-500">
                      Plan: <span className="font-medium">{userData?.plan_id === 'free' ? 'Free Trial' : 'Pro'}</span>
                    </p>
                  </div>
                  <button
                    onClick={handleDashboard}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <a href="/login" className="text-gray-600 hover:text-green-600">Login</a>
                <a 
                  href="/signup" 
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Sign Up Free
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Otomatiskan WhatsApp Grup Anda dengan{' '}
          <span className="text-green-600">Bot AI Cerdas</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
          Tingkatkan engagement grup WhatsApp bisnis Anda. Bot kami menjawab pertanyaan, 
          mengirim notifikasi, dan mengelola grup secara otomatis - 24/7 tanpa henti.
        </p>
        
        <div className="max-w-md mx-auto mb-12">
          <button
            onClick={handleGetStarted}
            className="bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            {isLoggedIn ? 'Buka Dashboard' : 'Mulai Gratis 30 Hari'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Social Proof */}
        <div className="flex flex-wrap justify-center items-center gap-8 text-gray-600">
          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
              ))}
            </div>
            <span>4.9/5 dari 500+ review</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            <span>1,200+ Grup Aktif</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <span>500K+ Pesan Terkirim</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Mengapa Memilih Bot Kami?</h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
              <Zap className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-4">Respons Instan</h3>
            <p className="text-gray-600">
              Bot kami menjawab pertanyaan anggota grup dalam hitungan detik, 
              bahkan di luar jam kerja.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-4">Aman & Terpercaya</h3>
            <p className="text-gray-600">
              Data grup Anda aman dengan enkripsi end-to-end dan compliant 
              dengan regulasi perlindungan data.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
              <Smartphone className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-4">Setup di Dashboard</h3>
            <p className="text-gray-600">
              Setelah login, tambahkan grup WhatsApp Anda di dashboard. 
              Kami akan otomatisasi grup Anda dalam 5 menit.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-6 py-16 bg-gray-50 rounded-2xl my-8">
        <h2 className="text-3xl font-bold text-center mb-4">Pilih Paket yang Tepat</h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          {isLoggedIn 
            ? `Anda sedang menggunakan paket ${userData?.plan_id === 'free' ? 'Gratis' : 'Pro'}. Upgrade untuk fitur lebih lengkap.`
            : 'Mulai dengan 30 hari gratis, lalu berlangganan hanya jika puas dengan hasilnya.'}
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {pricingPlans.map((plan) => {
            const isCurrentPlan = isLoggedIn && userData?.plan_id === plan.id;
            
            return (
              <div 
                key={plan.id}
                className={`bg-white rounded-xl shadow-lg border-2 p-8 relative transition-transform hover:scale-[1.02] ${
                  plan.popular 
                    ? 'border-green-500 shadow-green-100 transform scale-105' 
                    : 'border-gray-200'
                } ${isCurrentPlan ? 'ring-2 ring-green-300' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      PALING POPULER
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      PLAN ANDA
                    </span>
                  </div>
                )}

                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-600 ml-2">{plan.period}</span>
                </div>
                <p className="text-gray-600 mb-6">{plan.description}</p>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePlanSelection(plan.id)}
                  className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${plan.ctaColor} ${
                    isCurrentPlan ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? 'Plan Saat Ini' : plan.ctaText}
                </button>
              </div>
            );
          })}
        </div>

        {/* PayPal Information */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold mb-6">Pembayaran Aman dengan PayPal</h3>
          <div className="bg-white inline-flex px-6 py-3 rounded-lg border border-gray-200 mb-4">
            <img 
              src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_37x23.jpg" 
              alt="PayPal" 
              className="h-8"
            />
            <span className="ml-3 text-gray-700 font-medium">Kartu Kredit/Debit</span>
          </div>
          <p className="text-gray-500 text-sm mt-4">
            Pembayaran aman & terenkripsi • Langganan bulanan • Bebas berhenti kapan saja
          </p>
          {selectedPlan === 'pro' && !isLoggedIn && (
            <a 
              href="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-84S4477372307922TNFYIXQQ"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-blue-600 hover:text-blue-800 text-sm"
            >
              Lihat detail paket di PayPal ↗
            </a>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Cara Kerja</h2>
        
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-600">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Daftar Gratis</h3>
              <p className="text-gray-600">
                Buat akun dan dapatkan 30 hari gratis dengan 100 pesan WhatsApp.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Setup di Dashboard</h3>
              <p className="text-gray-600">
                Login ke dashboard dan tambahkan grup WhatsApp Anda dengan link invite.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Bot Aktif Otomatis</h3>
              <p className="text-gray-600">
                Bot akan otomatis join grup dan mulai bekerja dalam 5 menit.
              </p>
            </div>
          </div>
          
          <div className="mt-12 text-center">
            <button
              onClick={handleGetStarted}
              className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              {isLoggedIn ? 'Lanjut ke Dashboard' : 'Mulai Sekarang'}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Pertanyaan yang Sering Diajukan</h2>
        
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-green-600" />
              Bagaimana cara setup bot setelah mendaftar?
            </h3>
            <p className="text-gray-600">
              Setelah login, Anda akan masuk ke Dashboard. Di Dashboard Anda bisa:
              1. Copy link invite grup WhatsApp Anda
              2. Tambahkan link tersebut di form "Add WhatsApp Group"
              3. Bot akan otomatis join grup dalam 5 menit
              4. Atur respon dan konfigurasi bot sesuai kebutuhan Anda
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-green-600" />
              Apakah saya bisa upgrade dari paket gratis ke pro?
            </h3>
            <p className="text-gray-600">
              Ya, Anda bisa upgrade kapan saja. Login ke Dashboard Anda, dan klik tombol 
              "Upgrade Plan" di sidebar atau klik paket Pro di halaman ini jika sudah login. 
              Anda akan diarahkan ke PayPal untuk proses pembayaran.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-green-600" />
              Bagaimana jika saya sudah memiliki bot di dashboard?
            </h3>
            <p className="text-gray-600">
              Jika Anda sudah memiliki akun dan bot aktif, cukup login dan Anda akan langsung 
              diarahkan ke Dashboard untuk mengelola grup yang sudah ada atau menambahkan grup baru.
              Semua konfigurasi dan history Anda tetap tersimpan.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <div className="flex items-center space-x-2 mb-4">
                <MessageCircle className="h-8 w-8 text-green-400" />
                <span className="text-xl font-bold">WhatsAppBot.id</span>
              </div>
              <p className="text-gray-400">
                Solusi otomasi WhatsApp untuk bisnis Indonesia
              </p>
            </div>
            
            <div className="flex flex-wrap gap-6">
              <a href="/dashboard" className="text-gray-400 hover:text-white">
                Dashboard
              </a>
              <a href="/admin" className="text-gray-400 hover:text-white">
                Login Admin
              </a>
              <a href="/contact" className="text-gray-400 hover:text-white">
                Kontak
              </a>
              <a href="/terms" className="text-gray-400 hover:text-white">
                Syarat Layanan
              </a>
              <a href="/privacy" className="text-gray-400 hover:text-white">
                Privasi
              </a>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>© {new Date().getFullYear()} WhatsAppBot.id. All rights reserved.</p>
            <p className="mt-2 text-sm">
              WhatsApp adalah merek dagang terdaftar dari Meta Platforms, Inc.
              Pembayaran diproses melalui PayPal.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}