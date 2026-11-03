import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export type LegalTab = 'terms' | 'privacy';

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="font-medium text-gray-700 dark:text-gray-300">{children}</p>
);

const LegalModal = ({ tab, onTabChange, onClose }: { tab: LegalTab; onTabChange: (tab: LegalTab) => void; onClose: () => void }) => (
  <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tab === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 max-h-[85vh] overflow-y-auto no-scrollbar">
      <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => onTabChange('terms')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === 'terms' ? 'bg-emerald-600 text-white' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}>Terms & Conditions</button>
          <button onClick={() => onTabChange('privacy')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === 'privacy' ? 'bg-emerald-600 text-white' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}>Privacy Policy</button>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><X size={18} /></button>
      </div>
      <div className="px-6 py-5 space-y-4 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        {tab === 'terms' ? (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Terms & Conditions</p>
            <p>Last updated: February 2026</p>
            <p>By using SpekPlatz, you agree to these terms. SpekPlatz is a community platform for discovering and sharing hidden spots. It is provided as-is for personal, non-commercial use.</p>
            <Heading>Content Guidelines</Heading>
            <p>You are responsible for all content you submit. Do not post illegal content, private property locations without permission, dangerous or restricted areas, or content that violates others' privacy.</p>
            <Heading>Liability</Heading>
            <p>SpekPlatz is not responsible for the accuracy of user-submitted locations, safety conditions at any spot, or any harm arising from visiting spots listed on the platform. Always use your own judgment and respect local laws.</p>
            <Heading>Your Account</Heading>
            <p>Accounts are created with a nickname and password. You are responsible for keeping your credentials secure. We reserve the right to remove accounts or content that violates these terms.</p>
            <Heading>Changes</Heading>
            <p>We may update these terms at any time. Continued use of SpekPlatz after changes constitutes acceptance.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Privacy Policy</p>
            <p>Last updated: November 2026</p>
            <p>SpekPlatz takes your privacy seriously. Here's what we collect and how we use it.</p>
            <Heading>What We Collect</Heading>
            <p>When you create an account: your chosen nickname, avatar and the spots you save. Your password is handled by Firebase Authentication (Google) and is stored only in hashed form — we never see it. When you add spots or reviews: the content you submit, including any photos. Photos are resized and re-encoded in your browser before upload, which removes embedded metadata such as GPS coordinates.</p>
            <p>If you use SpekPlatz without an account, Firebase creates an anonymous session ID in your browser so that you can edit spots you added from it. Your location is used only in your browser when you tap "Use my location" or the locate button, and is never stored on our servers.</p>
            <Heading>How We Use It</Heading>
            <p>Your data is used solely to operate the SpekPlatz platform — displaying spots, reviews, and personalising your saved spots. We do not sell, share, or monetise your data. We do not use analytics or advertising trackers.</p>
            <Heading>Third-party Services</Heading>
            <p>To show the app, your browser loads content directly from these services, which see your IP address: Google Firebase (database and sign-in), OpenStreetMap (street map), Mapy.com (tourist map), Esri (satellite map) and DiceBear (avatars).</p>
            <Heading>Data Storage</Heading>
            <p>Data is stored in Google Firebase (Firestore). Your session and preferences are stored locally in your browser. Photos are stored inside Firestore documents.</p>
            <Heading>Your Rights</Heading>
            <p>You can delete your account at any time from your profile. Spots you created can be deleted from within the app; reviews can be removed on request.</p>
            <Heading>Contact</Heading>
            <p>For any privacy questions, reach out via the SpekPlatz GitHub page.</p>
          </>
        )}
      </div>
    </motion.div>
  </div>
);

export default LegalModal;
