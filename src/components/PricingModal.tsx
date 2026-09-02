import React, { useState } from 'react';
import { X, Check, Sparkles, Shield, Zap, HelpCircle } from 'lucide-react';
import { auth } from '../lib/firebase';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userId?: string;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, userEmail = 'user@zen.ai', userId = 'zen_user_1' }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showSupportInfo, setShowSupportInfo] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async (planKey: string) => {
    try {
      setLoadingPlan(planKey);
      setCheckoutError(null);
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/lemon/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planKey,
          billingCycle,
          userId,
          userEmail,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCheckoutError(data.error || 'Unable to initialize Lemon Squeezy checkout.');
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError('Lemon Squeezy returned no checkout URL.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError('Network error connecting to Lemon Squeezy.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl text-zinc-100 p-6 sm:p-8">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-[#48A04C]/10 text-[#48A04C]">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Upgrade Your Zen Experience</h2>
            </div>
            <p className="text-sm text-zinc-400 mt-1">Choose the plan that fits your workflow. Powered securely by Lemon Squeezy (MoR).</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
            aria-label="Close pricing modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {checkoutError && (
          <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {checkoutError}
          </div>
        )}

        {/* Billing Toggle */}
        <div className="flex justify-center my-6">
          <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-[#48A04C] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-[#48A04C] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Yearly Billing</span>
              <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-bold text-white uppercase tracking-wider">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
          
          {/* Free Tier */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-700 transition-all">
            <div>
              <div className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Free</div>
              <div className="mt-3 flex items-baseline">
                <span className="text-3xl font-extrabold text-white">$0</span>
                <span className="ml-1 text-sm text-zinc-400">/mo</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Essential AI chat for daily casual assistance.</p>
              
              <ul className="mt-6 space-y-3 text-xs text-zinc-300">
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Standard AI models & memory
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Web search & voice input
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Basic media generation
                </li>
              </ul>
            </div>
            <button
              onClick={onClose}
              className="mt-8 w-full py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Current Plan
            </button>
          </div>

          {/* Pro Tier */}
          <div className="bg-zinc-900 border-2 border-[#48A04C] rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-[#48A04C]/5">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#48A04C] text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
              Most Popular
            </div>
            <div>
              <div className="text-sm font-semibold text-[#48A04C] uppercase tracking-wider">Zen Pro</div>
              <div className="mt-3 flex items-baseline">
                <span className="text-3xl font-extrabold text-white">
                  ${billingCycle === 'yearly' ? '5.60' : '7'}
                </span>
                <span className="ml-1 text-sm text-zinc-400">/mo</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Advanced models, coding tools, and higher generation limits.</p>
              
              <ul className="mt-6 space-y-3 text-xs text-zinc-200">
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Everything in Free
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Advanced Web Dev & Fix-a-Bug agent
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  High-speed image & video generation
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-[#48A04C] mr-2 shrink-0" />
                  Priority response queues
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleSubscribe('pro')}
              disabled={loadingPlan === 'pro'}
              className="mt-8 w-full py-2.5 rounded-xl bg-[#48A04C] hover:bg-[#3d8640] text-white text-xs font-semibold transition-colors shadow-md shadow-[#48A04C]/20 cursor-pointer flex items-center justify-center space-x-2"
            >
              {loadingPlan === 'pro' ? (
                <span>Connecting to Lemon Squeezy...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Upgrade to Pro</span>
                </>
              )}
            </button>
          </div>

          {/* Ultra Tier */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between hover:border-zinc-700 transition-all">
            <div>
              <div className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Zen Ultra</div>
              <div className="mt-3 flex items-baseline">
                <span className="text-3xl font-extrabold text-white">
                  ${billingCycle === 'yearly' ? '56' : '70'}
                </span>
                <span className="ml-1 text-sm text-zinc-400">/mo</span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Unlimited power and enterprise priority for professionals.</p>
              
              <ul className="mt-6 space-y-3 text-xs text-zinc-300">
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-purple-400 mr-2 shrink-0" />
                  Everything in Pro
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-purple-400 mr-2 shrink-0" />
                  Unlimited deep reasoning & developer mode
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-purple-400 mr-2 shrink-0" />
                  Dedicated priority instances
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 text-purple-400 mr-2 shrink-0" />
                  Direct Payoneer/Wise payout support
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleSubscribe('ultra')}
              disabled={loadingPlan === 'ultra'}
              className="mt-8 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-2 shadow-md shadow-purple-600/20"
            >
              {loadingPlan === 'ultra' ? (
                <span>Connecting to Lemon Squeezy...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Upgrade to Ultra</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Footer info */}
        <div className="mt-6 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-[#48A04C]" />
            <span>Secure checkout powered by Lemon Squeezy. Cancel anytime from your account settings.</span>
          </div>
          <button
            onClick={() => setShowSupportInfo(!showSupportInfo)}
            className="mt-2 sm:mt-0 flex items-center space-x-1 text-[#48A04C] hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Payout & Region Info</span>
          </button>
        </div>

        {showSupportInfo && (
          <div className="mt-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-2">
            <p className="font-semibold text-white">Merchant of Record & Payouts Notice:</p>
            <p>
              Lemon Squeezy acts as the Merchant of Record, handling all global sales tax, VAT, invoicing, and compliance. Payouts are fully supported worldwide (including Armenia) via Payoneer, Wise, or direct wire transfers.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
