// District display maps, extracted from lib/github so lightweight server
// contexts (OG images, share cards) can use them without pulling the full
// city-layout module (which imports the sponsor registry → three.js).

export const DISTRICT_NAMES: Record<string, string> = {
  downtown: 'Downtown',
  frontend: 'Frontend', backend: 'Backend', fullstack: 'Full Stack',
  mobile: 'Mobile', data_ai: 'Data & AI', devops: 'DevOps & Cloud',
  security: 'Security', gamedev: 'GameDev', vibe_coder: 'Vibe Coder',
  creator: 'Creator',
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#fbbf24',
  frontend: '#3b82f6', backend: '#ef4444', fullstack: '#a855f7',
  mobile: '#22c55e', data_ai: '#06b6d4', devops: '#f97316',
  security: '#dc2626', gamedev: '#ec4899', vibe_coder: '#8b5cf6',
  creator: '#eab308',
};
