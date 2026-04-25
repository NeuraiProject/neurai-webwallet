import React from "react";
import {
  LiaDiscord,
  LiaGithub,
  LiaNpm,
  LiaReddit,
  LiaTelegramPlane,
} from "react-icons/lia";
import { FaSquareXTwitter } from "react-icons/fa6";

const SOCIAL_LINKS: { href: string; label: string; title: string; Icon: React.ComponentType }[] = [
  {
    href: "https://twitter.com/neuraiproject",
    label: "Neurai on X (Twitter)",
    title: "X (Twitter)",
    Icon: FaSquareXTwitter,
  },
  {
    href: "https://t.me/neuraiproject",
    label: "Neurai on Telegram",
    title: "Telegram",
    Icon: LiaTelegramPlane,
  },
  {
    href: "https://discord.gg/neurai-project-1062678996208336896",
    label: "Neurai on Discord",
    title: "Discord",
    Icon: LiaDiscord,
  },
  {
    href: "https://www.reddit.com/r/neuraiproject",
    label: "Neurai on Reddit",
    title: "Reddit",
    Icon: LiaReddit,
  },
  {
    href: "https://github.com/neuraiproject",
    label: "Neurai on GitHub",
    title: "GitHub",
    Icon: LiaGithub,
  },
  {
    href: "https://www.npmjs.com/~neuraiproject",
    label: "Neurai on npm",
    title: "npm",
    Icon: LiaNpm,
  },
];

export function Footer() {
  return (
    <footer className="mt-auto pt-8 border-t border-base-300/60">
      <div className="text-center max-w-7xl mx-auto">
        <p className="m-0 text-sm font-semibold uppercase tracking-widest text-base-content/70">
          Neurai Webwallet &copy; 2025
        </p>

        <nav className="mt-5 flex items-center justify-center gap-5 flex-wrap sm:flex-nowrap" aria-label="Neurai social links">
          {SOCIAL_LINKS.map(({ href, label, title, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={title}
              className="inline-flex items-center justify-center w-10 h-10 text-base-content/70 hover:text-primary hover:-translate-y-0.5 transition-all [&_svg]:w-8 [&_svg]:h-8"
            >
              <Icon />
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
