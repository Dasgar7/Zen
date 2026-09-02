import React from "react";
import { Wand2, Code2 } from "lucide-react";

export interface PrimaryActionPillsProps {
  isCreateMediaMode: boolean;
  isWebDevMode: boolean;
  onToggleCreate: () => void;
  onToggleWebDev: () => void;
}

/**
 * Primary action pills under the chat input.
 * Only two options: Design (image/video) and Web Dev.
 * Sized as clear primary actions (larger padding + text).
 */
export const PrimaryActionPills: React.FC<PrimaryActionPillsProps> = ({
  isCreateMediaMode,
  isWebDevMode,
  onToggleCreate,
  onToggleWebDev,
}) => {
  return (
    <div className="flex items-center justify-center flex-wrap gap-3 mt-4 select-none">
      <button
        type="button"
        onClick={onToggleCreate}
        className={`px-5 py-2.5 rounded-full text-sm font-semibold flex items-center space-x-2 transition-all duration-200 cursor-pointer border shadow-sm ${
          isCreateMediaMode
            ? "bg-purple-500/15 dark:bg-purple-500/25 text-purple-600 dark:text-purple-300 border-purple-500/50"
            : "bg-white/90 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
        }`}
        title="Toggle Design Mode (image & video generation)"
      >
        <Wand2
          className={`w-4.5 h-4.5 ${
            isCreateMediaMode ? "text-purple-500 dark:text-purple-300" : "text-purple-500"
          }`}
        />
        <span>Design</span>
      </button>

      <button
        type="button"
        onClick={onToggleWebDev}
        className={`px-5 py-2.5 rounded-full text-sm font-semibold flex items-center space-x-2 transition-all duration-200 cursor-pointer border shadow-sm ${
          isWebDevMode
            ? "bg-[#48A04C]/15 dark:bg-[#48A04C]/25 text-[#48A04C] dark:text-[#52b857] border-[#48A04C]/50"
            : "bg-white/90 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
        }`}
        title="Toggle Web Dev Mode"
      >
        <Code2
          className={`w-4.5 h-4.5 ${
            isWebDevMode ? "text-[#48A04C] dark:text-[#52b857]" : "text-emerald-500"
          }`}
        />
        <span>Web Dev</span>
      </button>
    </div>
  );
};
