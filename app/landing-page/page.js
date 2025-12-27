// File: /app/landing-page/page.js
'use client';

import React, { useState } from 'react';
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
  Smartphone
} from 'lucide-react';

export default function LandingPage() {
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [groups, setGroups] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Pricing plans with WhatsApp message-based pricing
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
      ctaText: 'Mulai Gratis',
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
      ctaText: 'Mulai Sekarang',
      ctaColor: 'bg-green-600 hover:bg-green-700',
      popular: true
    },
    {
      id: 'business',
      name: 'Paket Bisnis',
      price: 'Rp 899.000',
      period: '/bulan',
      description: 'Solusi lengkap untuk perusahaan',
      features: [
        '25,000 pesan WhatsApp/bulan',
        'Grup tidak terbatas',
        'Bot AI premium',
        'Dukungan 24/7',
        'Analitik tingkat lanjut',
        'Custom integration',
        'Manajemen multi-user'
      ],
      ctaText: 'Hubungi Tim',
      ctaColor: 'bg-blue-600 hover:bg-blue-700',
      popular: false
    }
  ];

  // Payment methods available through Xendit
  const paymentMethods = [
    { name: 'QRIS', icon: 'qr' },
    { name: 'DANA', icon: 'wallet' },
    { name: 'OVO', icon: 'wallet' },
    { name: 'ShopeePay', icon: 'wallet' },
    { name: 'LinkAja', icon: 'wallet' },
    { name: 'Kartu Kredit', icon: 'card' },
    { name: 'Transfer Bank', icon: 'bank' },
    { name: 'Alfamart/Indomaret', icon: 'store' }
  ];

  const handleGetStarted = async () => {
    if (selectedPlan === 'free') {
      // Direct to free trial signup
      window.location.href = '/signup?plan=free';
    } else {
      // Process paid plan with Xendit
      setIsProcessing(true);
      
      try {
        // Prepare payment data
        const paymentData = {
          external_id: `whatsapp-bot-${Date.now()}`,
          amount: selectedPlan === 'pro' ? 299000 : 899000,
          description: `Paket ${selectedPlan === 'pro' ? 'Pro' : 'Bisnis'} - WhatsApp Bot`,
          customer: {
            given_names: 'Pelanggan',
            email: 'customer@example.com',
            mobile_number: phoneNumber
          },
          success_redirect_url: `${window.location.origin}/success`,
          failure_redirect_url: `${window.location.origin}/pricing`,
          currency: 'IDR',
          items: [{
            name: `Paket WhatsApp Bot ${selectedPlan === 'pro' ? 'Pro' : 'Bisnis'}`,
            quantity: 1,
            price: selectedPlan === 'pro' ? 299000 : 899000,
            category: 'Software'
          }],
          metadata: {
            phone_number: phoneNumber,
            groups: groups.split(',').map(g => g.trim()),
            plan: selectedPlan
          }
        };

        // Call backend to create Xendit payment link
        const response = await fetch('/api/create-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(paymentData)
        });

        const data = await response.json();
        
        if (data.invoice_url) {
          // Redirect to Xendit payment page
          window.location.href = data.invoice_url;
        } else {
          throw new Error('Payment link creation failed');
        }
      } catch (error) {
        console.error('Payment error:', error);
        alert('Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

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
            <a 
              href="/admin" 
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Login Admin
            </a>
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
        
        <div className="flex flex-col md:flex-row gap-4 max-w-2xl mx-auto mb-12">
          <input
            type="tel"
            placeholder="Nomor WhatsApp Anda (contoh: +628123456789)"
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <input
            type="text"
            placeholder="Nama grup (pisahkan dengan koma)"
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
          />
          <button
            onClick={handleGetStarted}
            disabled={isProcessing || !phoneNumber}
            className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isProcessing ? 'Memproses...' : 'Mulai Gratis'}
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
            <h3 className="text-xl font-semibold mb-4">Integrasi Mudah</h3>
            <p className="text-gray-600">
              Cukup scan QR code dan pilih grup. Tidak perlu instalasi rumit 
              atau konfigurasi teknis.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-6 py-16 bg-gray-50 rounded-2xl my-8">
        <h2 className="text-3xl font-bold text-center mb-4">Pilih Paket yang Tepat</h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Harga berdasarkan jumlah pesan WhatsApp yang dikirim. Mulai gratis, 
          bayar hanya setelah puas dengan hasilnya.
        </p>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingPlans.map((plan) => (
            <div 
              key={plan.id}
              className={`bg-white rounded-xl shadow-lg border-2 p-8 relative transition-transform hover:scale-[1.02] ${
                plan.popular 
                  ? 'border-green-500 shadow-green-100 transform scale-105' 
                  : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    PALING POPULER
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
                onClick={() => {
                  setSelectedPlan(plan.id);
                  document.getElementById('setup-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${plan.ctaColor}`}
              >
                {plan.ctaText}
              </button>
            </div>
          ))}
        </div>

        {/* Payment Methods */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold mb-6">Dukungan Pembayaran Lengkap</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {paymentMethods.map((method) => (
              <div 
                key={method.name} 
                className="bg-white px-4 py-2 rounded-lg border border-gray-200 flex items-center gap-2"
              >
                <span className="text-gray-700">{method.name}</span>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-sm mt-4">
            Didukung oleh Xendit • Transaksi aman & terenkripsi
          </p>
        </div>
      </section>

      {/* Setup Form */}
      <section id="setup-form" className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Siap Menggunakan Bot?</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-gray-700 mb-2">Paket yang Dipilih</label>
              <div className="flex flex-wrap gap-4">
                {pricingPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`px-6 py-3 rounded-lg border-2 transition-colors ${
                      selectedPlan === plan.id
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {plan.name} • {plan.price}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">
                  Nomor WhatsApp Anda <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="+628123456789"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-2">
                  Nama Grup WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={groups}
                  onChange={(e) => setGroups(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Grup Customer, Grup Internal, dll"
                  required
                />
                <p className="text-sm text-gray-500 mt-2">
                  Pisahkan dengan koma jika lebih dari satu grup
                </p>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 mb-2">
                Pilih Metode Pembayaran
              </label>
              <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Pilih metode pembayaran...</option>
                <option value="qris">QRIS (Semua E-Wallet)</option>
                <option value="dana">DANA</option>
                <option value="ovo">OVO</option>
                <option value="cc">Kartu Kredit/Debit</option>
                <option value="va">Transfer Bank (Virtual Account)</option>
              </select>
            </div>

            <button
              onClick={handleGetStarted}
              disabled={isProcessing || !phoneNumber || !groups}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Clock className="h-5 w-5 animate-spin" />
                  Memproses Pembayaran...
                </>
              ) : selectedPlan === 'free' ? (
                'Aktifkan Akun Gratis'
              ) : (
                'Lanjut ke Pembayaran'
              )}
            </button>

            <p className="text-center text-gray-500 text-sm">
              Dengan melanjutkan, Anda menyetujui{' '}
              <a href="/terms" className="text-green-600 hover:underline">
                Syarat & Ketentuan
              </a>{' '}
              dan{' '}
              <a href="/privacy" className="text-green-600 hover:underline">
                Kebijakan Privasi
              </a>{' '}
              kami
            </p>
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
              Bagaimana cara kerja bot WhatsApp ini?
            </h3>
            <p className="text-gray-600">
              Setelah registrasi dan pembayaran, kami akan mengirimkan nomor WhatsApp khusus 
              untuk bot Anda. Anda cukup mengundang nomor ini ke grup yang ingin diotomatisasi, 
              dan bot akan segera aktif dengan konfigurasi default atau kustom sesuai kebutuhan Anda.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-green-600" />
              Apakah ada biaya tersembunyi?
            </h3>
            <p className="text-gray-600">
              Tidak ada biaya tersembunyi. Hanya ada biaya transaksi per transaksi yang berhasil[citation:5]. 
              Anda hanya membayar sesuai paket yang dipilih. Biaya WhatsApp Business API 
              sudah termasuk dalam paket harga kami[citation:3].
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-green-600" />
              Berapa lama proses aktivasi setelah pembayaran?
            </h3>
            <p className="text-gray-600">
              Aktivasi instan! Setelah pembayaran berhasil diverifikasi melalui Xendit, 
              Anda akan langsung menerima detail akses bot dalam waktu 5-10 menit. 
              Proses pembayaran menggunakan webhook real-time untuk update status otomatis[citation:2].
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
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}