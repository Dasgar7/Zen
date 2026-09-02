import React from "react";
// @ts-ignore
import logoImg from "../assets/images/user_logo.png";

interface GenexLogoProps {
  className?: string;
}

export const GenexLogo: React.FC<GenexLogoProps> = ({ className = "w-6 h-6" }) => {
  return (
    <div className={`${className} rounded-full overflow-hidden flex items-center justify-center bg-transparent shrink-0 relative`}>
      <img
        src={logoImg}
        alt="Zen Logo"
        className="w-[102%] h-[102%] object-cover scale-[1.03]"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};
