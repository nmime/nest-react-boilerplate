export const crossBrowserProjects = [
  'chromium',
  'chromium-320',
  'firefox',
  'webkit',
  'mobile-chrome',
  'mobile-safari',
] as const;

export function installedBrowserForProject(project: string): string | null {
  if (project === 'chromium-320' || project === 'mobile-chrome') return 'chromium';
  if (project === 'mobile-safari') return 'webkit';
  return ['chromium', 'firefox', 'webkit'].includes(project) ? project : null;
}
