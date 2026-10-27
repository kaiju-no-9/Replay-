import React, { useState } from 'react';
import { Bot } from 'lucide-react';

const ICONS: Record<string, { file: string; label: string; fallback: string }> = {
  codex: { file: 'codex-color.svg', label: 'OpenAI Codex', fallback: 'Cx' },
  claude: { file: 'claudecode-color.svg', label: 'Claude Code', fallback: 'Cl' },
  opencode: { file: 'opencode.svg', label: 'OpenCode', fallback: 'Oc' },
  antigravity: { file: 'antigravity-color.svg', label: 'Google Antigravity', fallback: 'Ag' },
  agy: { file: 'antigravity-color.svg', label: 'Google Antigravity', fallback: 'Ag' },
  gemini: { file: 'geminicli.svg', label: 'Gemini CLI', fallback: 'Ge' },
  copilot: { file: 'githubcopilot.svg', label: 'GitHub Copilot CLI', fallback: 'Co' },
  hermes: { file: 'hermesagent.svg', label: 'Hermes Agent', fallback: 'He' },
  openclaw: { file: 'openclaw-color.svg', label: 'OpenClaw', fallback: 'Oc' },
};

const ICON_BASE_URL = 'https://unpkg.com/@lobehub/icons-static-svg@1.97.0/icons';
const LIGHT_LOGO_TILES = new Set(['opencode', 'hermes', 'copilot', 'gemini']);

export const AgentIcon: React.FC<{
  agentId: string;
  className?: string;
  src?: string | null;
  alt?: string;
  decorative?: boolean;
}> = ({ agentId, className = 'w-4 h-4', src, alt, decorative = false }) => {
  const icon = ICONS[agentId.toLowerCase()];
  const needsLightTile = LIGHT_LOGO_TILES.has(agentId.toLowerCase());
  const [failed, setFailed] = useState(false);
  const imageSrc = src ?? (icon ? `${ICON_BASE_URL}/${icon.file}` : null);

  if (!imageSrc || failed) {
    return (
      <span
        aria-label={decorative ? undefined : icon?.label ?? agentId}
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : 'img'}
        className={`inline-flex shrink-0 items-center justify-center rounded-sm bg-neutral-800 text-[9px] font-semibold leading-none text-neutral-200 ${className}`}
      >
        {icon?.fallback ?? <Bot className="h-3/4 w-3/4" />}
      </span>
    );
  }

  const image = (
    <img
      src={imageSrc}
      alt={decorative ? '' : alt ?? icon?.label ?? agentId}
      aria-hidden={decorative || undefined}
      className={
        needsLightTile
          ? 'h-full w-full object-contain'
          : `shrink-0 object-contain ${className}`
      }
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );

  return needsLightTile ? (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm bg-white p-0.5 ${className}`}
    >
      {image}
    </span>
  ) : image;
};
