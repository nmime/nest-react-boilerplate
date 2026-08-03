import {
  ChartLine,
  ChevronDown,
  ChevronRight,
  FileText,
  Flag,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Send,
  Settings,
  Shield,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { observer, useI18n, useOptionalRootStore } from '@app/frontend-runtime';
import { LanguageSwitcher, ThemeSwitcher } from '../component/switchers';
import { cn } from '../util/cn';

export type UiAdminConsoleIcon =
  | 'analytics'
  | 'audit'
  | 'broadcasts'
  | 'dashboard'
  | 'feature-flags'
  | 'logout'
  | 'messaging'
  | 'profile'
  | 'roles'
  | 'segments'
  | 'settings'
  | 'templates'
  | 'users';

const navigationIcons = {
  analytics: ChartLine,
  audit: ScrollText,
  broadcasts: Send,
  dashboard: LayoutDashboard,
  'feature-flags': Flag,
  logout: LogOut,
  messaging: Send,
  profile: UserRound,
  roles: Shield,
  segments: ListFilter,
  settings: Settings,
  templates: FileText,
  users: Users,
} as const;

export interface UiAdminConsoleNavItem {
  children?: readonly UiAdminConsoleNavItem[];
  detail?: string;
  disabled?: boolean;
  group?: string;
  href?: string;
  icon?: UiAdminConsoleIcon;
  id?: string;
  isCurrent?: boolean;
  label: string;
  meta?: ReactNode;
  onSelect?: () => void;
  tone?: 'default' | 'warning';
}

export interface UiAdminConsoleBreadcrumbItem {
  href?: string;
  label: string;
}

export interface UiAdminConsoleProps {
  appName: string;
  brandDescription?: string;
  brandHref: string;
  brandMark?: string;
  breadcrumbLabel: string;
  breadcrumbs?: readonly UiAdminConsoleBreadcrumbItem[];
  children: ReactNode;
  className?: string;
  collapseNavigationLabel: string;
  closeNavigationLabel: string;
  contentLabel: string;
  expandNavigationLabel: string;
  headerTrailing?: ReactNode;
  menuLabel: string;
  navigationLabel: string;
  navItems: readonly UiAdminConsoleNavItem[];
  skipLinkLabel: string;
}

interface NavigationGroup {
  items: UiAdminConsoleNavItem[];
  label?: string;
}

const getNavigationItemKey = (item: UiAdminConsoleNavItem, parentKey: string, index: number): string =>
  `${parentKey}-${item.id ?? item.href ?? item.label}-${index}`;

const getNavigationRegionId = (key: string): string => `xr-admin-nav-${key.replace(/[^a-z0-9_-]/giu, '-')}`;

const isNavigationItemCurrent = (item: UiAdminConsoleNavItem): boolean =>
  Boolean(item.isCurrent || item.children?.some((child) => isNavigationItemCurrent(child)));

const getBrandMark = (appName: string, locale: string): string => {
  const mark = appName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toLocaleUpperCase(locale);

  return mark || 'A';
};

const groupNavigation = (items: readonly UiAdminConsoleNavItem[]): NavigationGroup[] => {
  const groups: NavigationGroup[] = [];

  items.forEach((item) => {
    const existing = groups.find((group) => group.label === item.group);

    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.push({
      ...(item.group ? { label: item.group } : {}),
      items: [item],
    });
  });

  return groups;
};

const getCurrentBranchKeysInItems = (items: readonly UiAdminConsoleNavItem[], parentKey: string): string[] =>
  items.flatMap((item, index) => {
    const itemKey = getNavigationItemKey(item, parentKey, index);
    const children = item.children ?? [];

    if (children.length === 0) {
      return [];
    }

    const nestedCurrentBranches = getCurrentBranchKeysInItems(children, itemKey);
    return isNavigationItemCurrent(item) ? [itemKey, ...nestedCurrentBranches] : nestedCurrentBranches;
  });

const getCurrentBranchKeys = (items: readonly UiAdminConsoleNavItem[]): string[] =>
  groupNavigation(items).flatMap((group, groupIndex) =>
    getCurrentBranchKeysInItems(group.items, `group-${groupIndex}`),
  );

interface NavigationItemCopyProps {
  hasChildren: boolean;
  icon: ReactNode;
  isExpanded: boolean;
  item: UiAdminConsoleNavItem;
}

const NavigationItemCopy = ({ hasChildren, icon, isExpanded, item }: Readonly<NavigationItemCopyProps>) => (
  <>
    {icon}
    <span aria-hidden="true" className="xr-admin-console__nav-indicator" />
    <span className="xr-admin-console__nav-copy">
      <span className="xr-admin-console__nav-label">{item.label}</span>
      {item.detail ? <small>{item.detail}</small> : null}
    </span>
    {item.meta ? <span className="xr-admin-console__nav-meta">{item.meta}</span> : null}
    {hasChildren ? (
      <span aria-hidden="true" className="xr-admin-console__nav-toggle">
        {isExpanded ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronRight size={16} strokeWidth={2.2} />}
      </span>
    ) : null}
  </>
);

interface NavigationItemBranchProps {
  children: ReactNode;
  className: string;
  hasIcon: boolean;
  isCurrent: boolean;
  isExpanded: boolean;
  isSidebarCollapsed: boolean;
  item: UiAdminConsoleNavItem;
  itemKey: string;
  navigationContent: ReactNode;
  onToggle: (itemKey: string) => void;
  depth: number;
}

const NavigationItemBranch = ({
  children,
  className,
  depth,
  hasIcon,
  isCurrent,
  isExpanded,
  isSidebarCollapsed,
  item,
  itemKey,
  navigationContent,
  onToggle,
}: Readonly<NavigationItemBranchProps>) => {
  const regionId = getNavigationRegionId(itemKey);

  return (
    <div
      className="xr-admin-console__nav-branch"
      data-current={isCurrent ? 'true' : 'false'}
      data-depth={depth}
      data-expanded={isExpanded ? 'true' : 'false'}
    >
      <button
        aria-controls={regionId}
        aria-expanded={isExpanded}
        aria-label={item.label}
        className={className}
        data-current={isCurrent ? 'true' : 'false'}
        data-has-icon={hasIcon ? 'true' : 'false'}
        data-tone={item.tone ?? 'default'}
        onClick={() => {
          onToggle(itemKey);
        }}
        title={isSidebarCollapsed ? item.label : undefined}
        type="button"
      >
        {navigationContent}
      </button>
      <div className="xr-admin-console__nav-children" hidden={!isExpanded} id={regionId}>
        {children}
      </div>
    </div>
  );
};

interface NavigationItemLinkProps {
  className: string;
  hasIcon: boolean;
  isCurrent: boolean;
  isSidebarCollapsed: boolean;
  item: UiAdminConsoleNavItem;
  mode: 'desktop' | 'mobile';
  navigationContent: ReactNode;
  onMobileSelect: () => void;
}

const NavigationItemLink = ({
  className,
  hasIcon,
  isCurrent,
  isSidebarCollapsed,
  item,
  mode,
  navigationContent,
  onMobileSelect,
}: Readonly<NavigationItemLinkProps>) => (
  <a
    aria-current={item.isCurrent ? 'page' : undefined}
    aria-disabled={item.disabled || undefined}
    aria-label={item.label}
    className={className}
    data-current={isCurrent ? 'true' : 'false'}
    data-has-icon={hasIcon ? 'true' : 'false'}
    data-tone={item.tone ?? 'default'}
    href={item.href}
    onClick={(event) => {
      if (item.disabled) {
        event.preventDefault();
        return;
      }
      if (mode === 'mobile') {
        onMobileSelect();
      }
    }}
    title={isSidebarCollapsed ? item.label : undefined}
  >
    {navigationContent}
  </a>
);

interface NavigationItemButtonProps {
  className: string;
  hasIcon: boolean;
  isCurrent: boolean;
  isSidebarCollapsed: boolean;
  item: UiAdminConsoleNavItem;
  mode: 'desktop' | 'mobile';
  navigationContent: ReactNode;
  onMobileSelect: () => void;
}

const NavigationItemButton = ({
  className,
  hasIcon,
  isCurrent,
  isSidebarCollapsed,
  item,
  mode,
  navigationContent,
  onMobileSelect,
}: Readonly<NavigationItemButtonProps>) => (
  <button
    aria-label={item.label}
    className={className}
    data-current={isCurrent ? 'true' : 'false'}
    data-has-icon={hasIcon ? 'true' : 'false'}
    data-tone={item.tone ?? 'default'}
    disabled={item.disabled}
    onClick={() => {
      item.onSelect?.();
      if (mode === 'mobile') {
        onMobileSelect();
      }
    }}
    title={isSidebarCollapsed ? item.label : undefined}
    type="button"
  >
    {navigationContent}
  </button>
);

export const UiAdminConsole = observer(function UiAdminConsole({
  appName,
  brandDescription,
  brandHref,
  brandMark,
  breadcrumbLabel,
  breadcrumbs = [],
  children,
  className,
  collapseNavigationLabel,
  closeNavigationLabel,
  contentLabel,
  expandNavigationLabel,
  headerTrailing,
  menuLabel,
  navigationLabel,
  navItems,
  skipLinkLabel,
}: Readonly<UiAdminConsoleProps>) {
  const { locale } = useI18n();
  const uiStore = useOptionalRootStore()?.ui;
  const [isNavigationOpen, setNavigationOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedNavigationItems, setExpandedNavigationItems] = useState<string[]>(() =>
    getCurrentBranchKeys(navItems),
  );
  const resolvedBrandMark = brandMark ?? getBrandMark(appName, locale);
  const groups = groupNavigation(navItems);
  const currentBranchKeys = useMemo(() => getCurrentBranchKeys(navItems), [navItems]);

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    uiStore?.setSidebarOpen(false);
  }, [uiStore]);
  const openNavigation = useCallback(() => {
    setNavigationOpen(true);
    uiStore?.setSidebarOpen(true);
  }, [uiStore]);
  const toggleNavigationItem = useCallback((itemKey: string) => {
    setExpandedNavigationItems((current) =>
      current.includes(itemKey) ? current.filter((key) => key !== itemKey) : [...current, itemKey],
    );
  }, []);

  useEffect(() => {
    setExpandedNavigationItems((current) => [...new Set([...current, ...currentBranchKeys])]);
  }, [currentBranchKeys]);

  useEffect(() => {
    if (!isNavigationOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeNavigation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeNavigation, isNavigationOpen]);

  const renderNavigationItem = (
    item: UiAdminConsoleNavItem,
    itemKey: string,
    depth: number,
    mode: 'desktop' | 'mobile',
  ): ReactNode => {
    const children = item.children ?? [];
    const hasChildren = children.length > 0;
    const isCurrent = isNavigationItemCurrent(item);
    const isExpanded = hasChildren && expandedNavigationItems.includes(itemKey);
    const NavigationIcon = item.icon ? navigationIcons[item.icon] : undefined;
    const className = cn('xr-admin-console__nav-link', hasChildren && 'xr-admin-console__nav-link--branch');
    const navigationIcon = NavigationIcon ? (
      <span aria-hidden="true" className="xr-admin-console__nav-icon">
        <NavigationIcon size={18} strokeWidth={2} />
      </span>
    ) : null;
    const navigationContent = (
      <NavigationItemCopy hasChildren={hasChildren} icon={navigationIcon} isExpanded={isExpanded} item={item} />
    );

    if (hasChildren) {
      return (
        <NavigationItemBranch
          className={className}
          depth={depth}
          hasIcon={Boolean(NavigationIcon)}
          isCurrent={isCurrent}
          isExpanded={isExpanded}
          isSidebarCollapsed={isSidebarCollapsed}
          item={item}
          itemKey={itemKey}
          key={itemKey}
          navigationContent={navigationContent}
          onToggle={toggleNavigationItem}
        >
          {children.map((child, index) =>
            renderNavigationItem(child, getNavigationItemKey(child, itemKey, index), depth + 1, mode),
          )}
        </NavigationItemBranch>
      );
    }

    if (item.href) {
      return (
        <NavigationItemLink
          className={className}
          key={itemKey}
          hasIcon={Boolean(NavigationIcon)}
          isCurrent={isCurrent}
          isSidebarCollapsed={isSidebarCollapsed}
          item={item}
          mode={mode}
          navigationContent={navigationContent}
          onMobileSelect={closeNavigation}
        />
      );
    }

    return (
      <NavigationItemButton
        className={className}
        key={itemKey}
        hasIcon={Boolean(NavigationIcon)}
        isCurrent={isCurrent}
        isSidebarCollapsed={isSidebarCollapsed}
        item={item}
        mode={mode}
        navigationContent={navigationContent}
        onMobileSelect={closeNavigation}
      />
    );
  };

  const renderNavigation = (mode: 'desktop' | 'mobile') => (
    <nav aria-label={navigationLabel} className="xr-admin-console__nav" data-mode={mode}>
      {groups.map((group, groupIndex) => (
        <div className="xr-admin-console__nav-group" key={`${group.label ?? 'root'}-${groupIndex}`}>
          {group.label ? <p className="xr-admin-console__nav-group-label">{group.label}</p> : null}
          <div className="xr-admin-console__nav-list">
            {group.items.map((item, index) =>
              renderNavigationItem(item, getNavigationItemKey(item, `group-${groupIndex}`, index), 0, mode),
            )}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <a className="xr-skip-link" href="#xr-content">
        {skipLinkLabel}
      </a>
      <div
        className={cn('xr-admin-console', className)}
        data-sidebar-collapsed={isSidebarCollapsed ? 'true' : 'false'}
        data-sidebar-open={isNavigationOpen}
        data-theme={uiStore?.resolvedTheme ?? 'light'}
        data-theme-preference={uiStore?.theme ?? 'system'}
      >
        <aside className="xr-admin-console__sidebar">
          <a aria-label={appName} className="xr-admin-console__brand" href={brandHref}>
            <span aria-hidden="true" className="xr-admin-console__brand-mark">
              {resolvedBrandMark}
            </span>
            <span className="xr-admin-console__brand-copy">
              <strong>{appName}</strong>
              {brandDescription ? <small>{brandDescription}</small> : null}
            </span>
          </a>
          {renderNavigation('desktop')}
          <div className="xr-admin-console__sidebar-footer">
            <button
              aria-label={isSidebarCollapsed ? expandNavigationLabel : collapseNavigationLabel}
              className="xr-admin-console__sidebar-collapse"
              onClick={() => {
                setSidebarCollapsed((current) => !current);
              }}
              type="button"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={18} strokeWidth={2.2} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={18} strokeWidth={2.2} />
              )}
              <span>{isSidebarCollapsed ? expandNavigationLabel : collapseNavigationLabel}</span>
            </button>
          </div>
        </aside>

        <div className="xr-admin-console__body">
          <header className="xr-admin-console__header">
            <button
              aria-controls="xr-admin-mobile-navigation"
              aria-expanded={isNavigationOpen}
              aria-label={menuLabel}
              className="xr-admin-console__menu-trigger"
              onClick={openNavigation}
              type="button"
            >
              <Menu aria-hidden="true" size={18} strokeWidth={2.25} />
              <span className="sr-only">{menuLabel}</span>
            </button>
            <a aria-label={appName} className="xr-admin-console__mobile-brand" href={brandHref}>
              <span aria-hidden="true" className="xr-admin-console__mobile-brand-mark">
                {resolvedBrandMark}
              </span>
              <span>{appName}</span>
            </a>
            <div className="xr-admin-console__header-controls">
              <ThemeSwitcher variant="menu" />
              <LanguageSwitcher variant="menu" />
              {headerTrailing}
            </div>
          </header>

          {breadcrumbs.length > 1 ? (
            <nav aria-label={breadcrumbLabel} className="xr-admin-console__breadcrumbs">
              {breadcrumbs.map((item, index) => (
                <span className="xr-admin-console__breadcrumb" key={`${item.href ?? item.label}-${index}`}>
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
                </span>
              ))}
            </nav>
          ) : null}

          <main aria-label={contentLabel} className="xr-admin-console__content" id="xr-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      {isNavigationOpen ? (
        <div
          className={cn('xr-admin-console__mobile-layer', className)}
          data-open="true"
          data-theme={uiStore?.resolvedTheme ?? 'light'}
          data-theme-preference={uiStore?.theme ?? 'system'}
        >
          <button
            aria-label={closeNavigationLabel}
            className="xr-admin-console__backdrop"
            onClick={closeNavigation}
            type="button"
          />
          <aside
            aria-label={navigationLabel}
            aria-modal="true"
            className="xr-admin-console__drawer"
            id="xr-admin-mobile-navigation"
            role="dialog"
          >
            <div className="xr-admin-console__drawer-header">
              <a aria-label={appName} className="xr-admin-console__brand" href={brandHref}>
                <span aria-hidden="true" className="xr-admin-console__brand-mark">
                  {resolvedBrandMark}
                </span>
                <span className="xr-admin-console__brand-copy">
                  <strong>{appName}</strong>
                  {brandDescription ? <small>{brandDescription}</small> : null}
                </span>
              </a>
              <button aria-label={closeNavigationLabel} onClick={closeNavigation} type="button">
                <X aria-hidden="true" size={18} strokeWidth={2.25} />
                <span className="sr-only">{closeNavigationLabel}</span>
              </button>
            </div>
            {renderNavigation('mobile')}
          </aside>
        </div>
      ) : null}
    </>
  );
});
