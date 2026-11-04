import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export type LegalTab = 'terms' | 'privacy';

const ISSUES_URL = 'https://github.com/sokiicz/SpekPlatz/issues';
const CONTACT_EMAIL = 'contactme@resonantlabs.online';

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="font-medium text-gray-700 dark:text-gray-300">{children}</p>
);

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-700 dark:text-emerald-400 underline">{children}</a>
);

// mailto: opens the mail app; a new tab would stay blank in some browsers.
const MailLink = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 dark:text-emerald-400 underline">{CONTACT_EMAIL}</a>
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
            <p>Last updated: November 2026</p>
            <p>By using SpekPlatz, you agree to these terms. SpekPlatz is a community platform for discovering and sharing hidden spots, run by Resonant Labs. It is provided as-is for personal, non-commercial use.</p>
            <Heading>Content Guidelines</Heading>
            <p>You are responsible for all content you submit. Do not post illegal content, private property locations without permission, dangerous or restricted areas, or content that violates others' privacy.</p>
            <p>You keep the rights to the photos and texts you post. By posting them, you allow SpekPlatz to show them publicly in the app.</p>
            <Heading>Reporting</Heading>
            <p>To report a spot, photo or review (illegal content, private property, a dangerous place, someone's privacy), use "Report this spot" in the spot detail or open an issue at <ExternalLink href={ISSUES_URL}>github.com/sokiicz/SpekPlatz/issues</ExternalLink> with the spot name. Opening an issue needs a free GitHub account, and issues are public. To report privately, email <MailLink />. We review reports and remove what breaks these terms.</p>
            <Heading>Liability</Heading>
            <p>SpekPlatz is not responsible for the accuracy of user-submitted locations, safety conditions at any spot, or any harm arising from visiting spots listed on the platform. Always use your own judgment and respect local laws.</p>
            <Heading>Your Account</Heading>
            <p>You must be at least 16 years old to create an account. Accounts are created with a nickname and password. You are responsible for keeping your credentials secure. We reserve the right to remove accounts or content that violates these terms.</p>
            <Heading>Changes</Heading>
            <p>We may update these terms at any time. Continued use of SpekPlatz after changes constitutes acceptance.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Privacy Policy</p>
            <p>Last updated: November 2026</p>
            <p>SpekPlatz takes your privacy seriously. Here's what we collect and how we use it.</p>
            <Heading>What We Collect</Heading>
            <p>When you create an account: your chosen nickname, avatar and the spots you save. Your password is handled by Firebase Authentication (Google) and is stored only in hashed form — we never see it. When you add spots or reviews: the content you submit, including any photos. Photos are resized and re-encoded in your browser before upload, which removes embedded metadata such as GPS coordinates. Photos uploaded before 4 November 2026 may still contain metadata; contact us to have them removed.</p>
            <p>Spots, reviews, photos and the nickname shown with them are public: anyone can see them, with or without an account.</p>
            <p>If you add a spot or review without an account, Firebase creates an anonymous session ID in your browser so that you can edit spots you added from it. If you later create an account in the same browser, those spots move to it. If you sign in to an existing account instead, or clear your browser data, you can no longer edit them from the app; contact us to change or remove them. Spots added without an account before 4 November 2026 cannot be edited from the app either.</p>
            <p>Your location is used in your browser to show where you are on the map and your distance to spots; it is not sent to us. If you choose "Use my location" when adding a spot, those coordinates are saved as the spot's position and are visible to everyone.</p>
            <Heading>How We Use It</Heading>
            <p>Your data is used solely to operate the SpekPlatz platform — displaying spots, reviews, and personalising your saved spots. We do not sell your data and do not share it for advertising. We do not use analytics or advertising trackers.</p>
            <Heading>Third-party Services</Heading>
            <p>To show the app, your browser loads content directly from these services, which see your IP address: Google Firebase (database and sign-in), OpenStreetMap (street map), Mapy.com (tourist map), Esri (satellite map) and DiceBear (avatars; it also receives the nickname shown next to a review, because the picture is generated from it).</p>
            <p>Links to other sites (Google Maps directions, GitHub for reports, Buy Me a Coffee, Mapy.com, Resonant Labs) are governed by their own policies.</p>
            <Heading>Data Storage</Heading>
            <p>Data is stored in Google Firebase (Firestore). Your session and preferences are stored locally in your browser. Photos are stored inside Firestore documents.</p>
            <Heading>Your Rights</Heading>
            <p>You can delete your account at any time from your profile. Deleting your account removes your login and profile (nickname, avatar, saved spots). Spots and reviews you posted stay on the map, and your nickname stays on the reviews you wrote, so delete your spots first if you want them gone. If you can no longer sign in (or cleared your browser data), contact us and we will remove them. Reviews can be removed on request.</p>
            <Heading>Contact</Heading>
            <p>SpekPlatz is run by Resonant Labs. For privacy questions and removal requests, email <MailLink /> or open an issue at <ExternalLink href={ISSUES_URL}>github.com/sokiicz/SpekPlatz/issues</ExternalLink>. Opening an issue needs a free GitHub account. Issues are public, so please don't include personal details beyond what we need to find the content; use email for anything private.</p>
          </>
        )}
      </div>
    </motion.div>
  </div>
);

export default LegalModal;
