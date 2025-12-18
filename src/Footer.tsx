import React from "react";
import "./Footer.css";
import {
  LiaDiscord,
  LiaGithub,
  LiaNpm,
  LiaReddit,
  LiaTelegramPlane,
} from "react-icons/lia";
import { FaSquareXTwitter } from "react-icons/fa6";

export function Footer() {
  return (
    <footer className="rebel-footer">
      <div className="rebel-footer__meta">
        <p className="rebel-footer__title">Neurai Webwallet &copy; 2025</p>

        <nav className="rebel-footer__social" aria-label="Neurai social links">
          <a
            className="rebel-footer__social-link"
            href="https://twitter.com/neuraiproject"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on X (Twitter)"
            title="X (Twitter)"
          >
            <FaSquareXTwitter />
          </a>
          <a
            className="rebel-footer__social-link"
            href="https://t.me/neuraiproject"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on Telegram"
            title="Telegram"
          >
            <LiaTelegramPlane />
          </a>
          <a
            className="rebel-footer__social-link"
            href="https://discord.gg/neurai-project-1062678996208336896"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on Discord"
            title="Discord"
          >
            <LiaDiscord />
          </a>
          <a
            className="rebel-footer__social-link"
            href="https://www.reddit.com/r/neuraiproject"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on Reddit"
            title="Reddit"
          >
            <LiaReddit />
          </a>
          <a
            className="rebel-footer__social-link"
            href="https://github.com/neuraiproject"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on GitHub"
            title="GitHub"
          >
            <LiaGithub />
          </a>
          <a
            className="rebel-footer__social-link"
            href="https://www.npmjs.com/~neuraiproject"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Neurai on npm"
            title="npm"
          >
            <LiaNpm />
          </a>
        </nav>
      </div>
    </footer>
  );
}
