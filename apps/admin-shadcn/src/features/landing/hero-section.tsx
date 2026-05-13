import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  ArrowRightIcon,
  BoxesIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  LayoutDashboardIcon,
  LockKeyholeIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react'
import Link from 'next/link'

import { appPaths } from '@/config/app-paths'

const featureCards = [
  {
    icon: ServerIcon,
    title: 'NestJS API',
    description:
      'Layered modules, OpenAPI contracts, Problem Details errors, audit logs, and ETags.',
  },
  {
    icon: LayoutDashboardIcon,
    title: 'Admin dashboard',
    description:
      'Next.js App Router, typed API hooks, RBAC navigation, tables, forms, and sessions.',
  },
  {
    icon: DatabaseIcon,
    title: 'Typed persistence',
    description:
      'Drizzle schema package shared by the API with migrations and local database scripts.',
  },
]

const stackItems = [
  'NestJS 11',
  'Next.js 16',
  'React 19',
  'Drizzle ORM',
  'TanStack Query',
  'pnpm 11',
]

export function HeroSection() {
  return (
    <main id="main-content" className="min-h-dvh bg-background text-foreground">
      <section className="relative isolate overflow-hidden px-6 py-20 sm:py-28 lg:px-8">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top,theme(colors.primary/0.16),transparent_55%)]" />
        <div className="mx-auto flex max-w-6xl flex-col gap-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <Badge variant="secondary" className="gap-1.5">
                <SparklesIcon className="size-3.5" />
                Full-stack starter for serious admin apps
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
                  Nest React Boilerplate for production APIs and admin dashboards.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
                  Start with a typed NestJS backend, a polished Next.js dashboard, Drizzle
                  persistence, RBAC, auth, audit logging, and CI-friendly tooling already wired
                  together.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  render={<Link href={appPaths.auth.register.getHref()} />}
                  nativeButton={false}
                  size="lg"
                >
                  Create account
                  <ArrowRightIcon />
                </Button>
                <Button
                  render={<Link href={appPaths.dashboards.analytics.href} />}
                  nativeButton={false}
                  variant="outline"
                  size="lg"
                >
                  View dashboard
                </Button>
                <Button
                  render={<Link href={appPaths.auth.login.getHref()} />}
                  nativeButton={false}
                  variant="ghost"
                  size="lg"
                >
                  Sign in
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {stackItems.map((item) => (
                  <span key={item} className="rounded-full border bg-card px-3 py-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <Card className="border-primary/20 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BoxesIcon className="size-5 text-primary" />
                  Monorepo health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  ['API contract', 'OpenAPI types shared with React'],
                  ['Access control', 'JWT, OAuth, RBAC, session tools'],
                  ['Persistence', 'PostgreSQL, Redis, Drizzle migrations'],
                  ['Tooling', 'Turborepo, oxlint, oxfmt, Vitest, CI'],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-3 rounded-lg border bg-background/60 p-4">
                    <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <div className="font-medium">{title}</div>
                      <div className="text-sm text-muted-foreground">{description}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="bg-card/70">
                <CardHeader>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {description}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 rounded-2xl border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Auth ready', LockKeyholeIcon],
                ['RBAC guarded', ShieldCheckIcon],
                ['API typed', ServerIcon],
                ['DB backed', DatabaseIcon],
              ] as const
            ).map(([label, Icon]) => (
              <div key={label} className="flex items-center gap-3 text-sm font-medium">
                <Icon className="size-4 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
