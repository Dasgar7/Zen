import React from "react";

export interface QuickActionButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  onClick: () => void;
  title?: string;
  activeAccentColor?: "green" | "default";
}

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  label,
  icon,
  isActive = false,
  onClick,
  title,
  activeAccentColor = "green",
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={`group px-3 py-1.5 rounded-full text-xs font-medium flex items-center space-x-1.5 transition-all duration-200 ease-out cursor-pointer border select-none ${
        isActive
          ? activeAccentColor === "green"
            ? "bg-[#48A04C]/15 dark:bg-[#48A04C]/25 text-[#48A04C] dark:text-[#52b857] border-[#48A04C]/40 font-semibold shadow-2xs"
            : "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600 font-semibold"
          : "bg-transparent border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-zinc-200/80 dark:hover:border-zinc-700/60 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      <span
        className={`shrink-0 transition-colors duration-200 ${
          isActive
            ? activeAccentColor === "green"
              ? "text-[#48A04C] dark:text-[#52b857]"
              : "text-zinc-900 dark:text-white"
            : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
};
