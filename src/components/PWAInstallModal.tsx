import React from 'react';
import { Download, Share2, Plus, X, Smartphone } from 'lucide-react';
import { GenexLogo } from './GenexLogo';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isIOS: boolean;
  install: () => Promise<boolean>;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isInstallable,
  isIOS,
  install,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4 shadow-sm">
            <GenexLogo className="w-10 h-10" />
          </div>

          <h3 className="text-lg font-bold">Install Zen App</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">
            Install Zen on your home screen for quick access, full offline support, and a distraction-free standalone experience.
          </p>

          {isInstallable && (
            <button
              onClick={async () => {
                const res = await install();
                if (res) onClose();
              }}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[#48A04C] hover:bg-[#3E8A42] py-3 text-sm font-semibold text-white shadow-md transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Install on Device
            </button>
          )}

          {isIOS && (
            <div className="mt-5 w-full space-y-3 text-left bg-zinc-50 dark:bg-zinc-800/60 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#48A04C]" />
                How to install on iPhone & iPad:
              </p>
              <ol className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 pl-1">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#48A04C]">1.</span>
                  <span>Tap the <strong>Share</strong> button <Share2 className="inline w-3.5 h-3.5 mx-0.5 text-blue-500" /> in the Safari toolbar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#48A04C]">2.</span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong> <Plus className="inline w-3.5 h-3.5 mx-0.5" />.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#48A04C]">3.</span>
                  <span>Tap <strong>Add</strong> in the top-right corner.</span>
                </li>
              </ol>
            </div>
          )}

          {!isInstallable && !isIOS && (
            <div className="mt-5 w-full text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/60 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-left">
              To install on Chrome or Edge, click the install icon in the address bar (or Menu &rarr; "Install Zen").
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
